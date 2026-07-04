const fs = require('fs');
const {
  DATA_DIR,
  STUDENTS_FILE,
  RESULTS_FILE,
  COUNTERS_FILE,
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
  SEED_SCHOOLS,
  SEED_POINTS_TABLE,
  SEED_TOP_N_PER_SCHOOL,
  SEED_USERS,
  SEED_ROLE_PERMISSIONS,
  SEED_EVENT_CONFIG,
} = require('./config');
const { generateSalt, hashPassword } = require('./auth');

function ensureFile(file, defaultContent) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, defaultContent);
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
  ensureFile(COUNTERS_FILE, '{}');
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
}

module.exports = initData;
