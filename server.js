const http = require('http');
const os = require('os');

const { PUBLIC_DIR } = require('./lib/config');
const { Router } = require('./lib/router');
const { sendJSON, parseBody, parseRawBody, serveStatic } = require('./lib/http-helpers');
const initData = require('./lib/init-data');

const PORT = process.env.PORT || 3000;

// Race-day reliability net: an unexpected error must never take the whole
// server down mid-event. Log it and keep serving.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server kept alive):', err);
});

const router = new Router();
require('./routes/schools').register(router);
require('./routes/categories').register(router);
require('./routes/students').register(router);
require('./routes/checkins').register(router);
require('./routes/race').register(router);
require('./routes/results').register(router);
require('./routes/rankings').register(router);
require('./routes/scoring').register(router);

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
server.listen(PORT, () => {
  console.log(`Merentas Desa system running:`);
  console.log(`  - Local:   http://localhost:${PORT}`);
  const lanAddresses = getLanAddresses();
  if (lanAddresses.length) {
    lanAddresses.forEach((ip) => console.log(`  - Network: http://${ip}:${PORT}`));
    console.log(`\nOther devices on the same WiFi (phone, tablet, another laptop) can open the "Network" address above in their browser.`);
  } else {
    console.log(`  - Network: no LAN address detected (check WiFi/network connection)`);
  }
});
