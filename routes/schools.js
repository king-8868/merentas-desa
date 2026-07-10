const store = require('../lib/store');
const { SCHOOLS_FILE, USERS_FILE } = require('../lib/config');
const { requireAuth, generateSalt, hashPassword } = require('../lib/auth');

const CODE_PATTERN = /^[A-Z0-9]{1,6}$/;

function register(router) {
  // Public - the leaderboard (no login) needs the school list too.
  router.add('GET', '/api/schools', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, store.readJSON(SCHOOLS_FILE, []));
  });

  // Creates the School and its paired Pengurus Sekolah (school-role) account
  // together, in one action. The admin only supplies username + initial
  // password - role is always 'school' and schoolCode is always this
  // school's code, never chosen. This is now the only way a school-role
  // account can be created (POST /api/auth/users rejects role: 'school').
  router.add('POST', '/api/schools', async (req, res, { sendJSON, parseBody }) => {
    const admin = requireAuth(req, res, sendJSON, 'school.create');
    if (!admin) return;
    const body = await parseBody(req);
    const { code, name, username, password } = body;
    if (!code || !name || !username || !password) {
      return sendJSON(res, 400, { error: 'code, name, username and password are required' });
    }
    const normalizedCode = String(code).trim().toUpperCase();
    if (!CODE_PATTERN.test(normalizedCode)) {
      return sendJSON(res, 400, { error: 'code must be 1-6 letters/digits (e.g. TK)' });
    }
    const normalizedUsername = String(username).trim();
    if (!normalizedUsername) {
      return sendJSON(res, 400, { error: 'username is required' });
    }
    if (String(password).length < 6) {
      return sendJSON(res, 400, { error: 'password must be at least 6 characters' });
    }

    // Checked up front, before either file is written, so a duplicate
    // username never leaves an orphaned School with no paired account.
    const existingUsers = store.readJSON(USERS_FILE, []);
    if (existingUsers.find((u) => u.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      return sendJSON(res, 400, { error: `Username ${normalizedUsername} already exists` });
    }

    try {
      const school = await store.update(SCHOOLS_FILE, [], (schools) => {
        if (schools.find((s) => s.code === normalizedCode)) {
          throw new Error(`School code ${normalizedCode} already exists`);
        }
        const newSchool = { code: normalizedCode, name: String(name).trim() };
        return { data: [...schools, newSchool], result: newSchool };
      });

      const newUser = await store.update(USERS_FILE, [], (users) => {
        if (users.find((u) => u.username.toLowerCase() === normalizedUsername.toLowerCase())) {
          throw new Error(`Username ${normalizedUsername} already exists`);
        }
        // Defensive only - the school-code check above already guarantees
        // normalizedCode is new, so a manager for it can never already
        // exist. Kept so this endpoint can never double-create one.
        if (users.find((u) => u.role === 'school' && u.schoolCode === normalizedCode)) {
          return { data: users, result: null };
        }
        const salt = generateSalt();
        const created = {
          username: normalizedUsername,
          passwordHash: hashPassword(String(password), salt),
          salt,
          role: 'school',
          schoolCode: normalizedCode,
          mustChangePassword: true,
        };
        return { data: [...users, created], result: created };
      });

      sendJSON(res, 201, {
        school,
        user: newUser
          ? {
              username: newUser.username,
              role: newUser.role,
              schoolCode: newUser.schoolCode,
              mustChangePassword: newUser.mustChangePassword,
            }
          : null,
      });
    } catch (err) {
      sendJSON(res, 400, { error: err.message });
    }
  });

  // Only the display name can be edited. The code is permanent once created -
  // it's baked into every bib number and counter key already issued for that
  // school, so changing it would silently orphan historical data.
  router.add('PUT', '/api/schools/:code', async (req, res, { params, sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'school.update');
    if (!user) return;
    const body = await parseBody(req);
    const { name } = body;
    if (!name || !String(name).trim()) {
      return sendJSON(res, 400, { error: 'name is required' });
    }

    try {
      const updated = await store.update(SCHOOLS_FILE, [], (schools) => {
        const school = schools.find((s) => s.code === params.code);
        if (!school) throw new Error('School not found');
        const next = schools.map((s) =>
          s.code === params.code ? { ...s, name: String(name).trim() } : s
        );
        return { data: next, result: next.find((s) => s.code === params.code) };
      });
      sendJSON(res, 200, updated);
    } catch (err) {
      sendJSON(res, 404, { error: err.message });
    }
  });
}

module.exports = { register };
