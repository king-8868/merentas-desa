const os = require('os');
const { requireAuth } = require('../lib/auth');
const {
  SYSTEM_NAME,
  CURRENT_EVENT_LINE1,
  CURRENT_EVENT_LINE2,
  DEVELOPER,
  SYSTEM_VERSION,
} = require('../lib/config');
const { listBackups, getLastBackup, restoreBackup } = require('../lib/backup');

const PORT = process.env.PORT || 3000;

// Same LAN-detection approach as server.js's startup banner (kept as a
// small, self-contained duplicate here rather than importing from
// server.js, which 1.3 was scoped to leave untouched).
function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }
  return addresses;
}

function register(router) {
  router.add('GET', '/api/system-info', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'system.view');
    if (!user) return;

    const lastBackup = getLastBackup();
    sendJSON(res, 200, {
      systemName: SYSTEM_NAME,
      currentEvent: [CURRENT_EVENT_LINE1, CURRENT_EVENT_LINE2],
      developer: DEVELOPER,
      version: SYSTEM_VERSION,
      serverStatus: 'running',
      dataStoreStatus: 'healthy',
      localUrl: `http://localhost:${PORT}`,
      networkUrls: getLanAddresses().map((ip) => `http://${ip}:${PORT}`),
      currentUser: {
        username: user.username,
        role: user.role,
        schoolCode: user.schoolCode,
      },
      lastBackupAt: lastBackup ? lastBackup.timestamp : null,
    });
  });

  // 1.4: lists available disaster-recovery snapshots (see lib/backup.js) so
  // Admin can choose one to restore. Newest first.
  router.add('GET', '/api/backups', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'backup.view');
    if (!user) return;
    sendJSON(res, 200, listBackups());
  });

  // Requires an explicit { confirm: true } in the body - this is a
  // destructive action (overwrites live data/*.json), so it must never
  // happen from a bare click/request without the caller having deliberately
  // set this flag. A safety snapshot of the current state is taken
  // automatically before anything is overwritten (see restoreBackup()), so
  // even a mistaken restore can itself be undone the same way.
  router.add('POST', '/api/backups/:timestamp/restore', async (req, res, { params, sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'backup.restore');
    if (!user) return;

    const body = await parseBody(req);
    if (body.confirm !== true) {
      return sendJSON(res, 400, { error: 'Pengesahan diperlukan untuk memulihkan sandaran (confirm: true)' });
    }

    const result = await restoreBackup(params.timestamp, user);
    if (!result.ok) return sendJSON(res, 404, { error: result.error });
    sendJSON(res, 200, result);
  });
}

module.exports = { register };
