const fs = require('fs');
const path = require('path');
const store = require('./store');
const { LIFECYCLE_FILE, ARCHIVE_DIR, EVENT_SCOPED_FILES } = require('./config');
const { logAudit } = require('./audit');

// Event lifecycle state machine:
//   OPEN --close--> CLOSED --archive--> ARCHIVED --createNew--> OPEN (new event)
// "Open" is also allowed from CLOSED (re-opening after an accidental close -
// a correction mechanism, same spirit as race-status's Reset in 1.1-C).
// ARCHIVED is otherwise terminal until Create New Event: this forces every
// event's data to be safely archived before it can ever be cleared, so
// historical data is never silently lost (per the approved 1.1 plan).
//
// `epoch` is a generation counter bumped on every transition. It exists
// because "is the event currently OPEN" isn't enough to reject a stale
// write: after a full close -> archive -> createNew cycle, state is OPEN
// again, but it's a *different* OPEN than the one a slow in-flight request
// observed before the cycle started. Comparing epochs (not just state) is
// what lets a request tell "still my event" apart from "a new event that
// happens to also be OPEN".
const EVENT_SCOPE_LOCK = 'event-scope';

function readLifecycle() {
  const lifecycle = store.readJSON(LIFECYCLE_FILE, { state: 'OPEN', changedBy: null, changedAt: null, epoch: 1 });
  if (typeof lifecycle.epoch !== 'number') lifecycle.epoch = 1; // upgrade path for pre-epoch event-lifecycle.json
  return lifecycle;
}

function getLifecycleState() {
  return readLifecycle();
}

// Fast, unlocked fail-fast check called at the top of every event-scoped
// mutation route, before any body parsing/validation work. This alone is
// NOT the enforcement point - a slow request can still pass this and have
// the event archived/cleared before it actually writes. Its real job here
// is (a) reject obviously-closed requests immediately without wasted work,
// and (b) hand back the epoch this request observed, to be re-checked at
// commit time by runIfEventStillOpen(). Read-only views (rankings,
// leaderboard, participant lists) are never gated by lifecycle state.
function requireOpenEvent(res, sendJSON) {
  const lifecycle = readLifecycle();
  if (lifecycle.state !== 'OPEN') {
    sendJSON(res, 400, {
      error: `Acara sedang ${lifecycle.state === 'CLOSED' ? 'ditutup' : 'diarkibkan'} - tindakan ini tidak dibenarkan`,
      lifecycleState: lifecycle.state,
    });
    return { ok: false };
  }
  return { ok: true, epoch: lifecycle.epoch };
}

// The actual enforcement point. Call this immediately before the
// event-scoped store.update() write(s) a route needs to make, wrapping them
// in `fn`. `capturedEpoch` is whatever requireOpenEvent() returned earlier
// in the same request.
//
// Acquires the same EVENT_SCOPE_LOCK that archiveEventData/
// clearEventScopedData (via transitionLifecycle below) also acquire before
// touching any event-scoped file or bumping the epoch - so a mutation and a
// lifecycle transition can never interleave. Whichever one gets the lock
// first runs to completion before the other even re-reads the state. If by
// the time this request's turn comes the state isn't OPEN anymore, or the
// epoch has moved on (even if it cycled back to OPEN for a new event), the
// write is rejected before touching disk - this is what closes the race
// the architecture review flagged as a Blocker.
function runIfEventStillOpen(capturedEpoch, fn) {
  return store.withLock(EVENT_SCOPE_LOCK, async () => {
    const fresh = readLifecycle();
    if (fresh.state !== 'OPEN' || fresh.epoch !== capturedEpoch) {
      return {
        ok: false,
        error: 'Acara telah berubah keadaan semasa permintaan ini diproses - sila cuba semula',
        lifecycleState: fresh.state,
      };
    }
    const result = await fn();
    return { ok: true, result };
  });
}

function archiveEventData(actor) {
  const lifecycle = readLifecycle();
  const timestamp = Date.now();
  const archivePath = path.join(ARCHIVE_DIR, String(timestamp));
  fs.mkdirSync(archivePath, { recursive: true });
  for (const [name, filePath] of Object.entries(EVENT_SCOPED_FILES)) {
    const data = store.readJSON(filePath, name === 'raceStatus' || name === 'counters' ? {} : []);
    fs.writeFileSync(path.join(archivePath, `${name}.json`), JSON.stringify(data, null, 2));
  }
  fs.writeFileSync(
    path.join(archivePath, 'meta.json'),
    JSON.stringify({ archivedAt: timestamp, archivedBy: actor }, null, 2)
  );
  return archivePath;
}

