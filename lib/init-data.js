const fs = require('fs');
const {
  DATA_DIR,
  STUDENTS_FILE,
  RESULTS_FILE,
  RACE_STATUS_FILE,
  SCHOOLS_FILE,
  CHECKINS_FILE,
  SCORING_CONFIG_FILE,
  USERS_FILE,
  SESSIONS_FILE,
  EVENT_LOG_FILE,
  LIFECYCLE_FILE,
  ROLE_PERMISSIONS_FILE,
  ARCHIVE_DIR,
  EVENT_CONFIG_FILE,
  ANNOUNCEMENT_FILE,
  SEED_SCHOOLS,
  SEED_POINTS_TABLE,
  SEED_TOP_N_PER_SCHOOL,
  SEED_USERS,
  SEED_ROLE_PERMISSIONS,
  SEED_EVENT_CONFIG,
  SEED_ANNOUNCEMENT,
} = require('./config');
const { generateSalt, hashPassword } = require('./auth');
const store = require('./store');

function ensureFile(file, defaultContent) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, defaultContent);
}

// v1.6.2 hotfix: role_permissions.json is seeded ONLY the first time the
// server ever starts against a given DATA_DIR (ensureFile() above is a
// no-op once the file exists). That means a permission key added to
// SEED_ROLE_PERMISSIONS by a later release (e.g. 'dashboard.view' in
// v1.6.1) never reaches an already-running environment - Railway's
// persistent Volume, an existing local install, etc. - because nothing
// ever re-seeds a file that's already there. The new feature then 403s for
// every role until someone manually edits the live file, which is exactly
// what happened after v1.6.1 shipped.
//
// This runs on every startup, after ensureFile() has guaranteed the file
// exists, and ONLY adds a permission key that is completely absent from the
// file on disk. It never touches a key that's already present - an admin
// who has customized who's allowed to do what (e.g. narrowed
// 'student.delete' to admin-only) keeps that customization forever, even
// across a deploy that adds unrelated new keys. If nothing is missing, it
// doesn't write the file at all.
function mergeRolePermissions() {
  const onDisk = store.readJSON(ROLE_PERMISSIONS_FILE, {});
  const missingKeys = Object.keys(SEED_ROLE_PERMISSIONS).filter((key) => !(key in onDisk));
  if (missingKeys.length === 0) return Promise.resolve();

  // Goes through store.update() - the same atomic, per-file-queued
  // read-modify-write every other mutation in this app uses (lib/store.js)
  // - rather than a raw fs.writeFileSync, so this can never race a
  // concurrent write to the same file. The missing-keys check is repeated
  // inside the mutator against the freshest on-disk copy, in case something
  // else wrote to the file between the check above and now.
  return store.update(ROLE_PERMISSIONS_FILE, SEED_ROLE_PERMISSIONS, (current) => {
    const stillMissing = Object.keys(SEED_ROLE_PERMISSIONS).filter((key) => !(key in current));
    if (stillMissing.length === 0) return { data: current, result: null };
    // Existing keys are spread in first and never overwritten - only keys
    // absent from `current` are added, using the code's default roles for
    // that key.
    const data = { ...current };
    stillMissing.forEach((key) => { data[key] = SEED_ROLE_PERMISSIONS[key]; });
    return { data, result: stillMissing };
  }).then((addedKeys) => {
    if (addedKeys && addedKeys.length) {
      console.log(`[startup] role_permissions.json: auto-added missing permission key(s) not present in the existing file: ${addedKeys.join(', ')}`);
    }
  });
}

// Every default account is seeded with mustChangePassword: true - the plain
// SEED_USERS passwords are only ever used for hashing here, never written to
// disk themselves.
function ensureUsersFile() {
  if (fs.existsSync(USERS_FILE)) return;
  const users = SEED_USERS.map((u) => {
    const salt = generateSalt();
    return {
      username: u.username,
      passwordHash: hashPassword(u.password, salt),
      salt,
      role: u.role,
      schoolCode: u.schoolCode,
      mustChangePassword: true,
    };
  });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Every piece of race-day state (participants, results, bib counters, race
// control timestamps) lives on disk from the start, so a browser crash or
// server restart never loses progress.
function initData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  ensureFile(STUDENTS_FILE, '[]');
  ensureFile(RESULTS_FILE, '[]');
  ensureFile(RACE_STATUS_FILE, '{}');
  ensureFile(SCHOOLS_FILE, JSON.stringify(SEED_SCHOOLS, null, 2));
  ensureFile(CHECKINS_FILE, '[]');
  ensureFile(
    SCORING_CONFIG_FILE,
    JSON.stringify({ pointsTable: SEED_POINTS_TABLE, topNPerSchool: SEED_TOP_N_PER_SCHOOL }, null, 2)
  );
  ensureUsersFile();
  ensureFile(SESSIONS_FILE, '[]');
  ensureFile(EVENT_LOG_FILE, '[]');
  ensureFile(LIFECYCLE_FILE, JSON.stringify({ state: 'OPEN', changedBy: null, changedAt: null, epoch: 1 }, null, 2));
  ensureFile(ROLE_PERMISSIONS_FILE, JSON.stringify(SEED_ROLE_PERMISSIONS, null, 2));
  ensureFile(EVENT_CONFIG_FILE, JSON.stringify(SEED_EVENT_CONFIG, null, 2));
  ensureFile(ANNOUNCEMENT_FILE, JSON.stringify(SEED_ANNOUNCEMENT, null, 2));
  return mergeRolePermissions();
}

module.exports = initData;
