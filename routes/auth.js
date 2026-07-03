const store = require('../lib/store');
const { USERS_FILE, SESSIONS_FILE } = require('../lib/config');
const {
  verifyPassword,
  generateSessionToken,
  hashPassword,
  generateSalt,
  getSessionUser,
  parseCookies,
  requireAuth,
} = require('../lib/auth');
const { logAudit } = require('../lib/audit');

// 12 hours - long enough to cover a full race day, short enough that a lost
// or shared device doesn't stay logged in indefinitely. No Secure flag: this
// server is reached over plain http:// on the local network (see 1.1-B),
// not https://, so Secure would silently block the cookie from ever being set.
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

function publicUser(user) {
  return {
    username: user.username,
    role: user.role,
    schoolCode: user.schoolCode,
    mustChangePassword: !!user.mustChangePassword,
  };
}

function register(router) {
  router.add('POST', '/api/auth/login', async (req, res, { sendJSON, parseBody }) => {
    const body = await parseBody(req);
    const { username, password } = body;
    if (!username || !password) {
      return sendJSON(res, 400, { error: 'Nama pengguna dan kata laluan diperlukan' });
    }

    const users = store.readJSON(USERS_FILE, []);
    const user = users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      logAudit({
        actor: String(username),
        actorRole: user ? user.role : null,
        action: 'login',
        target: String(username),
        result: 'denied',
        detail: 'invalid credentials',
      });
      return sendJSON(res, 401, { error: 'Nama pengguna atau kata laluan salah' });
    }

    const token = generateSessionToken();
    await store.update(SESSIONS_FILE, [], (sessions) => ({
      data: [...sessions, { token, username: user.username, createdAt: Date.now() }],
      result: null,
    }));
    setSessionCookie(res, token);
    logAudit({ actor: user.username, actorRole: user.role, action: 'login', target: user.username, result: 'success' });
    sendJSON(res, 200, publicUser(user));
  });

  router.add('POST', '/api/auth/logout', async (req, res, { sendJSON }) => {
    const sessionUser = getSessionUser(req);
    const token = parseCookies(req).session;
    if (token) {
      await store.update(SESSIONS_FILE, [], (sessions) => ({
        data: sessions.filter((s) => s.token !== token),
        result: null,
      }));
    }
    clearSessionCookie(res);
    if (sessionUser) {
      logAudit({
        actor: sessionUser.username,
        actorRole: sessionUser.role,
        action: 'logout',
        target: sessionUser.username,
        result: 'success',
      });
    }
    sendJSON(res, 200, { ok: true });
  });

  router.add('GET', '/api/auth/me', async (req, res, { sendJSON }) => {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Tiada sesi' });
    sendJSON(res, 200, user);
  });

  router.add('POST', '/api/auth/change-password', async (req, res, { sendJSON, parseBody }) => {
    const sessionUser = requireAuth(req, res, sendJSON, null, { allowPasswordChangeRequired: true });
    if (!sessionUser) return;

    const body = await parseBody(req);
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return sendJSON(res, 400, { error: 'Kata laluan semasa dan baharu diperlukan' });
    }
    if (String(newPassword).length < 6) {
      return sendJSON(res, 400, { error: 'Kata laluan baharu mesti sekurang-kurangnya 6 aksara' });
    }

    const users = store.readJSON(USERS_FILE, []);
    const record = users.find((u) => u.username === sessionUser.username);
    if (!record || !verifyPassword(currentPassword, record.salt, record.passwordHash)) {
      return sendJSON(res, 400, { error: 'Kata laluan semasa salah' });
    }

    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword, newSalt);
    await store.update(USERS_FILE, [], (allUsers) => ({
      data: allUsers.map((u) =>
        u.username === sessionUser.username
          ? { ...u, salt: newSalt, passwordHash: newHash, mustChangePassword: false }
          : u
      ),
      result: null,
    }));

    sendJSON(res, 200, { ok: true });
  });

  // Admin-only. Confirms the user data model already supports more than one
  // account per role (e.g. a second Race Official for a larger event, or an
  // extra School Manager) without any redesign - Version 1.1 ships with one
  // default official account, but nothing in the auth logic assumes that's
  // the only one.
  router.add('POST', '/api/auth/users', async (req, res, { sendJSON, parseBody }) => {
    const sessionUser = requireAuth(req, res, sendJSON, 'user.create');
    if (!sessionUser) return;

    const body = await parseBody(req);
    const { username, password, role, schoolCode } = body;
    if (!username || !password || !role) {
      return sendJSON(res, 400, { error: 'username, password and role are required' });
    }
    if (!['admin', 'school', 'official'].includes(role)) {
      return sendJSON(res, 400, { error: 'Invalid role' });
    }
    if (String(password).length < 6) {
      return sendJSON(res, 400, { error: 'Password must be at least 6 characters' });
    }

    const users = store.readJSON(USERS_FILE, []);
    if (users.find((u) => u.username.toLowerCase() === String(username).toLowerCase())) {
      return sendJSON(res, 400, { error: 'Username already exists' });
    }

    const salt = generateSalt();
    const newUser = {
      username: String(username).trim(),
      passwordHash: hashPassword(password, salt),
      salt,
      role,
      schoolCode: role === 'school' ? schoolCode || null : null,
      mustChangePassword: true,
    };
    await store.update(USERS_FILE, [], (allUsers) => ({ data: [...allUsers, newUser], result: null }));
    sendJSON(res, 201, publicUser(newUser));
  });
}

module.exports = { register };