function clearEventScopedData() {
  for (const [name, filePath] of Object.entries(EVENT_SCOPED_FILES)) {
    const empty = name === 'raceStatus' || name === 'counters' ? {} : [];
    fs.writeFileSync(filePath, JSON.stringify(empty, null, 2));
  }
}

function validateTransition(action, state) {
  if (action === 'open') {
    if (state !== 'CLOSED' && state !== 'OPEN') {
      return `Tidak boleh membuka acara daripada keadaan ${state}`;
    }
  } else if (action === 'close') {
    if (state !== 'OPEN') {
      return `Tidak boleh menutup acara daripada keadaan ${state}`;
    }
  } else if (action === 'archive') {
    if (state !== 'CLOSED') {
      return 'Acara mesti ditutup dahulu sebelum diarkibkan';
    }
  } else if (action === 'createNew') {
    if (state !== 'ARCHIVED') {
      return 'Acara semasa mesti diarkibkan dahulu sebelum acara baharu boleh dimulakan';
    }
  } else {
    return 'Invalid lifecycle action';
  }
  return null;
}

// action: 'open' | 'close' | 'archive' | 'createNew'
// Returns { ok: true, state } on success, or { ok: false, error } on an
// invalid transition (caller sends the appropriate HTTP response).
//
// archive/createNew are the two transitions that actually touch
// EVENT_SCOPED_FILES, so they acquire EVENT_SCOPE_LOCK - the same lock
// runIfEventStillOpen() acquires before any event-scoped mutation commits.
// This guarantees the two can never interleave: whichever gets the lock
// first (a pending mutation, or this transition) runs to completion,
// including the epoch bump below, before the other side re-reads state.
// open/close never touch those files, so they skip the lock entirely and
// just bump the epoch as part of their existing LIFECYCLE_FILE write - that
// alone is enough to invalidate any request that captured the old epoch.
async function transitionLifecycle(action, actorUser) {
  const current = readLifecycle();
  const actor = actorUser.username;
  const earlyError = validateTransition(action, current.state);
  if (earlyError) return { ok: false, error: earlyError };

  if (action === 'archive' || action === 'createNew') {
    const outcome = await store.withLock(EVENT_SCOPE_LOCK, async () => {
      const fresh = readLifecycle();
      // Re-validate inside the lock - guards against a double-submitted
      // click of the same action racing itself.
      const error = validateTransition(action, fresh.state);
      if (error) return { ok: false, error };

      let archivePath = null;
      if (action === 'archive') archivePath = archiveEventData(actor);
      if (action === 'createNew') clearEventScopedData();

      const nextState = action === 'archive' ? 'ARCHIVED' : 'OPEN';
      const record = { state: nextState, changedBy: actor, changedAt: Date.now(), epoch: fresh.epoch + 1 };
      await store.update(LIFECYCLE_FILE, record, () => ({ data: record, result: null }));

      logAudit({
        actor,
        actorRole: actorUser.role,
        action: `lifecycle.${action}`,
        target: nextState,
        result: 'success',
        detail: archivePath ? `archived to ${archivePath}` : null,
      });

      return { ok: true, state: record, archivePath };
    });
    return outcome;
  }

  const nextState = { open: 'OPEN', close: 'CLOSED' }[action];
  const record = { state: nextState, changedBy: actor, changedAt: Date.now(), epoch: current.epoch + 1 };
  await store.update(LIFECYCLE_FILE, record, () => ({ data: record, result: null }));

  logAudit({
    actor,
    actorRole: actorUser.role,
    action: `lifecycle.${action}`,
    target: nextState,
    result: 'success',
    detail: null,
  });

  return { ok: true, state: record };
}

// 1.4: exported so lib/backup.js's restore can acquire this SAME lock
// around its multi-file copy - otherwise a restore could interleave with an
// in-flight event-scoped write or an archive/create-new transition. No
// change to any lifecycle logic above; this just exposes the existing
// constant.
module.exports = { getLifecycleState, requireOpenEvent, runIfEventStillOpen, transitionLifecycle, EVENT_SCOPE_LOCK };
