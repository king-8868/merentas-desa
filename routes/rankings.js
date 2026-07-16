const store = require('../lib/store');
const { CATEGORIES, STUDENTS_FILE, RESULTS_FILE, SCHOOLS_FILE, SCORING_CONFIG_FILE } = require('../lib/config');

// v1.7 rule change:
//  - School score = sum of EVERY effective point a school's students earned
//    across all 4 categories (no more "best 5 finishers only" cutoff -
//    topNPerSchool is no longer applied here). This is naturally bounded
//    anyway since only ranks 1..pointsTable.length ever score any points.
//  - Tie-break = compare gold (rank 1) count, then silver (rank 2), then
//    bronze (rank 3) count - schools tied on all four (score + all three
//    medal counts) share the same displayed rank ("berimbang"/tied), no
//    longer falling back to "more finishers wins".
function computeRankings() {
  const students = store.readJSON(STUDENTS_FILE, []);
  const results = store.readJSON(RESULTS_FILE, []);
  const schools = store.readJSON(SCHOOLS_FILE, []);
  const scoringConfig = store.readJSON(SCORING_CONFIG_FILE, { pointsTable: [] });
  const pointsTable = scoringConfig.pointsTable;
  const resultMap = new Map(results.map((r) => [r.bib, r.time]));

  const categoryRankings = CATEGORIES.map((cat) => {
    const catStudents = students.filter((s) => s.categoryCode === cat.code);
    const finished = catStudents
      .filter((s) => resultMap.has(s.bib))
      .map((s) => ({ ...s, time: resultMap.get(s.bib) }))
      .sort((a, b) => a.time - b.time)
      .map((s, i) => ({ ...s, rank: i + 1, points: pointsTable[i] || 0 }));
    const pending = catStudents.filter((s) => !resultMap.has(s.bib));
    return { code: cat.code, label: cat.label, finished, pending };
  });

  // Per-student points AND rank (within their own category), combined
  // across all 4 categories - used below for both the school total (sum of
  // points) and the medal-count tie-break (count of rank === 1/2/3).
  const pointsMap = new Map(); // bib -> points
  const rankMap = new Map();   // bib -> rank within its own category
  categoryRankings.forEach((cat) => {
    cat.finished.forEach((s) => {
      pointsMap.set(s.bib, s.points);
      rankMap.set(s.bib, s.rank);
    });
  });

  const schoolRankings = schools.map((school) => {
    const schoolStudents = students.filter((s) => s.schoolCode === school.code);
    const participants = schoolStudents
      .filter((s) => pointsMap.has(s.bib))
      .map((s) => ({ ...s, points: pointsMap.get(s.bib), rank: rankMap.get(s.bib), time: resultMap.get(s.bib) }))
      .sort((a, b) => b.points - a.points || a.time - b.time);
    const totalScore = participants.reduce((sum, p) => sum + p.points, 0);
    const golds = participants.filter((p) => p.rank === 1).length;
    const silvers = participants.filter((p) => p.rank === 2).length;
    const bronzes = participants.filter((p) => p.rank === 3).length;
    return {
      code: school.code,
      name: school.name,
      totalParticipants: schoolStudents.length,
      finishedCount: participants.length,
      counted: participants, // every scoring participant, not just a top-N slice (kept for API compatibility)
      totalScore,
      golds,
      silvers,
      bronzes,
    };
  }).sort((a, b) =>
    b.totalScore - a.totalScore ||
    b.golds - a.golds ||
    b.silvers - a.silvers ||
    b.bronzes - a.bronzes
  );

  // Standard competition ranking (ties share one rank number, e.g. 1,1,3,4):
  // a school's rank only advances past the previous one if it's actually
  // different on every tie-break field - a school tied on all four with the
  // one above it gets the SAME rank.
  let rank = 1;
  schoolRankings.forEach((s, i) => {
    if (i > 0) {
      const prev = schoolRankings[i - 1];
      const tied = s.totalScore === prev.totalScore &&
        s.golds === prev.golds &&
        s.silvers === prev.silvers &&
        s.bronzes === prev.bronzes;
      if (!tied) rank = i + 1;
    }
    s.rank = rank;
  });

  return { categoryRankings, schoolRankings };
}

function register(router) {
  router.add('GET', '/api/rankings', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, computeRankings());
  });
}

module.exports = { register, computeRankings };
