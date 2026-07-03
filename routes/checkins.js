const store = require('../lib/store');
const { STUDENTS_FILE, CHECKINS_FILE } = require('../lib/config');

function register(router) {
  router.add('GET', '/api/checkins', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, store.readJSON(CHECKINS_FILE, []));
  });

  // Idempotent: checking in an already-checked-in bib just returns the
  // existing record (no error) - a teacher double-tapping or a barcode
  // scanner double-firing should never surface an error on race day.
  router.add('POST', '/api/checkins', async (req, res, { sendJSON, parseBody }) => {
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

    const checkin = await store.update(CHECKINS_FILE, [], (checkins) => {
      const existing = checkins.find((c) => c.bib === bib);
      if (existing) return { data: checkins, result: existing };
      const record = { bib, checkInTime: Date.now() };
      return { data: [...checkins, record], result: record };
    });
    sendJSON(res, 201, { ...checkin, student });
  });

  router.add('DELETE', '/api/checkins/:bib', async (req, res, { params, sendJSON }) => {
    const { bib } = params;
    await store.update(CHECKINS_FILE, [], (checkins) => ({
      data: checkins.filter((c) => c.bib !== bib),
      result: null,
    }));
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { register };
