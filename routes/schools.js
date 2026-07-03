const store = require('../lib/store');
const { SCHOOLS_FILE } = require('../lib/config');

const CODE_PATTERN = /^[A-Z0-9]{1,6}$/;

function register(router) {
  router.add('GET', '/api/schools', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, store.readJSON(SCHOOLS_FILE, []));
  });

  router.add('POST', '/api/schools', async (req, res, { sendJSON, parseBody }) => {
    const body = await parseBody(req);
    const { code, name } = body;
    if (!code || !name) {
      return sendJSON(res, 400, { error: 'code and name are required' });
    }
    const normalizedCode = String(code).trim().toUpperCase();
    if (!CODE_PATTERN.test(normalizedCode)) {
      return sendJSON(res, 400, { error: 'code must be 1-6 letters/digits (e.g. TK)' });
    }

    try {
      const school = await store.update(SCHOOLS_FILE, [], (schools) => {
        if (schools.find((s) => s.code === normalizedCode)) {
          throw new Error(`School code ${normalizedCode} already exists`);
        }
        const newSchool = { code: normalizedCode, name: String(name).trim() };
        return { data: [...schools, newSchool], result: newSchool };
      });
      sendJSON(res, 201, school);
    } catch (err) {
      sendJSON(res, 400, { error: err.message });
    }
  });

  // Only the display name can be edited. The code is permanent once created -
  // it's baked into every bib number and counter key already issued for that
  // school, so changing it would silently orphan historical data.
  router.add('PUT', '/api/schools/:code', async (req, res, { params, sendJSON, parseBody }) => {
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
