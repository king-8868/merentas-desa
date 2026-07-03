const store = require('../lib/store');
const { STUDENTS_FILE, RESULTS_FILE, CHECKINS_FILE, RACE_STATUS_FILE, CATEGORIES } = require('../lib/config');
const { deriveState } = require('./race');
const { requireAuth } = require('../lib/auth');
const { requireOpenEvent, runIfEventStillOpen } = require('../lib/lifecycle');
const { logAudit } = require('../lib/audit');

function getCategoryStatus(categoryCode) {
  const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
  const entry = raceStatus[categoryCode];
  return { entry, state: deriveState(entry) };
}

function categoryLabel(categoryCode) {
  const category = CATEGORIES.find((c) => c.code === categoryCode);
  return category ? category.label : categoryCode;
}

function register(router) {
  router.add('GET', '/api/results', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, store.readJSON(RESULTS_FILE, []));
  });

  // Manual override for edge cases (timer malfunction, backup stopwatch, etc).
  // Not used by the main Finish Recording UI - that flow always goes through
  // POST /api/results/finish below, per RULES.md: teachers never calculate or
  // enter finish time manually.
  // Create-only: never silently overwrites an existing timestamp. Correcting
  // a mistake requires DELETE /api/results/:bib first, then a fresh POST -
  // an explicit two-step action instead of a silent single-step overwrite.
  router.add('POST', '/api/results', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'result.manual');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const body = await parseBody(req);
    const { bib, time } = body;
    if (!bib || typeof time !== 'number' || !(time > 0)) {
      return sendJSON(res, 400, { error: 'bib and a valid time (seconds) are required' });
    }
    const students = store.readJSON(STUDENTS_FILE, []);
    const student = students.find((s) => s.bib === bib);
    if (!student) {
      return sendJSON(res, 404, { error: 'Student (bib) not found' });
    }

    const { state } = getCategoryStatus(student.categoryCode);
    if (state === 'FINISHED') {
      return sendJSON(res, 400, {
        error: `Perlumbaan kategori ${categoryLabel(student.categoryCode)} telah tamat - keputusan tidak boleh diubah`,
      });
    }

    const existing = store.readJSON(RESULTS_FILE, []).find((r) => r.bib === bib);
    if (existing) {
      return sendJSON(res, 400, {
        error: 'Keputusan sudah wujud untuk peserta ini - padam keputusan sedia ada dahulu sebelum merekod semula',
      });
    }

    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(RESULTS_FILE, [], (results) => ({
        data: [...results, { bib, time, recordedAt: Date.now() }],
        result: null,
      }))
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'result.manual',
      target: bib,
      result: 'success',
      detail: `time=${time}`,
    });
    sendJSON(res, 200, { ok: true });
  });

  // The real Finish Recording flow: teacher searches a participant and
  // presses Finish - no time is ever typed. The server derives the finish
  // time from that participant's category race clock (see routes/race.js).
  // Guards, per RULES.md:
  //  - the bib must exist
  //  - the participant must be checked in (routes/checkins.js)
  //  - that category's race must be RUNNING (not NOT_STARTED, not FINISHED)
  // Idempotent like check-in/race-start: pressing Finish again for an
  // already-finished bib returns the original result untouched, rather than
  // overwriting a real finish with a later, meaningless timestamp.
  router.add('POST', '/api/results/finish', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'result.finish');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const body = await parseBody(req);
    const { bib } = body;
    if (!bib) {
      return sendJSON(res, 400, { error: 'bib is required' });
    }

    const students = store.readJSON(STUDENTS_FILE, []);
    const student = students.find((s) => s.bib === bib);
    if (!student) {
      return sendJSON(res, 404, { error: 'Bib not found' });
    }

    const checkins = store.readJSON(CHECKINS_FILE, []);
    if (!checkins.find((c) => c.bib === bib)) {
      return sendJSON(res, 400, { error: 'Peserta belum daftar masuk - tidak boleh direkodkan tamat' });
    }

    const { entry: categoryStatus, state } = getCategoryStatus(student.categoryCode);
    if (state === 'NOT_STARTED') {
      return sendJSON(res, 400, {
        error: `Perlumbaan kategori ${categoryLabel(student.categoryCode)} belum bermula`,
      });
    }
    if (state === 'FINISHED') {
      return sendJSON(res, 400, {
        error: `Perlumbaan kategori ${categoryLabel(student.categoryCode)} telah tamat - tidak boleh merekod peserta baru`,
      });
    }

    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(RESULTS_FILE, [], (results) => {
        const existing = results.find((r) => r.bib === bib);
        if (existing) return { data: results, result: existing };
        const now = Date.now();
        const elapsedSeconds = Math.max(0, Math.floor((now - categoryStatus.startTime) / 1000));
        const record = { bib, time: elapsedSeconds, recordedAt: now };
        return { data: [...results, record], result: record };
      })
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }
    const finishResult = writeOutcome.result;

    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'result.finish',
      target: bib,
      result: 'success',
      detail: `time=${finishResult.time}`,
    });
    sendJSON(res, 201, { ...finishResult, student });
  });

  // Blocked once the participant's category race is FINISHED - a recorded
  // result becomes immutable at that point (see routes/race.js's /finish).
  router.add('DELETE', '/api/results/:bib', async (req, res, { params, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'result.delete');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const { bib } = params;
    const students = store.readJSON(STUDENTS_FILE, []);
    const student = students.find((s) => s.bib === bib);
    if (student) {
      const { state } = getCategoryStatus(student.categoryCode);
      if (state === 'FINISHED') {
        return sendJSON(res, 400, {
          error: `Perlumbaan kategori ${categoryLabel(student.categoryCode)} telah tamat - keputusan tidak boleh dipadam`,
        });
      }
    }
    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(RESULTS_FILE, [], (results) => ({
        data: results.filter((r) => r.bib !== bib),
        result: null,
      }))
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'result.delete',
      target: bib,
      result: 'success',
    });
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { register };
