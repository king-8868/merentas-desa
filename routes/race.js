const store = require('../lib/store');
const { CATEGORIES, RACE_STATUS_FILE, STUDENTS_FILE, RESULTS_FILE } = require('../lib/config');
const { requireAuth } = require('../lib/auth');
const { requireOpenEvent, runIfEventStillOpen } = require('../lib/lifecycle');
const { logAudit } = require('../lib/audit');

// Race state machine per category:
//   NOT_STARTED -> RUNNING -> FINISHED
// FINISHED is terminal within race control - once a category's race is
// declared finished, its clock and results are locked. A full category
// do-over is an Event Archive / Create New Event concern (out of scope here).
function deriveState(entry) {
  if (!entry || !entry.startTime) return 'NOT_STARTED';
  if (entry.finishedAt) return 'FINISHED';
  return 'RUNNING';
}

function buildStatus(raceStatus) {
  return CATEGORIES.map((cat) => {
    const entry = raceStatus[cat.code] || {};
    const state = deriveState(entry);
    const started = state === 'RUNNING' || state === 'FINISHED'; // kept for backward compatibility
    const clockEnd = state === 'FINISHED' ? entry.finishedAt : Date.now();
    return {
      code: cat.code,
      label: cat.label,
      state,
      started,
      startTime: entry.startTime || null,
      finishedAt: entry.finishedAt || null,
      elapsedSeconds: started ? Math.floor((clockEnd - entry.startTime) / 1000) : null,
    };
  });
}

function register(router) {
  router.add('GET', '/api/race-status', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'race.view');
    if (!user) return;
    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    sendJSON(res, 200, buildStatus(raceStatus));
  });

  // Idempotent: pressing Start on an already-started category leaves the
  // original startTime untouched. Overwriting it on a second click would
  // silently invalidate every finish time already computed against the
  // original clock - exactly the kind of race-day data corruption the
  // write-safety design in lib/store.js exists to prevent.
  router.add('POST', '/api/race-status/:code/start', async (req, res, { params, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'race.start');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;
    const category = CATEGORIES.find((c) => c.code === params.code);
    if (!category) return sendJSON(res, 404, { error: 'Invalid category' });

    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(RACE_STATUS_FILE, {}, (raceStatus) => {
        const entry = raceStatus[params.code];
        if (entry && entry.startTime) {
          return { data: raceStatus, result: null };
        }
        return {
          data: { ...raceStatus, [params.code]: { startTime: Date.now() } },
          result: null,
        };
      })
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }

    logAudit({ actor: user.username, actorRole: user.role, action: 'race.start', target: params.code, result: 'success' });
    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    sendJSON(res, 200, buildStatus(raceStatus).find((s) => s.code === params.code));
  });

  // Marks a category's race as officially finished. Only valid from RUNNING
  // - a race that never started can't be finished. Idempotent once FINISHED
  // (calling it again is a no-op, not an error). After this, routes/results.js
  // refuses to create, change, or delete results for this category.
  router.add('POST', '/api/race-status/:code/finish', async (req, res, { params, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'race.finish');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;
    const category = CATEGORIES.find((c) => c.code === params.code);
    if (!category) return sendJSON(res, 404, { error: 'Invalid category' });

    let errorMsg = null;
    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(RACE_STATUS_FILE, {}, (raceStatus) => {
        const entry = raceStatus[params.code];
        const state = deriveState(entry);
        if (state === 'FINISHED') return { data: raceStatus, result: null };
        if (state === 'NOT_STARTED') {
          errorMsg = `Perlumbaan kategori ${category.label} belum bermula - tidak boleh ditamatkan`;
          return { data: raceStatus, result: null };
        }
        return {
          data: { ...raceStatus, [params.code]: { ...entry, finishedAt: Date.now() } },
          result: null,
        };
      })
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }
    if (errorMsg) return sendJSON(res, 400, { error: errorMsg });

    logAudit({ actor: user.username, actorRole: user.role, action: 'race.finish', target: params.code, result: 'success' });
    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    sendJSON(res, 200, buildStatus(raceStatus).find((s) => s.code === params.code));
  });

  // Deliberate correction action (e.g. wrong category started by mistake).
  // Blocked once results exist for this category - clearing the start time
  // while results still reference it would orphan them against a deleted
  // clock (a conflicting-timestamp data integrity violation). Also blocked
  // once FINISHED - that's a terminal state within race control.
  router.add('POST', '/api/race-status/:code/reset', async (req, res, { params, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'race.reset');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;
    const category = CATEGORIES.find((c) => c.code === params.code);
    if (!category) return sendJSON(res, 404, { error: 'Invalid category' });

    const currentRaceStatus = store.readJSON(RACE_STATUS_FILE, {});
    const state = deriveState(currentRaceStatus[params.code]);
    if (state === 'FINISHED') {
      return sendJSON(res, 400, {
        error: `Perlumbaan kategori ${category.label} telah tamat - tidak boleh reset`,
      });
    }

    const students = store.readJSON(STUDENTS_FILE, []);
    const results = store.readJSON(RESULTS_FILE, []);
    const categoryBibs = new Set(students.filter((s) => s.categoryCode === params.code).map((s) => s.bib));
    const hasResults = results.some((r) => categoryBibs.has(r.bib));
    if (hasResults) {
      return sendJSON(res, 400, {
        error: `Terdapat keputusan direkodkan untuk kategori ${category.label} - padam keputusan tersebut dahulu sebelum reset`,
      });
    }

    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(RACE_STATUS_FILE, {}, (raceStatus) => {
        const next = { ...raceStatus };
        delete next[params.code];
        return { data: next, result: null };
      })
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }

    logAudit({ actor: user.username, actorRole: user.role, action: 'race.reset', target: params.code, result: 'success' });
    const updatedRaceStatus = store.readJSON(RACE_STATUS_FILE, {});
    sendJSON(res, 200, buildStatus(updatedRaceStatus).find((s) => s.code === params.code));
  });
}

module.exports = { register, buildStatus, deriveState };
