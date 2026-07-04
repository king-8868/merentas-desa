const http = require('http');
const os = require('os');

const { PUBLIC_DIR, SYSTEM_VERSION, CURRENT_EVENT_LINE1 } = require('./lib/config');
const { Router } = require('./lib/router');
const { sendJSON, parseBody, parseRawBody, serveStatic } = require('./lib/http-helpers');
const initData = require('./lib/init-data');
const { checkIntegrity } = require('./lib/integrity');
const { startBackupScheduler, getLastBackup, isRestoreModeEnabled } = require('./lib/backup');

const PORT = process.env.PORT || 3000;
const BACKUP_INTERVAL_MINUTES = Number(process.env.BACKUP_INTERVAL_MINUTES) || 15;

// Race-day reliability net: an unexpected error must never take the whole
// server down mid-event. Log it and keep serving.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server kept alive):', err);
});

const router = new Router();
require('./routes/auth').register(router);
require('./routes/schools').register(router);
require('./routes/categories').register(router);
require('./routes/students').register(router);
require('./routes/checkins').register(router);
require('./routes/race').register(router);
require('./routes/results').register(router);
require('./routes/rankings').register(router);
require('./routes/scoring').register(router);
require('./routes/lifecycle').register(router);
require('./routes/audit').register(router);
require('./routes/users').register(router);
require('./routes/system').register(router);

const server = http.createServer(async (req, res) => {
  let urlObj;
  try {
    urlObj = new URL(req.url, `http://localhost:${PORT}`);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request');
  }
  const pathname = urlObj.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      const match = router.match(req.method, pathname);
      if (!match) return sendJSON(res, 404, { error: 'Not found' });
      return await match.handler(req, res, {
        params: match.params,
        query: urlObj.searchParams,
        sendJSON,
        parseBody,
        parseRawBody,
      });
    }
    return serveStatic(req, res, PUBLIC_DIR);
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: err.message || 'Server error' });
  }
});

// Node already binds to all network interfaces by default when no host is
// passed to listen() - this just detects and prints the LAN address(es) so
// other devices on the same WiFi (phones, tablets, other laptops) know what
// to type in their browser. No change to how the server actually listens.
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

initData();
checkIntegrity();
startBackupScheduler(BACKUP_INTERVAL_MINUTES);

server.listen(PORT, () => {
  const lastBackup = getLastBackup();
  console.log(`Merentas Desa system running:`);
  console.log(`  - Version: ${SYSTEM_VERSION}`);
  console.log(`  - Event:   ${CURRENT_EVENT_LINE1}`);
  console.log(`  - Local:   http://localhost:${PORT}`);
  const lanAddresses = getLanAddresses();
  if (lanAddresses.length) {
    lanAddresses.forEach((ip) => console.log(`  - Network: http://${ip}:${PORT}`));
    console.log(`\nOther devices on the same WiFi (phone, tablet, another laptop) can open the "Network" address above in their browser.`);
  } else {
    console.log(`  - Network: no LAN address detected (check WiFi/network connection)`);
  }
  console.log(`\nBackup: automatic snapshot every ${BACKUP_INTERVAL_MINUTES} minute(s) to /backup`);
  console.log(`  - Last backup: ${lastBackup ? new Date(lastBackup.timestamp).toLocaleString() : '(none yet - one is being taken now)'}`);

  // 1.4 safety patch: make the active data-safety boundaries visible at a
  // glance every time the server starts, not just discoverable by reading
  // code - Archive is always read-only (nothing ever writes back into
  // data/archive/ after the moment it's created), Backup is always on, and
  // Restore is off unless explicitly turned on for this run.
  console.log(`\nData boundaries:`);
  console.log(`  - Active Event:  ${CURRENT_EVENT_LINE1}`);
  console.log(`  - Archive Mode:  read-only enabled`);
  console.log(`  - Backup system: enabled`);
  console.log(`  - Restore mode:  ${isRestoreModeEnabled() ? 'ENABLED (RESTORE_MODE=enabled)' : 'disabled by default'}`);
});

// Deployment compatibility: platforms like Railway send SIGTERM before
// stopping/restarting a container (redeploys, scaling, etc.), not just
// Ctrl+C. Without handling it, the process would be killed immediately,
// potentially mid-write. server.close() stops accepting new connections and
// waits for in-flight requests (including any in-progress store.js write)
// to finish before exiting - the same "never corrupt data on shutdown"
// principle this project already applies to unexpected errors, extended to
// expected/deliberate shutdowns too. No effect on local dev - nothing sends
// these signals unless the host platform does.
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed, no in-flight requests remain.');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
