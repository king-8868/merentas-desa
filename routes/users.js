const store = require('../lib/store');
const { USERS_FILE } = require('../lib/config');
const { requireAuth, generateSalt, hashPassword } = require('../lib/auth');
const { logAudit } = require('../lib/audit');

// Never send passwordHash/salt to the client - same shape as
// routes/auth.js's publicUser(), plus the 1.3 admin-management fields.
function publicUser(user) {
  return {
    username: user.username,
    role: user.role,
    schoolCode: user.schoolCode,
    disabled: !!user.disabled,
    mustChangePassword: !!user.mustChangePassword,
    // Not tracked yet - doing so would mean writing to users.json from
    // routes/auth.js's login handler, which 1.3 was scoped to leave
    // untouched. Surfaced as null rather than guessed/omitted so the UI can
    // show "not tracked" honestly instead of implying data that isn't there.
    lastLoginAt: user.lastLoginAt || null,
  };
}

function register(router) {
  // Admin-only. Lists every account for the new User Management page.
  // Account creation reuses the existing, unmodified POST /api/auth/users -
  // this module only adds list/reset-password/enable/disable.
  router.add('GET', '/api/users', async (req, res, { sendJSON }) => {
    const admin = requireAuth(req, res, sendJSON, 'user.view');
    if (!admin) return;
    const users = store.readJSON(USERS_FILE, []);
    sendJSON(res, 200, users.map(publicUser));
  });

  // Admin sets a temporary password for another account. Same hashing path
  // as a self-service change-password (lib/auth.js's generateSalt/
  // hashPassword, unmodified) - the difference is this doesn't require
  // knowing the old password, and always forces mustChangePassword back to
  // true so the temporary password can't silently become permanent.
  router.add('POST', '/api/users/:username/reset-password', async (req, res, { params, sendJSON, parseBody }) => {
    const admin = requireAuth(req, res, sendJSON, 'user.reset-password');
    if (!admin) return;

    const body = await parseBody(req);
    const { newPassword } = body;
    if (!newPassword || String(newPassword).length < 6) {
      return sendJSON(res, 400, { error: 'Kata laluan sementara mesti sekurang-kurangnya 6 aksara' });
    }

    const users = store.readJSON(USERS_FILE, []);
    const target = users.find((u) => u.username === params.username);
    if (!target) return sendJSON(res, 404, { error: 'Pengguna tidak wujud' });

    const salt = generateSalt();
    const passwordHash = hashPassword(newPassword, salt);
    await store.update(USERS_FILE, [], (allUsers) => ({
      data: allUsers.map((u) =>
        u.username === params.username ? { ...u, salt, passwordHash, mustChangePassword: true } : u
      ),
      result: null,
    }));

    logAudit({
      actor: admin.username,
      actorRole: admin.role,
      action: 'user.reset-password',
      target: params.username,
      result: 'success',
    });
    sendJSON(res, 200, { ok: true });
  });

  // Disabling takes effect immediately: lib/auth.js's getSessionUser()
  // treats a disabled account as logged-out on its very next request, so
  // this doesn't need to separately purge data/sessions.json.
  router.add('POST', '/api/users/:username/disable', async (req, res, { params, sendJSON }) => {
    const admin = requireAuth(req, res, sendJSON, 'user.disable');
    if (!admin) return;
    if (params.username === admin.username) {
      return sendJSON(res, 400, { error: 'Anda tidak boleh melumpuhkan akaun anda sendiri' });
    }

    const users = store.readJSON(USERS_FILE, []);
    if (!users.find((u) => u.username === params.username)) {
      return sendJSON(res, 404, { error: 'Pengguna tidak wujud' });
    }

    await store.update(USERS_FILE, [], (allUsers) => ({
      data: allUsers.map((u) => (u.username === params.username ? { ...u, disabled: true } : u)),
      result: null,
    }));
    logAudit({
      actor: admin.username,
      actorRole: admin.role,
      action: 'user.disable',
      target: params.username,
      result: 'success',
    });
    sendJSON(res, 200, { ok: true });
  });

  router.add('POST', '/api/users/:username/enable', async (req, res, { params, sendJSON }) => {
    const admin = requireAuth(req, res, sendJSON, 'user.enable');
    if (!admin) return;

    const users = store.readJSON(USERS_FILE, []);
    if (!users.find((u) => u.username === params.username)) {
      return sendJSON(res, 404, { error: 'Pengguna tidak wujud' });
    }

    await store.update(USERS_FILE, [], (allUsers) => ({
      data: allUsers.map((u) => (u.username === params.username ? { ...u, disabled: false } : u)),
      result: null,
    }));
    logAudit({
      actor: admin.username,
      actorRole: admin.role,
      action: 'user.enable',
      target: params.username,
      result: 'success',
    });
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { register };
