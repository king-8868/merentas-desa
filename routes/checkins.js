const store = require('../lib/store');
const { STUDENTS_FILE, CHECKINS_FILE } = require('../lib/config');
const { requireAuth } = require('../lib/auth');
const { requireOpenEvent, runIfEventStillOpen } = require('../lib/lifecycle');
const { logAudit } = require('../lib/audit');

function register(router) {
  router.add('GET', '/api/checkins', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'checkin.view');
    if (!user) return;
    sendJSON(res, 200, store.readJSON(CHECKINS_FILE, []));
  });

  // Idempotent: checking in an already-checked-in bib just returns the
  // existing record (no error) - a teacher double-tapping or a barcode
  // scanner double-firing should never surface an error on race day.
  router.add('POST', '/api/checkins', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'checkin.create');
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

    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(CHECKINS_FILE, [], (checkins) => {
        const existing = checkins.find((c) => c.bib === bib);
        if (existing) return { data: checkins, result: existing };
        const record = { bib, checkInTime: Date.now() };
        return { data: [...checkins, record], result: record };
      })
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'checkin',
      target: bib,
      result: 'success',
    });
    sendJSON(res, 201, { ...writeOutcome.result, student });
  });

  router.add('DELETE', '/api/checkins/:bib', async (req, res, { params, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'checkin.delete');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const { bib } = params;
    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, () =>
      store.update(CHECKINS_FILE, [], (checkins) => ({
        data: checkins.filter((c) => c.bib !== bib),
        result: null,
      }))
    );
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'checkin.undo',
      target: bib,
      result: 'success',
    });
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { register };
