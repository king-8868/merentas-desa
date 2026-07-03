const os = require('os');
const { requireAuth } = require('../lib/auth');

const PORT = process.env.PORT || 3000;
const SYSTEM_NAME = 'Merentas Desa Management System';
const CURRENT_EVENT_LINE1 = 'KEJOHANAN MERENTAS DESA SEMPENA HARI KEBANGSAAN 2026';
const CURRENT_EVENT_LINE2 = 'PERINGKAT SEKOLAH ZON LUAR BANDAR';
const DEVELOPER = 'William Ngu';
const VERSION = '1.3';

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

    sendJSON(res, 200, {
      systemName: SYSTEM_NAME,
      currentEvent: [CURRENT_EVENT_LINE1, CURRENT_EVENT_LINE2],
      developer: DEVELOPER,
      version: VERSION,
      serverStatus: 'running',
      dataStoreStatus: 'healthy',
      localUrl: `http://localhost:${PORT}`,
      networkUrls: getLanAddresses().map((ip) => `http://${ip}:${PORT}`),
      currentUser: {
        username: user.username,
        role: user.role,
        schoolCode: user.schoolCode,
      },
    });
  });
}

module.exports = { register };
