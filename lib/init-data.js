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
  SEED_SCHOOLS,
  SEED_POINTS_TABLE,
  SEED_TOP_N_PER_SCHOOL,
} = require('./config');

function ensureFile(file, defaultContent) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, defaultContent);
}

// Every piece of race-day state (participants, results, bib counters, and -
// once Phase 3 adds race control - category start timestamps) lives on disk
// from the start, so a browser crash or server restart never loses progress.
function initData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
}

module.exports = initData;
