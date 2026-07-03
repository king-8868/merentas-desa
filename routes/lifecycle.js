const { requireAuth } = require('../lib/auth');
const { getLifecycleState, transitionLifecycle } = require('../lib/lifecycle');

function register(router) {
  // Any logged-in role can see the current state - a Race Official or
  // School Manager should be able to tell *why* their action was just
  // rejected (event closed/archived), not just that it was.
  router.add('GET', '/api/lifecycle', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, null);
    if (!user) return;
    sendJSON(res, 200, getLifecycleState());
  });

  router.add('POST', '/api/lifecycle/open', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'lifecycle.transition');
    if (!user) return;
    const result = await transitionLifecycle('open', user);
    if (!result.ok) return sendJSON(res, 400, { error: result.error });
    sendJSON(res, 200, result.state);
  });

  router.add('POST', '/api/lifecycle/close', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'lifecycle.transition');
    if (!user) return;
    const result = await transitionLifecycle('close', user);
    if (!result.ok) return sendJSON(res, 400, { error: result.error });
    sendJSON(res, 200, result.state);
  });

  // Snapshots all event-scoped data (students/results/checkins/race-status/
  // counters) into data/archive/<timestamp>/ before anything can be cleared -
  // see lib/lifecycle.js. Only valid from CLOSED.
  router.add('POST', '/api/lifecycle/archive', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'lifecycle.transition');
    if (!user) return;
    const result = await transitionLifecycle('archive', user);
    if (!result.ok) return sendJSON(res, 400, { error: result.error });
    sendJSON(res, 200, { ...result.state, archivePath: result.archivePath });
  });

  // Clears event-scoped data and reopens for a new event. Only valid from
  // ARCHIVED - the previous event's data is never lost, only ever moved to
  // an archive folder first.
  router.add('POST', '/api/lifecycle/create-new', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'lifecycle.transition');
    if (!user) return;
    const result = await transitionLifecycle('createNew', user);
    if (!result.ok) return sendJSON(res, 400, { error: result.error });
    sendJSON(res, 200, result.state);
  });
}

module.exports = { register };
