const store = require('../lib/store');
const { ANNOUNCEMENT_FILE, SEED_ANNOUNCEMENT } = require('../lib/config');
const { requireAuth } = require('../lib/auth');
const { logAudit } = require('../lib/audit');

// v1.8: single current announcement (Admin edits, School Manager sees a
// popup on login) - same "one JSON file, live source of truth after first
// run" pattern as event-config (routes/system.js). No list, no history, no
// per-account read receipts by design - see CHANGELOG.
function readAnnouncement() {
  return store.readJSON(ANNOUNCEMENT_FILE, SEED_ANNOUNCEMENT);
}

// title/message length caps are deliberately generous but bounded - just
// enough to stop an accidental paste of something enormous from bloating
// the file or the popup; not a meaningful security boundary by itself.
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 3000;

function validateAnnouncement(body) {
  if (typeof body.active !== 'boolean') {
    return 'active mesti nilai boolean (true/false)';
  }
  const title = String(body.title || '').trim();
  const message = String(body.message || '').trim();
  if (title.length > MAX_TITLE_LENGTH) {
    return `Tajuk tidak boleh melebihi ${MAX_TITLE_LENGTH} aksara`;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `Kandungan tidak boleh melebihi ${MAX_MESSAGE_LENGTH} aksara`;
  }
  // Only required when switching ON - deactivating is allowed to keep
  // whatever title/message was already there (RULES: "active=false boleh
  // kekalkan tajuk dan kandungan, tidak perlu dikosongkan").
  if (body.active) {
    if (!title) return 'Tajuk diperlukan apabila pengumuman diaktifkan';
    if (!message) return 'Kandungan diperlukan apabila pengumuman diaktifkan';
  }
  return null;
}

function register(router) {
  // Admin reads it to populate the edit form; School Manager reads it to
  // decide whether to show the popup. Official/anonymous are not in
  // 'announcement.view' (see lib/config.js SEED_ROLE_PERMISSIONS) - v1 has
  // no use case for either reading it.
  router.add('GET', '/api/announcement', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'announcement.view');
    if (!user) return;
    sendJSON(res, 200, readAnnouncement());
  });

  router.add('PUT', '/api/announcement', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'announcement.update');
    if (!user) return;

    const body = await parseBody(req);
    const error = validateAnnouncement(body);
    if (error) return sendJSON(res, 400, { error });

    const record = {
      active: body.active,
      title: String(body.title || '').trim(),
      message: String(body.message || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: user.username,
    };
    await store.update(ANNOUNCEMENT_FILE, SEED_ANNOUNCEMENT, () => ({ data: record, result: null }));

    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'announcement.update',
      target: null,
      result: 'success',
      detail: `active=${record.active}, title="${record.title}"`,
    });

    sendJSON(res, 200, record);
  });
}

module.exports = { register };
