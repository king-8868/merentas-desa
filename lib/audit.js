const store = require('./store');
const { EVENT_LOG_FILE } = require('./config');

// Append-only audit trail (data/event_log.json). Every entry answers: who
// (actor/actorRole), did what (action), to what (target), when (timestamp),
// and whether it worked (result). Logging is fire-and-forget - it must never
// block or fail the real operation it's describing (matches this project's
// existing race-day reliability philosophy in server.js's uncaughtException
// handler). lib/store.js's per-file write queue still serializes concurrent
// appends correctly even though callers don't await this.
function logAudit({ actor, actorRole, action, target, result, detail }) {
  const entry = {
    timestamp: Date.now(),
    actor: actor || 'anonymous',
    actorRole: actorRole || null,
    action,
    target: target != null ? String(target) : null,
    result, // 'success' | 'denied' | 'error'
    detail: detail || null,
  };
  store
    .update(EVENT_LOG_FILE, [], (log) => ({ data: [...log, entry], result: null }))
    .catch((err) => console.error('Audit log write failed:', err));
  return entry;
}

function readAuditLog({ actor, action, since } = {}) {
  let log = store.readJSON(EVENT_LOG_FILE, []);
  if (actor) log = log.filter((e) => e.actor === actor);
  if (action) log = log.filter((e) => e.action === action);
  if (since) log = log.filter((e) => e.timestamp >= since);
  return log;
}

module.exports = { logAudit, readAuditLog };
