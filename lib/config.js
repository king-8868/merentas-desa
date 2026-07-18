const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
// Deployment compatibility: on a host with an ephemeral filesystem (e.g.
// Railway without a mounted Volume), anything written to a path inside the
// deployed code directory is lost on every redeploy/restart. Overriding
// DATA_DIR (and BACKUP_DIR below) via an env var lets a Volume mounted
// elsewhere be used instead, with zero change to any code that reads these
// constants - they don't know or care whether the path came from the
// default or an override. Local development is completely unaffected: with
// no env var set, behavior is identical to before.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
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
const ANNOUNCEMENT_FILE = path.join(DATA_DIR, 'announcement.json');

// v1.9.0: Document Generator. This is a READ-ONLY code asset (the official
// consent-form template), not runtime data - lives outside DATA_DIR
// entirely (so it's never affected by DATA_DIR being pointed at a Railway
// Volume) and outside PUBLIC_DIR (so it's never reachable via a static URL
// - see routes/documents.js, which loads these bytes into memory and never
// writes them back or serves the file directly).
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');
const CONSENT_FORM_TEMPLATE_FILE = path.join(TEMPLATES_DIR, 'borang-pengakuan.pdf');

// Files that hold live event-day data (as opposed to reusable config like
// schools/users/scoring rules). "Create New Event" (lib/lifecycle.js) resets
// exactly these back to empty after archiving - nothing else.
const EVENT_SCOPED_FILES = {
  students: STUDENTS_FILE,
  results: RESULTS_FILE,
  checkins: CHECKINS_FILE,
  raceStatus: RACE_STATUS_FILE,
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
//
// v1.7 rule change: individual ranking/awards/school-scoring now run on 4
// categories (Tahap 1 and Tahap 2 both split Lelaki/Perempuan). `tahap` and
// `gender` are used by resolveCategoryCode() below so a teacher registering
// a student only ever picks "Tahap 1/2" + "Lelaki/Perempuan" - they never see
// or choose a category code directly (see routes/students.js).
//
// codes 'C' and 'D' are reused/added here for the *future* registration flow
// only. Existing students already recorded under the old code 'C' (the
// pre-v1.7 combined "Tahap 1 (Lelaki & Perempuan)" category, bibCode 'T1')
// are deliberately left untouched by this change - nothing in this codebase
// reads, reassigns, or deletes them. They will keep showing up under the new
// "Tahap 1 Lelaki" label until an admin manually handles them (out of band,
// not this code) - see CHANGELOG for the v1.7 entry.
//
// `raceGroupCode` is the new, deliberately separate concept added in v1.7:
// it's what routes/race.js's Start/Finish/Timer state is keyed by (see
// RACE_GROUPS below), NOT what individual ranking/bib/scoring is keyed by
// (that's still `code`/categoryCode, via CATEGORIES). Tahap 1 Lelaki (C) and
// Tahap 1 Perempuan (D) intentionally share one raceGroupCode ('T1') so they
// start/finish together on one shared clock, while still ranking completely
// separately.
const CATEGORIES = [
  { code: 'A', label: 'Tahap 2 Lelaki', bibCode: 'T2L', rangeStart: 101, rangeEnd: 199, tahap: 'T2', gender: 'L', raceGroupCode: 'T2L' },
  { code: 'B', label: 'Tahap 2 Perempuan', bibCode: 'T2P', rangeStart: 201, rangeEnd: 299, tahap: 'T2', gender: 'P', raceGroupCode: 'T2P' },
  { code: 'C', label: 'Tahap 1 Lelaki', bibCode: 'T1L', rangeStart: 301, rangeEnd: 399, tahap: 'T1', gender: 'L', raceGroupCode: 'T1' },
  { code: 'D', label: 'Tahap 1 Perempuan', bibCode: 'T1P', rangeStart: 401, rangeEnd: 499, tahap: 'T1', gender: 'P', raceGroupCode: 'T1' },
];

// The 3 independent Start/Finish/Timer clocks (routes/race.js,
// public/race-control.html). Deliberately a separate list from CATEGORIES -
// 'T1' here covers both the C and D categories above, which start/finish
// together on this one shared clock but are ranked separately.
const RACE_GROUPS = [
  { code: 'T2L', label: 'Tahap 2 Lelaki' },
  { code: 'T2P', label: 'Tahap 2 Perempuan' },
  { code: 'T1', label: 'Tahap 1 (Lelaki & Perempuan bersama)' },
];

// Normalizes free-form tahap/gender input (the registration form's radio
// buttons, or a value a teacher typed into a CSV cell) into the canonical
// 'T1'/'T2' and 'L'/'P' used on CATEGORIES entries above, then resolves the
// matching categoryCode. This is the ONLY place a category is ever derived
// from tahap+gender - both the single-registration API and the CSV import
// path (routes/students.js) go through this function, so they can never
// disagree on what a given tahap+gender combination maps to.
function normalizeTahap(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === '1' || v === 'T1' || v === 'TAHAP 1' || v === 'TAHAP1') return 'T1';
  if (v === '2' || v === 'T2' || v === 'TAHAP 2' || v === 'TAHAP2') return 'T2';
  return null;
}

function normalizeGender(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'L' || v === 'LELAKI') return 'L';
  if (v === 'P' || v === 'PEREMPUAN') return 'P';
  return null;
}

