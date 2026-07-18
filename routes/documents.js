const store = require('../lib/store');
const { STUDENTS_FILE, SCHOOLS_FILE, EVENT_CONFIG_FILE, SEED_EVENT_CONFIG } = require('../lib/config');
const { requireAuth } = require('../lib/auth');
const { logAudit } = require('../lib/audit');
const { generateConsentFormPdf, ConsentFormError } = require('../lib/consent-form');

// v1.9.0 Document Generator - "Borang Perakuan Kesihatan Murid" only, for
// now (see CHANGELOG for the deliberately narrow v1 scope: no template
// management center, no other document types).
//
// The PDF is built entirely in memory (lib/consent-form.js) and streamed
// straight back as the response body - nothing is ever written to a
// temporary file or kept on the server after the request completes, and
// nothing is served from /public. Response headers are set to explicitly
// forbid caching (this document carries student names/gender - see the
// privacy section of the feature discussion).

// Strips everything except letters/digits/dash/underscore, so a school
// name or activity title can never inject a header, a path segment, or
// anything unexpected into the Content-Disposition filename.
function sanitizeFilenamePart(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

function noStoreHeaders(extra) {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    ...extra,
  };
}

function register(router) {
  router.add('GET', '/api/documents/consent-form', async (req, res, { query, sendJSON }) => {
    const user = requireAuth(req, res, sendJSON, 'student.consent-form');
    if (!user) return;

    // School scope is decided ENTIRELY by the logged-in identity for a
    // School Manager - a ?schoolCode= in the query string is silently
    // ignored for that role, never trusted (same pattern as GET
    // /api/students and the bulk-delete endpoint). Admin may specify one.
    let schoolCode;
    if (user.role === 'school') {
      schoolCode = user.schoolCode;
    } else {
      schoolCode = String(query.get('schoolCode') || '').trim();
      if (!schoolCode) {
        return sendJSON(res, 400, { error: 'Parameter schoolCode diperlukan (cth: ?schoolCode=TK)' });
      }
    }

    const schools = store.readJSON(SCHOOLS_FILE, []);
    const school = schools.find((s) => s.code === schoolCode);
    if (!school) {
      return sendJSON(res, 404, { error: `Sekolah "${schoolCode}" tidak wujud` });
    }

    const allStudents = store.readJSON(STUDENTS_FILE, []);
    const students = allStudents.filter((s) => s.schoolCode === schoolCode);
    const eventConfig = store.readJSON(EVENT_CONFIG_FILE, SEED_EVENT_CONFIG);

    let pdfBytes;
    try {
      pdfBytes = await generateConsentFormPdf({ students, school, eventConfig });
    } catch (err) {
      if (err instanceof ConsentFormError) {
        // Never log the student roster itself - only what's needed to
        // diagnose a recurring problem (who asked, for which school, how
        // many students, and the generic rejection reason).
        logAudit({
          actor: user.username,
          actorRole: user.role,
          action: 'document.consent-form.generate',
          target: schoolCode,
          result: 'rejected',
          detail: `studentCount=${students.length}; reason=${err.message}`,
        });
        return sendJSON(res, err.status, { error: err.message });
      }
      console.error('Document Generator: unexpected error (school=%s, studentCount=%d):', schoolCode, students.length, err.message);
      return sendJSON(res, 500, { error: 'Ralat tidak dijangka semasa menjana dokumen.' });
    }

    const safeSchoolCode = sanitizeFilenamePart(schoolCode, 'SEKOLAH');
    const safeEventName = sanitizeFilenamePart(eventConfig.titleLine1, 'Acara');
    const filename = `Borang_Kebenaran_${safeSchoolCode}_${safeEventName}.pdf`;

    logAudit({
      actor: user.username,
      actorRole: user.role,
      action: 'document.consent-form.generate',
      target: schoolCode,
      result: 'success',
      detail: `studentCount=${students.length}; documentType=consent-form`,
    });

    res.writeHead(200, noStoreHeaders({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBytes.length,
    }));
    res.end(Buffer.from(pdfBytes));
  });
}

module.exports = { register };
