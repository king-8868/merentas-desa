const store = require('../lib/store');
const { SCORING_CONFIG_FILE } = require('../lib/config');
const { requireAuth } = require('../lib/auth');

function validate(body) {
  const { pointsTable, topNPerSchool } = body;
  if (!Array.isArray(pointsTable) || pointsTable.length === 0) {
    return 'pointsTable must be a non-empty array of numbers';
  }
  if (!pointsTable.every((p) => typeof p === 'number' && Number.isFinite(p) && p >= 0)) {
    return 'pointsTable entries must all be non-negative numbers';
  }
  if (!Number.isInteger(topNPerSchool) || topNPerSchool < 1) {
    return 'topNPerSchool must be a positive integer';
  }
  return null;
}

function register(router) {
  router.add('GET', '/api/scoring-config', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'scoring.view');
    if (!user) return;
    sendJSON(res, 200, store.readJSON(SCORING_CONFIG_FILE, { pointsTable: [], topNPerSchool: 5 }));
  });

  // RULES.md: "Scoring rules must be configurable. Do NOT hardcode." Editing
  // this replaces the whole config atomically - the ranking computation in
  // routes/rankings.js reads it fresh on every request, so a change here
  // takes effect immediately, no restart needed.
  router.add('PUT', '/api/scoring-config', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'scoring.update');
    if (!user) return;

    const body = await parseBody(req);
    const error = validate(body);
    if (error) return sendJSON(res, 400, { error });

    const config = { pointsTable: body.pointsTable, topNPerSchool: body.topNPerSchool };
    await store.update(SCORING_CONFIG_FILE, config, () => ({ data: config, result: null }));
    sendJSON(res, 200, config);
  });
}

module.exports = { register };
