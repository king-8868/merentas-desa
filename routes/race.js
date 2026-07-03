const store = require('../lib/store');
const { CATEGORIES, RACE_STATUS_FILE } = require('../lib/config');

function buildStatus(raceStatus) {
  return CATEGORIES.map((cat) => {
    const entry = raceStatus[cat.code] || {};
    const started = !!entry.startTime;
    return {
      code: cat.code,
      label: cat.label,
      started,
      startTime: entry.startTime || null,
      elapsedSeconds: started ? Math.floor((Date.now() - entry.startTime) / 1000) : null,
    };
  });
}

function register(router) {
  router.add('GET', '/api/race-status', async (req, res, { sendJSON }) => {
    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    sendJSON(res, 200, buildStatus(raceStatus));
  });

  // Idempotent: pressing Start on an already-started category leaves the
  // original startTime untouched. Overwriting it on a second click would
  // silently invalidate every finish time already computed against the
  // original clock - exactly the kind of race-day data corruption the
  // write-safety design in lib/store.js exists to prevent.
  router.add('POST', '/api/race-status/:code/start', async (req, res, { params, sendJSON }) => {
    const category = CATEGORIES.find((c) => c.code === params.code);
    if (!category) return sendJSON(res, 404, { error: 'Invalid category' });

    await store.update(RACE_STATUS_FILE, {}, (raceStatus) => {
      if (raceStatus[params.code] && raceStatus[params.code].startTime) {
        return { data: raceStatus, result: null };
      }
      return {
        data: { ...raceStatus, [params.code]: { startTime: Date.now() } },
        result: null,
      };
    });

    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    sendJSON(res, 200, buildStatus(raceStatus).find((s) => s.code === params.code));
  });

  // Deliberate correction action (e.g. wrong category started by mistake).
  // Clears the start time so the category can be started again. The UI
  // must confirm before calling this - it is destructive to the current timer.
  router.add('POST', '/api/race-status/:code/reset', async (req, res, { params, sendJSON }) => {
    const category = CATEGORIES.find((c) => c.code === params.code);
    if (!category) return sendJSON(res, 404, { error: 'Invalid category' });

    await store.update(RACE_STATUS_FILE, {}, (raceStatus) => {
      const next = { ...raceStatus };
      delete next[params.code];
      return { data: next, result: null };
    });

    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    sendJSON(res, 200, buildStatus(raceStatus).find((s) => s.code === params.code));
  });
}

module.exports = { register, buildStatus };
