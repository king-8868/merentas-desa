const fs = require('fs');
const {
  STUDENTS_FILE,
  RESULTS_FILE,
  CHECKINS_FILE,
  RACE_STATUS_FILE,
  SCHOOLS_FILE,
  USERS_FILE,
  CATEGORIES,
} = require('./config');
const { logAudit } = require('./audit');

// Runs once at startup, after lib/init-data.js has ensured every file
// exists. This never blocks startup and never throws past its own
// boundary - a data problem should be visible, not fatal (matches this
// project's existing "never crash mid-event" philosophy in server.js's
// uncaughtException handler). It only reports; nothing here modifies data.
function tryParse(file) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function checkIntegrity() {
  try {
    return runChecks();
  } catch (err) {
    // A bug in the checker itself must not be able to take the server
    // down - this whole module is a diagnostic aid, never a gate.
    console.error('Semakan integriti data gagal dijalankan (sistem tetap berjalan):', err.message);
    return [];
  }
}

function runChecks() {
  const warnings = [];
  const warn = (message) => warnings.push(message);

  const filesToParse = [
    ['students.json', STUDENTS_FILE],
    ['results.json', RESULTS_FILE],
    ['checkins.json', CHECKINS_FILE],
    ['race-status.json', RACE_STATUS_FILE],
    ['schools.json', SCHOOLS_FILE],
    ['users.json', USERS_FILE],
  ];

  const parsed = {};
  for (const [label, file] of filesToParse) {
    const result = tryParse(file);
    if (!result.ok) {
      warn(`Fail data rosak (bukan JSON yang sah): ${label} - ${result.error}`);
    } else {
      parsed[label] = result.data;
    }
  }

  const students = parsed['students.json'];
  const schools = parsed['schools.json'];
  const results = parsed['results.json'];
  const checkins = parsed['checkins.json'];
  const raceStatus = parsed['race-status.json'];

  if (Array.isArray(students) && Array.isArray(schools)) {
    const schoolCodes = new Set(schools.map((s) => s.code));
    const categoryCodes = new Set(CATEGORIES.map((c) => c.code));
    for (const s of students) {
      if (!schoolCodes.has(s.schoolCode)) {
        warn(`Peserta yatim: bib ${s.bib} merujuk kod sekolah tidak wujud "${s.schoolCode}"`);
      }
      if (!categoryCodes.has(s.categoryCode)) {
        warn(`Peserta yatim: bib ${s.bib} merujuk kod kategori tidak wujud "${s.categoryCode}"`);
      }
    }
  }

  if (Array.isArray(results) && Array.isArray(students)) {
    const bibs = new Set(students.map((s) => s.bib));
    for (const r of results) {
      if (!bibs.has(r.bib)) {
        warn(`Keputusan yatim: bib "${r.bib}" tiada dalam senarai peserta`);
      }
    }
  }

  if (Array.isArray(checkins) && Array.isArray(students)) {
    const bibs = new Set(students.map((s) => s.bib));
    for (const c of checkins) {
      if (!bibs.has(c.bib)) {
        warn(`Daftar masuk yatim: bib "${c.bib}" tiada dalam senarai peserta`);
      }
    }
  }

  // v1.7: race-status.json is keyed by raceGroupCode (e.g. 'T1', shared by
  // the Tahap 1 Lelaki + Perempuan categories), not categoryCode - see
  // lib/config.js's RACE_GROUPS. The validation itself doesn't care what the
  // key represents, only the wording below needed updating.
  if (raceStatus && typeof raceStatus === 'object' && !Array.isArray(raceStatus)) {
    for (const [raceGroupCode, entry] of Object.entries(raceStatus)) {
      if (!entry) continue;
      if (entry.finishedAt && !entry.startTime) {
        warn(`Keadaan perlumbaan tidak sah untuk kumpulan lumba "${raceGroupCode}": ada masa tamat tetapi tiada masa mula`);
      }
      if (entry.startTime && entry.finishedAt && entry.finishedAt < entry.startTime) {
        warn(`Keadaan perlumbaan tidak sah untuk kumpulan lumba "${raceGroupCode}": masa tamat lebih awal daripada masa mula`);
      }
    }
  }

  if (warnings.length) {
    console.warn(`\nSemakan integriti data: ${warnings.length} amaran ditemui (sistem tetap berjalan):`);
    warnings.forEach((w) => console.warn(`  - ${w}`));
    warnings.forEach((w) =>
      logAudit({
        actor: 'system',
        actorRole: null,
        action: 'integrity.warning',
        target: null,
        result: 'warning',
        detail: w,
      })
    );
  } else {
    console.log('\nSemakan integriti data: tiada masalah ditemui.');
  }

  return warnings;
}

module.exports = { checkIntegrity };
