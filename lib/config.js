const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');
const RACE_STATUS_FILE = path.join(DATA_DIR, 'race-status.json');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');
const CHECKINS_FILE = path.join(DATA_DIR, 'checkins.json');
const SCORING_CONFIG_FILE = path.join(DATA_DIR, 'scoring-config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const EVENT_LOG_FILE = path.join(DATA_DIR, 'event_log.json');
const LIFECYCLE_FILE = path.join(DATA_DIR, 'event-lifecycle.json');
const ROLE_PERMISSIONS_FILE = path.join(DATA_DIR, 'role_permissions.json');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const EVENT_CONFIG_FILE = path.join(DATA_DIR, 'event-config.json');

// Files that hold live event-day data (as opposed to reusable config like
// schools/users/scoring rules). "Create New Event" (lib/lifecycle.js) resets
// exactly these back to empty after archiving - nothing else.
const EVENT_SCOPED_FILES = {
  students: STUDENTS_FILE,
  results: RESULTS_FILE,
  checkins: CHECKINS_FILE,
  raceStatus: RACE_STATUS_FILE,
  counters: COUNTERS_FILE,
};

// Only used to seed data/schools.json on first run. After that, schools.json
// on disk is the live source of truth (editable via the School Management UI),
// so this list is never read directly by routes/business logic.
const SEED_SCHOOLS = [
  { code: 'TK', name: 'SJKC TUNG KIEW' },
  { code: 'SL', name: 'SJKC SAM LAM' },
  { code: 'HU', name: 'SJKC HING UNG' },
  { code: 'YC', name: 'SJKC YUK CHAI' },
  { code: 'CU', name: 'SJKC CHUNG UNG' },
  { code: 'NS', name: 'SJKC NENG SHING' },
  { code: 'KK', name: 'SJKC KWONG KOK' },
  { code: 'NK', name: 'SJKC NANG KIANG' },
  { code: 'SM', name: 'SJKC SING MING' },
  { code: 'NP', name: 'SK NANGA PAK' },
];

// rangeStart/rangeEnd define each school's own bib sequence window per category
// (e.g. TK-T2L-101, TK-T2L-102, ... independent of SL-T2L-101, SL-T2L-102, ...)
const CATEGORIES = [
  { code: 'A', label: 'Tahap 2 Lelaki', bibCode: 'T2L', rangeStart: 101, rangeEnd: 199 },
  { code: 'B', label: 'Tahap 2 Perempuan', bibCode: 'T2P', rangeStart: 201, rangeEnd: 299 },
  { code: 'C', label: 'Tahap 1 (Lelaki & Perempuan)', bibCode: 'T1', rangeStart: 301, rangeEnd: 399 },
];

// Only used to seed data/scoring-config.json on first run. After that, the
// file on disk is the live source of truth (editable via the Scoring
// Configuration UI, per RULES.md: "Scoring rules must be configurable. Do
// NOT hardcode."), so these are never read directly by ranking logic.
const SEED_POINTS_TABLE = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // points by category rank (1st..10th)
const SEED_TOP_N_PER_SCHOOL = 5; // school score = sum of points from each school's best N finishers

// Only used to seed data/users.json on first run (lib/init-data.js hashes
// these default passwords before ever writing them to disk - the plain
// values here never get persisted). Every default account is created with
// mustChangePassword: true, so these defaults only ever work for the very
// first login. One School Manager account per school; a single Race
// Official account for now, but nothing in the data model or auth logic
// assumes there's only one - routes/auth.js's POST /api/auth/users lets an
// admin create additional accounts of any role (e.g. a second official)
// without any redesign.
const SEED_USERS = [
  { username: 'admin', password: 'admin2026', role: 'admin', schoolCode: null },
  { username: 'official', password: 'official2026', role: 'official', schoolCode: null },
  ...SEED_SCHOOLS.map((s) => ({
    username: s.code,
    password: `${s.code}2026`,
    role: 'school',
    schoolCode: s.code,
  })),
];

// Seeds data/role_permissions.json on first run. After that, the file on
// disk is the live source of truth - lib/auth.js's requireAuth() always
// resolves permission keys through it, never through a hardcoded array in a
// route file. Each key is `<resource>.<action>`; the value is the list of
// roles allowed to perform it.
const SEED_ROLE_PERMISSIONS = {
  'school.create': ['admin'],
  'school.update': ['admin'],
  'student.create': ['admin', 'school'],
  'student.delete': ['admin', 'school'],
  'student.import': ['admin', 'school'],
  'checkin.view': ['admin', 'official'],
  'checkin.create': ['admin', 'official'],
  'checkin.delete': ['admin', 'official'],
  'race.view': ['admin', 'official'],
  'race.start': ['admin', 'official'],
  'race.finish': ['admin', 'official'],
  'race.reset': ['admin', 'official'],
  'result.manual': ['admin'],
  'result.finish': ['admin', 'official'],
  'result.delete': ['admin', 'official'],
  'scoring.view': ['admin'],
  'scoring.update': ['admin'],
  'user.create': ['admin'],
  'user.view': ['admin'],
  'user.reset-password': ['admin'],
  'user.enable': ['admin'],
  'user.disable': ['admin'],
  'audit.view': ['admin'],
  'lifecycle.transition': ['admin'],
  'system.view': ['admin'],
  'backup.view': ['admin'],
  'backup.restore': ['admin'],
  'event.update': ['admin'],
};

// 1.4: periodic disaster-recovery snapshots, separate in purpose from
// data/archive/ (which is the intentional, admin-triggered end-of-event
// record kept forever). /backup holds short-lived, automatic safety copies
// of the same live files, meant to be pruned and overwritten routinely.
// sessions.json is deliberately excluded - restoring old session tokens
// would be actively harmful (could resurrect a stale/invalid login), and
// they're not "data" in the sense the other files are.
// Shared with both routes/system.js's API and server.js's startup banner,
// so the two displays of "what version/event is this" can never drift.
const SYSTEM_NAME = 'Merentas Desa Management System';
const CURRENT_EVENT_LINE1 = 'KEJOHANAN MERENTAS DESA SEMPENA HARI KEBANGSAAN 2026';
const CURRENT_EVENT_LINE2 = 'PERINGKAT SEKOLAH ZON LUAR BANDAR';
const DEVELOPER = 'William Ngu';
const SYSTEM_VERSION = '1.4';

// Usability patch: the event title/year were previously hardcoded strings
// baked into every page's HTML and into CURRENT_EVENT_LINE1/2 above. Those
// two constants remain as the one-time seed for data/event-config.json;
// after that, the file on disk is the live source of truth (same pattern as
// scoring-config.json / role_permissions.json) - editable via the Event
// Settings page, read by every page (including the public leaderboard, so
// this is fetched unauthenticated) instead of being hardcoded per-page.
const SEED_EVENT_CONFIG = {
  titleLine1: CURRENT_EVENT_LINE1,
  titleLine2: CURRENT_EVENT_LINE2,
  year: 2026,
};

const BACKUP_DIR = path.join(ROOT_DIR, 'backup');
const BACKUP_SCOPED_FILES = {
  students: STUDENTS_FILE,
  results: RESULTS_FILE,
  checkins: CHECKINS_FILE,
  raceStatus: RACE_STATUS_FILE,
  counters: COUNTERS_FILE,
  users: USERS_FILE,
  schools: SCHOOLS_FILE,
  scoringConfig: SCORING_CONFIG_FILE,
  rolePermissions: ROLE_PERMISSIONS_FILE,
  lifecycle: LIFECYCLE_FILE,
  eventLog: EVENT_LOG_FILE,
};

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PUBLIC_DIR,
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
  EVENT_SCOPED_FILES,
  BACKUP_DIR,
  BACKUP_SCOPED_FILES,
  SYSTEM_NAME,
  CURRENT_EVENT_LINE1,
  CURRENT_EVENT_LINE2,
  DEVELOPER,
  SYSTEM_VERSION,
  SEED_EVENT_CONFIG,
  SEED_SCHOOLS,
  CATEGORIES,
  SEED_POINTS_TABLE,
  SEED_TOP_N_PER_SCHOOL,
  SEED_USERS,
  SEED_ROLE_PERMISSIONS,
};
