const store = require('../lib/store');
const { STUDENTS_FILE, RESULTS_FILE, CHECKINS_FILE, RACE_STATUS_FILE, CATEGORIES } = require('../lib/config');

function register(router) {
  router.add('GET', '/api/results', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, store.readJSON(RESULTS_FILE, []));
  });

  // Manual override for edge cases (timer malfunction, backup stopwatch, etc).
  // Not used by the main Finish Recording UI - that flow always goes through
  // POST /api/results/finish below, per RULES.md: teachers never calculate or
  // enter finish time manually.
  router.add('POST', '/api/results', async (req, res, { sendJSON, parseBody }) => {
    const body = await parseBody(req);
    const { bib, time } = body;
    if (!bib || typeof time !== 'number' || !(time > 0)) {
      return sendJSON(res, 400, { error: 'bib and a valid time (seconds) are required' });
    }
    const students = store.readJSON(STUDENTS_FILE, []);
    if (!students.find((s) => s.bib === bib)) {
      return sendJSON(res, 404, { error: 'Student (bib) not found' });
    }
    await store.update(RESULTS_FILE, [], (results) => {
      const existing = results.find((r) => r.bib === bib);
      if (existing) {
        existing.time = time;
        existing.recordedAt = Date.now();
        return { data: results, result: null };
      }
      return { data: [...results, { bib, time, recordedAt: Date.now() }], result: null };
    });
    sendJSON(res, 200, { ok: true });
  });

  // The real Finish Recording flow: teacher searches a participant and
  // presses Finish - no time is ever typed. The server derives the finish
  // time from that participant's category race clock (see routes/race.js).
  // Guards, per RULES.md:
  //  - the bib must exist
  //  - the participant must be checked in (routes/checkins.js)
  //  - that category's race must have been started (routes/race.js)
  // Idempotent like check-in/race-start: pressing Finish again for an
  // already-finished bib returns the original result untouched, rather than
  // overwriting a real finish with a later, meaningless timestamp.
  router.add('POST', '/api/results/finish', async (req, res, { sendJSON, parseBody }) => {
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

    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    const categoryStatus = raceStatus[student.categoryCode];
    if (!categoryStatus || !categoryStatus.startTime) {
      const category = CATEGORIES.find((c) => c.code === student.categoryCode);
      return sendJSON(res, 400, {
        error: `Perlumbaan kategori ${category ? category.label : student.categoryCode} belum bermula`,
      });
    }

    const finishResult = await store.update(RESULTS_FILE, [], (results) => {
      const existing = results.find((r) => r.bib === bib);
      if (existing) return { data: results, result: existing };
      const now = Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((now - categoryStatus.startTime) / 1000));
      const record = { bib, time: elapsedSeconds, recordedAt: now };
      return { data: [...results, record], result: record };
    });

    sendJSON(res, 201, { ...finishResult, student });
  });

  router.add('DELETE', '/api/results/:bib', async (req, res, { params, sendJSON }) => {
    const { bib } = params;
    await store.update(RESULTS_FILE, [], (results) => ({
      data: results.filter((r) => r.bib !== bib),
      result: null,
    }));
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { register };