function resolveCategoryCode(tahapRaw, genderRaw) {
  const tahap = normalizeTahap(tahapRaw);
  const gender = normalizeGender(genderRaw);
  if (!tahap || !gender) return null;
  const category = CATEGORIES.find((c) => c.tahap === tahap && c.gender === gender);
  return category ? category.code : null;
}

// v1.7.1: server-side counterpart of the same bib-prefix check
// public/register.html and public/rankings.html already do client-side
// (never touches/renames data - display and bulk-delete filtering only).
// A student whose bib still carries the OLD prefix ('T1', not the new
// 'T1L') predates the Tahap 1 Lelaki/Perempuan split and was never recorded
// with a gender - this is the one reliable signal telling an old vs a new
// category-'C' registration apart (both share the same categoryCode).
function isLegacyTahap1(student) {
  const category = CATEGORIES.find((c) => c.code === student.categoryCode);
  return !!(category && category.code === 'C' && !student.bib.includes(`-${category.bibCode}-`));
}

// Only used to seed data/scoring-config.json on first run. After that, the
// file on disk is the live source of truth (editable via the Scoring
// Configuration UI, per RULES.md: "Scoring rules must be configurable. Do
// NOT hardcode."), so these are never read directly by ranking logic.
//
// v1.7: topNPerSchool is no longer applied when computing a school's total
// score (routes/rankings.js now sums ALL of a school's effective points
// across all 4 categories, uncapped by finisher count - naturally bounded
// anyway since only ranks 1-10 ever score). The field is kept in the config
// file/API for backward compatibility (so an old export/script reading it
// doesn't break) but has no effect on scoring anymore.
const SEED_POINTS_TABLE = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // points by category rank (1st..10th)
const SEED_TOP_N_PER_SCHOOL = 5; // retained for schema/backward-compat only - no longer applied

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
  'dashboard.view': ['admin', 'school', 'official'],
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
  // v1.8: single current-announcement popup. Official is deliberately left
  // out of both keys - v1 doesn't show them the popup and they have no
  // reason to read/manage it (see routes/announcement.js).
  'announcement.view': ['admin', 'school'],
  'announcement.update': ['admin'],
  // v1.9.0: Document Generator (routes/documents.js). Official is
  // deliberately excluded - no use case for them to generate this.
  'student.consent-form': ['admin', 'school'],
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
const SYSTEM_VERSION = '1.9.0';

// Usability patch: the event title/year were previously hardcoded strings
// baked into every page's HTML and into CURRENT_EVENT_LINE1/2 above. Those
// two constants remain as the one-time seed for data/event-config.json;
// after that, the file on disk is the live source of truth (same pattern as
// scoring-config.json / role_permissions.json) - editable via the Event
// Settings page, read by every page (including the public leaderboard, so
// this is fetched unauthenticated) instead of being hardcoded per-page.
// v1.9.0: venue/activityStartDate/activityEndDate added for the Document
// Generator (routes/documents.js) - titleLine1 doubles as the consent
// form's "NAMA AKTIVITI", titleLine2 as "PERINGKAT AKTIVITI". Existing
// titleLine1/titleLine2/year are untouched; an already-deployed
// event-config.json missing these 3 new keys is healed on startup by
// mergeEventConfig() (lib/init-data.js), same pattern as the v1.6.2
// role-permissions merge - never overwrites what's already there.
const SEED_EVENT_CONFIG = {
  titleLine1: CURRENT_EVENT_LINE1,
  titleLine2: CURRENT_EVENT_LINE2,
  year: 2026,
  venue: '',
  activityStartDate: '',
  activityEndDate: '',
};

// v1.8: single current-announcement popup (Admin edits, School Manager sees
// it on login). Same "one JSON file, live source of truth after first run"
// pattern as SEED_EVENT_CONFIG above - deliberately only ONE announcement,
// not a list, per the v1 scope (see routes/announcement.js).
const SEED_ANNOUNCEMENT = {
  active: false,
  title: '',
  message: '',
  updatedAt: null,
  updatedBy: null,
};

// Same override mechanism as DATA_DIR above, kept as a separate env var
// since BACKUP_DIR is a sibling of DATA_DIR, not nested inside it - a
// deployment can point both at subpaths of the same mounted Volume (e.g.
// DATA_DIR=/storage/data BACKUP_DIR=/storage/backup) without them colliding.
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT_DIR, 'backup');
const BACKUP_SCOPED_FILES = {
  students: STUDENTS_FILE,
  results: RESULTS_FILE,
  checkins: CHECKINS_FILE,
  raceStatus: RACE_STATUS_FILE,
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
  TEMPLATES_DIR,
  CONSENT_FORM_TEMPLATE_FILE,
  EVENT_SCOPED_FILES,
  BACKUP_DIR,
  BACKUP_SCOPED_FILES,
  SYSTEM_NAME,
  CURRENT_EVENT_LINE1,
  CURRENT_EVENT_LINE2,
  DEVELOPER,
  SYSTEM_VERSION,
  SEED_EVENT_CONFIG,
  SEED_ANNOUNCEMENT,
  SEED_SCHOOLS,
  CATEGORIES,
  RACE_GROUPS,
  normalizeTahap,
  normalizeGender,
  resolveCategoryCode,
  isLegacyTahap1,
  SEED_POINTS_TABLE,
  SEED_TOP_N_PER_SCHOOL,
  SEED_USERS,
  SEED_ROLE_PERMISSIONS,
};
