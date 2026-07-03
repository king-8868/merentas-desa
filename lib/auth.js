const crypto = require('crypto');
const store = require('./store');
const { USERS_FILE, SESSIONS_FILE } = require('./config');

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// scrypt is Node's built-in password-hashing KDF (no dependency needed) -
// deliberately slow/memory-hard so brute-forcing stolen hashes is expensive.
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, expectedHash) {
  const computed = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

// Returns the logged-in user (or null) without requiring one - used both by
// requireAuth() below and by routes that behave differently when a session
// happens to be present (e.g. GET /api/students scoping to a School
// Manager's own school) without rejecting anonymous/public requests.
function getSessionUser(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const sessions = store.readJSON(SESSIONS_FILE, []);
  const session = sessions.find((s) => s.token === token);
  if (!session) return null;
  const users = store.readJSON(USERS_FILE, []);
  const user = users.find((u) => u.username === session.username);
  if (!user) return null;
  return {
    username: user.username,
    role: user.role,
    schoolCode: user.schoolCode,
    mustChangePassword: !!user.mustChangePassword,
  };
}

// Call at the top of any route handler that requires login. On success,
// returns the session user. On failure, it has already sent the error
// response - the caller must just `return` immediately.
//   - No/invalid session -> 401
//   - Must change password (and this isn't the change-password route itself)
//     -> 403 with mustChangePassword: true, so the frontend can redirect
//   - Logged in but role isn't in allowedRoles -> 403
// `allowedRoles` is an array of role strings, or null/undefined to mean "any
// logged-in role, no specific role required" (e.g. GET /api/auth/me).
function requireAuth(req, res, sendJSON, allowedRoles, options = {}) {
  const user = getSessionUser(req);
  if (!user) {
    sendJSON(res, 401, { error: 'Sila log masuk' });
    return null;
  }
  if (user.mustChangePassword && !options.allowPasswordChangeRequired) {
    sendJSON(res, 403, { error: 'Sila tukar kata laluan dahulu', mustChangePassword: true });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    sendJSON(res, 403, { error: 'Tiada kebenaran untuk tindakan ini' });
    return null;
  }
  return user;
}

module.exports = {
  generateSalt,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  parseCookies,
  getSessionUser,
  requireAuth,
};
