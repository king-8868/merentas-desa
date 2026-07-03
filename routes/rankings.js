const store = require('../lib/store');
const { CATEGORIES, STUDENTS_FILE, RESULTS_FILE, SCHOOLS_FILE, SCORING_CONFIG_FILE } = require('../lib/config');

function computeRankings() {
  const students = store.readJSON(STUDENTS_FILE, []);
  const results = store.readJSON(RESULTS_FILE, []);
  const schools = store.readJSON(SCHOOLS_FILE, []);
  const scoringConfig = store.readJSON(SCORING_CONFIG_FILE, { pointsTable: [], topNPerSchool: 5 });
  const pointsTable = scoringConfig.pointsTable;
  const topNPerSchool = scoringConfig.topNPerSchool;
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

  const pointsMap = new Map();
  categoryRankings.forEach((cat) => {
    cat.finished.forEach((s) => pointsMap.set(s.bib, s.points));
  });

  const schoolRankings = schools.map((school) => {
    const schoolStudents = students.filter((s) => s.schoolCode === school.code);
    const participants = schoolStudents
      .filter((s) => pointsMap.has(s.bib))
      .map((s) => ({ ...s, points: pointsMap.get(s.bib), time: resultMap.get(s.bib) }))
      .sort((a, b) => b.points - a.points || a.time - b.time);
    const counted = participants.slice(0, topNPerSchool);
    const totalScore = counted.reduce((sum, p) => sum + p.points, 0);
    return {
      code: school.code,
      name: school.name,
      totalParticipants: schoolStudents.length,
      finishedCount: participants.length,
      counted,
      totalScore,
    };
  }).sort((a, b) => b.totalScore - a.totalScore || b.finishedCount - a.finishedCount);

  schoolRankings.forEach((s, i) => (s.rank = i + 1));

  return { categoryRankings, schoolRankings };
}

function register(router) {
  router.add('GET', '/api/rankings', async (req, res, { sendJSON }) => {
    sendJSON(res, 200, computeRankings());
  });
}

module.exports = { register, computeRankings };
