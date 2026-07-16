const store = require('../lib/store');
const { CATEGORIES, STUDENTS_FILE, RESULTS_FILE, SCHOOLS_FILE, CHECKINS_FILE, RACE_STATUS_FILE, resolveCategoryCode, isLegacyTahap1 } = require('../lib/config');
const { pickBib } = require('../lib/bib');
const { parseCSV } = require('../lib/csv');
const { deriveState } = require('./race');
const { getSessionUser, requireAuth } = require('../lib/auth');
const { requireOpenEvent, runIfEventStillOpen } = require('../lib/lifecycle');
const { logAudit } = require('../lib/audit');

function register(router) {
  // Public (needed by the public leaderboard) - but if a School Manager
  // happens to be logged in, the response is scoped to their own school.
  // This is what actually enforces "cannot access other schools' data": the
  // frontend never even receives other schools' students, it isn't just
  // hiding them with CSS.
  router.add('GET', '/api/students', async (req, res, { query, sendJSON }) => {
    let students = store.readJSON(STUDENTS_FILE, []);
    const sessionUser = getSessionUser(req);
    if (sessionUser && sessionUser.role === 'school') {
      students = students.filter((s) => s.schoolCode === sessionUser.schoolCode);
    }
    const school = query.get('school');
    const category = query.get('category');
    if (school) students = students.filter((s) => s.schoolCode === school);
    if (category) students = students.filter((s) => s.categoryCode === category);
    sendJSON(res, 200, students);
  });

  // Counts only (no names) - unlike GET /api/students above, this is NEVER
  // scoped to the caller's own school. A School Manager needs the true
  // event-wide totals for the "Ringkasan Acara" / "Sekolah Yang Menyertai" /
  // "Kategori" dashboard (public/index.html), and a per-school participant
  // *count* is not the kind of private data that scoping exists to protect
  // (only the roster of names is). Keep this endpoint aggregate-only -
  // if it ever needs to return individual students, scope it like
  // GET /api/students does.
  router.add('GET', '/api/students/summary', async (req, res, { sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'dashboard.view');
    if (!user) return;
    const students = store.readJSON(STUDENTS_FILE, []);
    const schools = store.readJSON(SCHOOLS_FILE, []);
    const perSchool = schools.map((sch) => ({
      schoolCode: sch.code,
      count: students.filter((s) => s.schoolCode === sch.code).length,
    }));
    const perCategory = CATEGORIES.map((cat) => ({
      categoryCode: cat.code,
      count: students.filter((s) => s.categoryCode === cat.code).length,
    }));
    sendJSON(res, 200, {
      totalStudents: students.length,
      totalSchools: schools.length,
      perSchool,
      perCategory,
    });
  });

  // Admin can register for any school. A School Manager can only register
  // for their own school - schoolCode is forced server-side regardless of
  // what the request body says, so a tampered request can't register into
  // another school.
  router.add('POST', '/api/students', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'student.create');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const body = await parseBody(req);
    const { name, tahap, gender } = body;
    let { schoolCode } = body;
    if (user.role === 'school') {
      schoolCode = user.schoolCode;
    }
    if (!name || !schoolCode || !tahap || !gender) {
      return sendJSON(res, 400, { error: 'name, schoolCode, tahap and gender are required' });
    }
    const schools = store.readJSON(SCHOOLS_FILE, []);
    if (!schools.find((s) => s.code === schoolCode)) {
      return sendJSON(res, 400, { error: 'Invalid schoolCode' });
    }
    // v1.7: a teacher picks Tahap (1/2) + Jantina (Lelaki/Perempuan), never a
    // category code directly - resolveCategoryCode() is the single place
    // that turns that combination into the actual categoryCode (see
    // lib/config.js). Kept as a 400, not a 500/silent default, so a garbled
    // request never lands a student in the wrong category.
    const categoryCode = resolveCategoryCode(tahap, gender);
    if (!categoryCode) {
      return sendJSON(res, 400, { error: 'Invalid tahap/gender combination' });
    }

    // pickBib() and the students.json insert happen inside the very same
    // store.update(STUDENTS_FILE, ...) call - not two separate steps - so two
    // concurrent registrations for the same school+category can never scan
    // the same gap and both grab it (lib/store.js serializes every mutator
    // call against one file). The whole thing is also wrapped in the
    // lifecycle-gated section so it can't land against the wrong event if
    // archived/cleared mid-request.
    let writeOutcome;
    try {
      writeOutcome = await runIfEventStillOpen(eventGate.epoch, async () => {
        return store.update(STUDENTS_FILE, [], (students) => {
          const bib = pickBib(students, schoolCode, categoryCode);
          const student = { bib, name: String(name).trim(), schoolCode, categoryCode };
          return { data: [...students, student], result: student };
        });
      });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }

    const student = writeOutcome.result;
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'student.create',
      target: student.bib,
      result: 'success',
      detail: student.name,
    });
    sendJSON(res, 201, student);
  });

  // CSV batch registration. Body is raw CSV text (not JSON), with a header
  // row containing at least: name, schoolCode, tahap, gender (case-
  // insensitive, any column order). v1.7: the CSV no longer takes a raw
  // categoryCode column - a teacher filling this in should never need to
  // know category codes, same reasoning as the single-registration form
  // (see resolveCategoryCode() in lib/config.js). Best-effort: each row is
  // validated and registered independently, so one bad row (typo'd school
  // code, invalid tahap/gender, etc.) doesn't block the rest of a large
  // import - the response reports exactly which rows succeeded (with their
  // new bib) and which failed (with a reason), so the office can fix and
  // re-import just the failed rows. A School Manager's rows are all forced
  // to their own school - other schools' rows in the same file become
  // errors, not silent corrections.
  router.add('POST', '/api/students/import', async (req, res, { sendJSON, parseRawBody }) => {
    const user = requireAuth(req, res, sendJSON, 'student.import');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const text = await parseRawBody(req);
    const { headers, rows } = parseCSV(text);

    if (!headers.includes('name') || !headers.includes('schoolcode') || !headers.includes('tahap') || !headers.includes('gender')) {
      return sendJSON(res, 400, {
        error: 'CSV mesti mempunyai lajur: name, schoolCode, tahap, gender',
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
      const tahap = (row.tahap || '').trim();
      const gender = (row.gender || '').trim();

      if (!name) {
        errors.push({ row: rowNum, reason: 'Nama diperlukan' });
        continue;
      }
      if (user.role === 'school' && schoolCode !== user.schoolCode) {
        errors.push({
          row: rowNum,
          reason: `Baris ini untuk sekolah lain ("${schoolCode}") - akaun anda hanya boleh import untuk ${user.schoolCode}`,
        });
        continue;
      }
      if (!schools.find((s) => s.code === schoolCode)) {
        errors.push({ row: rowNum, reason: `Kod sekolah tidak sah: "${schoolCode}"` });
        continue;
      }
      const categoryCode = resolveCategoryCode(tahap, gender);
      if (!categoryCode) {
        errors.push({ row: rowNum, reason: `Tahap/gender tidak sah: tahap="${tahap}", gender="${gender}" (guna 1/2 dan L/P atau Lelaki/Perempuan)` });
        continue;
      }

      // Each row commits inside its own lifecycle-gated section (same
      // reasoning as POST /api/students above) - if the event is
      // archived/cleared mid-import, remaining rows fail gracefully into
      // `errors` instead of silently landing in a new event's fresh data.
      try {
        const rowOutcome = await runIfEventStillOpen(eventGate.epoch, async () => {
          return store.update(STUDENTS_FILE, [], (students) => {
            const bib = pickBib(students, schoolCode, categoryCode);
            const student = { bib, name, schoolCode, categoryCode };
            return { data: [...students, student], result: student };
          });
        });
        if (!rowOutcome.ok) {
          errors.push({ row: rowNum, reason: rowOutcome.error });
          continue;
        }
        imported.push({ row: rowNum, bib: rowOutcome.result.bib, name });
      } catch (err) {
        errors.push({ row: rowNum, reason: err.message });
      }
    }

    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'student.import',
      target: null,
      result: errors.length ? 'partial' : 'success',
      detail: `${imported.length} imported, ${errors.length} failed`,
    });
    sendJSON(res, 200, { imported, errors });
  });

  // Admin can delete any student. A School Manager can only delete their own
  // school's students. Also blocked if this student has a result in a
  // FINISHED category - deleting the student would cascade-delete their
  // result too, silently bypassing the "results are immutable after
  // FINISHED" rule in routes/results.js.
  router.add('DELETE', '/api/students/:bib', async (req, res, { params, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'student.delete');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const { bib } = params;
    const students = store.readJSON(STUDENTS_FILE, []);
    const student = students.find((s) => s.bib === bib);
    if (student) {
      if (user.role === 'school' && student.schoolCode !== user.schoolCode) {
        return sendJSON(res, 403, { error: 'Anda hanya boleh memadam peserta sekolah anda sendiri' });
      }
      const results = store.readJSON(RESULTS_FILE, []);
      const hasResult = results.some((r) => r.bib === bib);
      if (hasResult) {
        // v1.7: race clocks are keyed by raceGroupCode, not categoryCode -
        // resolve the student's category to its race group first (same
        // pattern as routes/results.js's getCategoryStatus()).
        const category = CATEGORIES.find((c) => c.code === student.categoryCode);
        const raceGroupCode = category ? category.raceGroupCode : student.categoryCode;
        const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
        const state = deriveState(raceStatus[raceGroupCode]);
        if (state === 'FINISHED') {
          return sendJSON(res, 400, {
            error: `Perlumbaan kategori ${category ? category.label : student.categoryCode} telah tamat - peserta dengan keputusan tidak boleh dipadam`,
          });
        }
      }
    }
    // All three files are cleared inside one lifecycle-gated section so the
    // deletion is all-or-nothing relative to an in-flight archive/clear.
    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, async () => {
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
    });
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'student.delete',
      target: bib,
      result: 'success',
    });
    sendJSON(res, 200, { ok: true });
  });

  // v1.7.1: real batch delete - the frontend must never loop the single
  // DELETE endpoint above dozens of times (one HTTP round-trip per student
  // is slow and isn't atomic as a set). Same permission ('student.delete' -
  // deliberately NOT expanded to 'official'), same lifecycle/race-group
  // protection, and the same cascade-delete of results+checkins as the
  // single-student DELETE above, just applied to a set of bibs in one
  // transaction.
  //
  // Body is EITHER:
  //   { bibs: ["TK-T1-301", ...] }
  // OR:
  //   { filters: { schoolCode, categoryCode, legacyOnly } }
  // `legacyOnly: true` selects only pre-v1.7 category-C students still on
  // the old bib prefix (see isLegacyTahap1() in lib/config.js) - this is
  // what powers "Padam Semua Tahap 1 (Data Lama)". It never matches a new
  // Tahap 1 Lelaki ('-T1L-') or Tahap 1 Perempuan ('-T1P-') registration.
  //
  // School-scoping is applied to the FULL roster FIRST, before bibs/filters
  // are matched against it - the exact same pattern as GET /api/students.
  // A bib belonging to another school is then indistinguishable from a bib
  // that doesn't exist at all, for both input shapes - there is no way to
  // probe or delete another school's roster via a crafted request.
  router.add('POST', '/api/students/bulk-delete', async (req, res, { sendJSON, parseBody }) => {
    const user = requireAuth(req, res, sendJSON, 'student.delete');
    if (!user) return;
    const eventGate = requireOpenEvent(res, sendJSON);
    if (!eventGate.ok) return;

    const body = await parseBody(req);
    const allStudents = store.readJSON(STUDENTS_FILE, []);
    // Filter-based deletion is scoped the same way GET /api/students already
    // scopes its `?school=` query param: a School Manager's filters are
    // silently intersected with their own school, so a foreign schoolCode in
    // `filters` just matches nothing (0 results), not an error - same
    // "search criteria" semantics as everywhere else in this app.
    const scoped = user.role === 'school'
      ? allStudents.filter((s) => s.schoolCode === user.schoolCode)
      : allStudents;

    let candidates;
    let requestedCount;
    const skipped = [];
    if (Array.isArray(body.bibs)) {
      if (body.bibs.length === 0) {
        return sendJSON(res, 400, { error: 'bibs must not be empty' });
      }
      // Per-bib, best-effort - same "do as much as is valid, report the
      // rest" contract as CSV import (POST /api/students/import). Matched
      // against `scoped` (already role-scoped, same as GET /api/students),
      // so a School Manager's bib list is silently intersected with their
      // own school: a bib belonging to another school and a bib that
      // doesn't exist at all are indistinguishable in the response (same
      // generic reason below) - this is deliberately safer than a whole-
      // batch 403, which would otherwise let a School Manager learn "this
      // bib exists at another school" (403) vs "this bib doesn't exist"
      // (200/skipped) by probing one bib at a time.
      const bibSet = new Set(body.bibs);
      candidates = scoped.filter((s) => bibSet.has(s.bib));
      requestedCount = body.bibs.length;
      const foundSet = new Set(candidates.map((s) => s.bib));
      body.bibs.forEach((bib) => {
        if (!foundSet.has(bib)) skipped.push({ bib, reason: 'Bib tidak wujud atau tiada kebenaran' });
      });
    } else if (body.filters && typeof body.filters === 'object') {
      const { schoolCode, categoryCode, legacyOnly } = body.filters;
      candidates = scoped.filter((s) => {
        if (schoolCode && s.schoolCode !== schoolCode) return false;
        if (legacyOnly) return s.categoryCode === 'C' && isLegacyTahap1(s);
        if (categoryCode && s.categoryCode !== categoryCode) return false;
        return true;
      });
      requestedCount = candidates.length;
    } else {
      return sendJSON(res, 400, { error: 'bibs (array) or filters (object) is required' });
    }

    const results = store.readJSON(RESULTS_FILE, []);
    const raceStatus = store.readJSON(RACE_STATUS_FILE, {});
    const resultBibs = new Set(results.map((r) => r.bib));

    const toDelete = [];
    candidates.forEach((student) => {
      if (resultBibs.has(student.bib)) {
        const category = CATEGORIES.find((c) => c.code === student.categoryCode);
        const raceGroupCode = category ? category.raceGroupCode : student.categoryCode;
        const state = deriveState(raceStatus[raceGroupCode]);
        if (state === 'FINISHED') {
          skipped.push({
            bib: student.bib,
            reason: `Perlumbaan kategori ${category ? category.label : student.categoryCode} telah tamat - peserta dengan keputusan tidak boleh dipadam`,
          });
          return;
        }
      }
      toDelete.push(student.bib);
    });

    if (toDelete.length === 0) {
      return sendJSON(res, 200, { requestedCount, deletedCount: 0, skippedCount: skipped.length, deletedBibs: [], skipped });
    }

    const deleteBibSet = new Set(toDelete);
    // Same lifecycle-gated, three-file atomic transaction as the
    // single-student DELETE above, just filtering by a Set instead of one
    // bib. No other student's bib/data is touched.
    const writeOutcome = await runIfEventStillOpen(eventGate.epoch, async () => {
      await store.update(STUDENTS_FILE, [], (students) => ({
        data: students.filter((s) => !deleteBibSet.has(s.bib)),
        result: null,
      }));
      await store.update(RESULTS_FILE, [], (results) => ({
        data: results.filter((r) => !deleteBibSet.has(r.bib)),
        result: null,
      }));
      await store.update(CHECKINS_FILE, [], (checkins) => ({
        data: checkins.filter((c) => !deleteBibSet.has(c.bib)),
        result: null,
      }));
    });
    if (!writeOutcome.ok) {
      return sendJSON(res, 400, { error: writeOutcome.error, lifecycleState: writeOutcome.lifecycleState });
    }

    const schoolsAffected = [...new Set(candidates.filter((s) => toDelete.includes(s.bib)).map((s) => s.schoolCode))];
    const categoriesAffected = [...new Set(candidates.filter((s) => toDelete.includes(s.bib)).map((s) => s.categoryCode))];
    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'student.bulk-delete',
      target: null,
      result: skipped.length ? 'partial' : 'success',
      detail: `deleted ${toDelete.length}/${requestedCount}; schools=${schoolsAffected.join(',')}; categories=${categoriesAffected.join(',')}; bibs=${toDelete.join(', ')}`,
    });

    sendJSON(res, 200, {
      requestedCount,
      deletedCount: toDelete.length,
      skippedCount: skipped.length,
      deletedBibs: toDelete,
      skipped,
    });
  });
}

module.exports = { register };
