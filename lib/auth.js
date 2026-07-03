const crypto = require('crypto');
const store = require('./store');
const { USERS_FILE, SESSIONS_FILE, ROLE_PERMISSIONS_FILE } = require('./config');
const { logAudit } = require('./audit');

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
  // 1.3: a Disabled account (set via Admin User Management) must actually
  // lose access, not just show as "Disabled" in a list - so any existing or
  // future session for it is treated as logged-out from this point on. This
  // is the only change in this file for 1.3; password hashing, session
  // tokens, and requireAuth()'s permission logic below are untouched.
  if (user.disabled) return null;
  return {
    username: user.username,
    role: user.role,
    schoolCode: user.schoolCode,
    mustChangePassword: !!user.mustChangePassword,
  };
}

// The permission matrix lives entirely in data/role_permissions.json - this
// is the ONLY place that reads it to decide who can do what. Route files
// never hardcode a role list; they pass a permission key (e.g.
// 'student.create') and this resolves it. An unknown key resolves to "no
// one allowed" (fail closed) rather than throwing, so a typo'd key can never
// accidentally grant access.
function resolvePermission(permissionKey) {
  const permissions = store.readJSON(ROLE_PERMISSIONS_FILE, {});
  return permissions[permissionKey] || [];
}

// Call at the top of any route handler that requires login. On success,
// returns the session user. On failure, it has already sent the error
// response - the caller must just `return` immediately.
//   - No/invalid session -> 401
//   - Must change password (and this isn't the change-password route itself)
//     -> 403 with mustChangePassword: true, so the frontend can redirect
//   - Logged in but this permission key doesn't allow their role -> 403
// `permissionKey` is a string like 'student.create' looked up in
// role_permissions.json, or null/undefined to mean "any logged-in role, no
// specific permission needed" (e.g. GET /api/lifecycle).
function requireAuth(req, res, sendJSON, permissionKey, options = {}) {
  const user = getSessionUser(req);
  if (!user) {
    logAudit({
      actor: 'anonymous',
      actorRole: null,
      action: 'permission.denied',
      target: req.url,
      result: 'denied',
      detail: 'no session',
    });
    sendJSON(res, 401, { error: 'Sila log masuk' });
    return null;
  }
  if (user.mustChangePassword && !options.allowPasswordChangeRequired) {
    sendJSON(res, 403, { error: 'Sila tukar kata laluan dahulu', mustChangePassword: true });
    return null;
  }
  if (permissionKey) {
    const allowedRoles = resolvePermission(permissionKey);
    if (!allowedRoles.includes(user.role)) {
      logAudit({
        actor: user.username,
        actorRole: user.role,
        action: 'permission.denied',
        target: req.url,
        result: 'denied',
        detail: `permission="${permissionKey}", role="${user.role}"`,
      });
      sendJSON(res, 403, { error: 'Tiada kebenaran untuk tindakan ini' });
      return null;
    }
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
