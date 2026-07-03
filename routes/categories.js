const { CATEGORIES } = require('../lib/config');

function register(router) {
  router.add('GET', '/api/categories', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, CATEGORIES);
  });
}

module.exports = { register };
