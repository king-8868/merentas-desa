const os = require('os');
const store = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { logAudit } = require('../lib/audit');
const {
  SYSTEM_NAME,
  DEVELOPER,
  SYSTEM_VERSION,
  EVENT_CONFIG_FILE,
  SEED_EVENT_CONFIG,
} = require('../lib/config');
const { listBackups, getLastBackup, restoreBackup, isRestoreModeEnabled } = require('../lib/backup');

function readEventConfig() {
  return store.readJSON(EVENT_CONFIG_FILE, SEED_EVENT_CONFIG);
}

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
    const eventConfig = readEventConfig();
    sendJSON(res, 200, {
      systemName: SYSTEM_NAME,
      currentEvent: [eventConfig.titleLine1, eventConfig.titleLine2],
      eventYear: eventConfig.year,
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
      archiveMode: 'read-only',
      backupSystemEnabled: true,
      restoreModeEnabled: isRestoreModeEnabled(),
    });
  });

  // Usability patch: event title/year, previously hardcoded on every page.
  // Public/unauthenticated - the leaderboard (no login) needs the same
  // title the authenticated pages show, same reasoning as GET /api/schools.
  router.add('GET', '/api/event-config', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, readEventConfig());
  });

  router.add('PUT', '/api/event-config', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'event.update');
    if (!user) return;

    const body = await parseBody(req);
    const titleLine1 = String(body.titleLine1 || '').trim();
    const titleLine2 = String(body.titleLine2 || '').trim();
    const year = Number(body.year);
    if (!titleLine1) {
      return sendJSON(res, 400, { error: 'Baris pertama tajuk acara diperlukan' });
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return sendJSON(res, 400, { error: 'Tahun mesti nombor sah (2000-2100)' });
    }

    // v1.9.0: venue/activityStartDate/activityEndDate for the Document
    // Generator (routes/documents.js). All three are optional here (an
    // Admin can still save the title/year before venue/dates are decided)
    // - it's routes/documents.js that refuses to generate a PDF while any
    // of them is still empty, not this save endpoint. <input type="date">
    // always sends YYYY-MM-DD, so that's the one format accepted when a
    // value is actually provided.
    const venue = String(body.venue || '').trim();
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
    const activityStartDate = String(body.activityStartDate || '').trim();
    const activityEndDate = String(body.activityEndDate || '').trim();
    if (activityStartDate && !isoDatePattern.test(activityStartDate)) {
      return sendJSON(res, 400, { error: 'Tarikh mula tidak sah (format YYYY-MM-DD)' });
    }
    if (activityEndDate && !isoDatePattern.test(activityEndDate)) {
      return sendJSON(res, 400, { error: 'Tarikh tamat tidak sah (format YYYY-MM-DD)' });
    }
    if (activityStartDate && activityEndDate && activityEndDate < activityStartDate) {
      return sendJSON(res, 400, { error: 'Tarikh tamat tidak boleh lebih awal daripada tarikh mula' });
    }

    const config = { titleLine1, titleLine2, year, venue, activityStartDate, activityEndDate };
    await store.update(EVENT_CONFIG_FILE, SEED_EVENT_CONFIG, () => ({ data: config, result: null }));
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'event.update',
      target: null,
      result: 'success',
      detail: `titleLine1="${titleLine1}", titleLine2="${titleLine2}", year=${year}`,
    });
    sendJSON(res, 200, config);
  });

  // 1.4: lists available disaster-recovery snapshots (see lib/backup.js) so
  // Admin can choose one to restore. Newest first.
  router.add('GET', '/api/backups', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'backup.view');
    if (!user) return;
    sendJSON(res, 200, listBackups());
  });

  // Disabled unless the server was started with RESTORE_MODE=enabled (see
  // lib/backup.js) - restore is a "break glass" action, not something that
  // should be silently reachable during normal race-day operation.
  //
  // Requires an explicit { confirm: true, scope: 'active', timestamp } in
  // the body, where `timestamp` must match the URL param - this is a
  // destructive action (overwrites live data/*.json, i.e. the active
  // event), so it must never happen from a bare click/request without the
  // caller having deliberately confirmed both that they intend to restore
  // AND what they're about to overwrite. Requiring the timestamp twice
  // (URL + body) guards against a stale confirmation dialog silently firing
  // against the wrong backup entry. A safety snapshot of the current state
  // is taken automatically before anything is overwritten (see
  // restoreBackup()), so even a mistaken restore can itself be undone the
  // same way.
  router.add('POST', '/api/backups/:timestamp/restore', async (req, res, { params, sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'backup.restore');
    if (!user) return;

    const body = await parseBody(req);
    if (body.confirm !== true) {
      return sendJSON(res, 400, { error: 'Pengesahan diperlukan untuk memulihkan sandaran (confirm: true)' });
    }
    if (String(body.timestamp) !== String(params.timestamp)) {
      return sendJSON(res, 400, { error: 'Cap masa pengesahan tidak sepadan dengan sandaran yang dipilih' });
    }

    const result = await restoreBackup(params.timestamp, body.scope, user);
    if (!result.ok) {
      const status = /dilumpuhkan/.test(result.error) ? 403 : /tidak sah|tidak sepadan/.test(result.error) ? 400 : 404;
      return sendJSON(res, status, { error: result.error });
    }
    sendJSON(res, 200, { ...result, scope: 'active', warning: 'Data acara AKTIF semasa telah ditimpa.' });
  });
}

module.exports = { register };
