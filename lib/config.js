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
  SEED_SCHOOLS,
  CATEGORIES,
  SEED_POINTS_TABLE,
  SEED_TOP_N_PER_SCHOOL,
};
