const store = require('../lib/store');
const { CATEGORIES, STUDENTS_FILE, RESULTS_FILE, SCHOOLS_FILE, CHECKINS_FILE, RACE_STATUS_FILE } = require('../lib/config');
const { generateBib } = require('../lib/bib');
const { parseCSV } = require('../lib/csv');
const { deriveState } = require('./race');

function register(router) {
  router.add('GET', '/api/students', async (req, res, { query, sendJSON }) => {
    let students = store.readJSON(STUDENTS_FILE, []);
    const school = query.get('school');
    const category = query.get('category');
    if (school) students = students.filter((s) => s.schoolCode === school);
    if (category) students = students.filter((s) => s.categoryCode === category);
    sendJSON(res, 200, students);
  });

  router.add('POST', '/api/students', async (req, res, { sendJSON, parseBody }) => {
    const body = await parseBody(req);
    const { name, schoolCode, categoryCode } = body;
    if (!name || !schoolCode || !categoryCode) {
      return sendJSON(res, 400, { error: 'name, schoolCode and categoryCode are required' });
    }
    const schools = store.readJSON(SCHOOLS_FILE, []);
    if (!schools.find((s) => s.code === schoolCode)) {
      return sendJSON(res, 400, { error: 'Invalid schoolCode' });
    }
    if (!CATEGORIES.find((c) => c.code === categoryCode)) {
      return sendJSON(res, 400, { error: 'Invalid categoryCode' });
    }

    let bib;
    try {
      bib = await generateBib(schoolCode, categoryCode);
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }

    const student = { bib, name: String(name).trim(), schoolCode, categoryCode };
    await store.update(STUDENTS_FILE, [], (students) => ({
      data: [...students, student],
      result: student,
    }));
    sendJSON(res, 201, student);
  });

  // CSV batch registration. Body is raw CSV text (not JSON), with a header
  // row containing at least: name, schoolCode, categoryCode (case-insensitive,
  // any column order). Best-effort: each row is validated and registered
  // independently, so one bad row (typo'd school code, etc.) doesn't block
  // the rest of a large import - the response reports exactly which rows
  // succeeded (with their new bib) and which failed (with a reason), so the
  // office can fix and re-import just the failed rows.
  router.add('POST', '/api/students/import', async (req, res, { sendJSON, parseRawBody }) => {
    const text = await parseRawBody(req);
    const { headers, rows } = parseCSV(text);

    if (!headers.includes('name') || !headers.includes('schoolcode') || !headers.includes('categorycode')) {
      return sendJSON(res, 400, {
        error: 'CSV mesti mempunyai lajur: name, schoolCode, categoryCode',
      });
    }

    const schools = store.readJSON(SCHOOLS_FILE, []);
    const imported = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +1 zero-index, +1 for header row
      const row = rows[i];
      const name = (row.name || '').trim();
      const schoolCode = (row.schoolcode || '').trim().toUpperCase();
      const categoryCode = (row.categorycode || '').trim().toUpperCase();

      if (!name) {
        errors.push({ row: rowNum, reason: 'Nama diperlukan' });
        continue;
      }
      if (!schools.find((s) => s.code === schoolCode)) {
        errors.push({ row: rowNum, reason: `Kod sekolah tidak sah: "${schoolCode}"` });
        continue;
      }
      if (!CATEGORIES.find((c) => c.code === categoryCode)) {
        errors.push({ row: rowNum, reason: `Kod kategori tidak sah: "${categoryCode}"` });
        continue;
      }

      try {
        const bib = await generateBib(schoolCode, categoryCode);
        const student = { bib, name, schoolCode, categoryCode };
        await store.update(STUDENTS_FILE, [], (students) => ({
          data: [...students, student],
          result: student,
        }));
        imported.push({ row: rowNum, bib, name });
      } catch (err) {
        errors.push({ row: rowNum, reason: err.message });
      }
    }

    sendJSON(res, 200, { imported, errors });
  });

  // Blocked if this student has a result in a FINISHED category - deleting
  // the student would cascade-delete their result too, silently bypassing
  // the "results are immutable after FINISHED" rule in routes/results.js.
  router.add('DELETE', '/api/students/:bib', async (req, res, { params, sendJSON }) => {
    const { bib } = params;
    const students = store.readJSON(STUDENTS_FILE, []);
    const student = students.find((s) => s.bib === bib);
    if (student) {
      const results = store.readJSON(RESULTS_FILE, []);
      const hasResult = results.some((r) => r.bib === bib);
      if (hasResult) {
        const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
        const state = deriveState(raceStatus[student.categoryCode]);
        if (state === 'FINISHED') {
          const category = CATEGORIES.find((c) => c.code === student.categoryCode);
          return sendJSON(res, 400, {
            error: `Perlumbaan kategori ${category ? category.label : student.categoryCode} telah tamat - peserta dengan keputusan tidak boleh dipadam`,
          });
        }
      }
    }
    await store.update(STUDENTS_FILE, [], (students) => ({
      data: students.filter((s) => s.bib !== bib),
      result: null,
    }));
    await store.update(RESULTS_FILE, [], (results) => ({
      data: results.filter((r) => r.bib !== bib),
      result: null,
    }));
    await store.update(CHECKINS_FILE, [], (checkins) => ({
      data: checkins.filter((c) => c.bib !== bib),
      result: null,
    }));
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { register };
