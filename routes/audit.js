const { requireAuth } = require('../lib/auth');
const { readAuditLog } = require('../lib/audit');

function register(router) {
  // Admin-only. Optional query filters: ?actor=TK&action=student.create
  router.add('GET', '/api/audit-log', async (req, res, { query, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'audit.view');
    if (!user) return;
    const actor = query.get('actor') || undefined;
    const action = query.get('action') || undefined;
    const entries = readAuditLog({ actor, action });
    // Newest first - that's what an admin reviewing "what just happened" wants.
    sendJSON(res, 200, [...entries].reverse());
  });
}

module.exports = { register };
