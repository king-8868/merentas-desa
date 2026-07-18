const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { CATEGORIES, CONSENT_FORM_TEMPLATE_FILE, isLegacyTahap1 } = require('./config');

// v1.9.0 Document Generator - "Borang Perakuan Kesihatan Murid Menyertai
// Aktiviti Kokurikulum" (the first and, for now, only supported document).
//
// Design: pdf-lib loads the ORIGINAL two-page template into memory and
// overlays text at coordinates calibrated against the template's actual
// vector geometry (table borders / underlines), never re-drawing the
// table/letterhead itself - this is what keeps the output visually
// identical to the official form. The template file on disk is opened
// read-only (fs.readFileSync) and never written back to.

// Safety cap, not a business limit: each school's real ceiling is already
// enforced by the bib ranges in CATEGORIES (99 slots x 4 categories = 396
// max per school), so this can never trigger for a normal school. It only
// exists as a circuit breaker against something pathological (e.g. corrupt
// data producing thousands of rows) blowing up memory/response time.
const MAX_STUDENTS_PER_GENERATION = 500;

const MALAY_MONTHS = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
];

// isoDate is always 'YYYY-MM-DD' (that's what <input type="date"> sends and
// what routes/system.js validates on save). Returns '' for anything else
// rather than guessing - a malformed date must never silently become "NaN
// undefined 2026" on an official document.
function formatMalayDate(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (m < 1 || m > 12) return '';
  return `${d} ${MALAY_MONTHS[m - 1]} ${y}`;
}

// Whether `text` contains any character the standard Helvetica/WinAnsi font
// can't encode (e.g. Chinese characters). pdf-lib itself throws on this the
// moment you try to measure/draw such text - this just turns that into a
// clean yes/no check we can act on *before* drawing anything, so a bad
// character produces one clear rejected-generation error instead of a
// half-written PDF or a crashed request.
function hasUnsupportedCharacters(font, text) {
  if (!text) return false;
  try {
    font.widthOfTextAtSize(text, 10);
    return false;
  } catch (err) {
    return true;
  }
}

// Shrinks `text` in 0.5pt steps until it fits `maxWidth` at `font`, down to
// `minSize`. Never truncates the string itself - if it still doesn't fit at
// minSize, it's drawn at minSize anyway (a same-length string just slightly
// over the nominal boundary reads far better than a silently clipped name).
function fitSingleLine(font, text, maxWidth, maxSize = 11, minSize = 7) {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size = Math.round((size - 0.5) * 2) / 2;
  }
  return size;
}

// --- Field coordinates -----------------------------------------------------
// Calibrated directly against templates/borang-pengakuan.pdf's own vector
// geometry (table border / underline positions), not eyeballed - see the
// CHANGELOG [1.9.0] entry for how. Page size is US Letter (612x792pt);
// pdf-lib's origin is bottom-left, y increasing upward.
//
// If the ministry ever issues a revised template, these will need
// recalibrating against the new file - that's the one real maintenance
// cost of the "overlay on the original" approach (see the Phase 1
// feasibility report).

// Page 1 answer cells all share the same left/right cell boundaries
// (x 233.45-553.9); only the row (y) differs per field.
const P1_X = 241.45;
const P1_MAX_WIDTH = 304.45;
const PAGE1 = {
  namaAktiviti: { y: 602.66 },
  peringkatAktiviti: { y: 537.96 },
  namaPenuhMurid: { y: 512.87 },
  jantina: { y: 462.83 },
};
// TARIKH DAN TEMPAT PROGRAM: row is tall enough for 2 lines if a single
// "date, venue" line doesn't fit.
const PAGE1_TARIKH_TEMPAT = { yLine1: 579.38, yLine2: 565.38, ySingle: 570.32 };

// Page 2 fields sit on individual dashed underlines within a paragraph, not
// boxed cells - x/maxWidth are per-field since each blank is a different
// width.
const PAGE2 = {
  namaMurid: { x: 210.21, y: 683.94, maxWidth: 289.89 },
  namaSekolah: { x: 184.62, y: 649.38, maxWidth: 297.48 },
  namaAktiviti: { x: 299.73, y: 632.22, maxWidth: 254.37 },
  // Fallback line used only if the activity name doesn't fit on the line
  // above even at minimum size - the blank dashed continuation line
  // spanning almost the full page width, one line below.
  namaAktivitiFallback: { x: 88.62, y: 614.94, maxWidth: 465.48 },
  tarikhMula: { x: 206.25, y: 597.66, maxWidth: 66.76 },
  tarikhTamat: { x: 327.11, y: 597.66, maxWidth: 67.48 },
  tempat: { x: 429.95, y: 597.66, maxWidth: 124.15 },
};

function genderLabelForStudent(student) {
  if (student.categoryCode === 'C' && isLegacyTahap1(student)) return ''; // unknown - never guessed
  const category = CATEGORIES.find((c) => c.code === student.categoryCode);
  if (!category || !category.gender) return '';
  return category.gender === 'L' ? 'LELAKI' : category.gender === 'P' ? 'PEREMPUAN' : '';
}

let cachedTemplateBytes = null;
function loadTemplateBytes() {
  // Cached after first read - the template is a static, read-only asset
  // that never changes while the process is running, so there's no reason
  // to hit disk again on every generation.
  if (!cachedTemplateBytes) {
    cachedTemplateBytes = fs.readFileSync(CONSENT_FORM_TEMPLATE_FILE);
  }
  return cachedTemplateBytes;
}

// Collects every field this document would need to draw, across the whole
// batch, so all can be checked for unsupported characters BEFORE any page
// is touched - a bad character in student #47 of 50 must reject the whole
// request cleanly, not leave a partially-built PDF behind.
function collectDrawableStrings(students, school, eventFields) {
  const strings = [eventFields.namaAktiviti, eventFields.peringkatAktiviti, school.name];
  students.forEach((s) => strings.push(s.name));
  return strings.filter(Boolean);
}

// Throws AppError-shaped { code, message, status } style errors (plain
// Error with .status) - routes/documents.js maps these to HTTP responses.
class ConsentFormError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 400;
  }
}

// eventConfig must already have non-empty titleLine1/titleLine2/venue/
// activityStartDate/activityEndDate - routes/documents.js checks this
// before calling in, but it's re-checked here too since this module has no
// other caller and must never produce a document with a silently-blank
// activity name/date/venue.
async function generateConsentFormPdf({ students, school, eventConfig }) {
  if (!Array.isArray(students) || students.length === 0) {
    throw new ConsentFormError('Sekolah ini tiada peserta berdaftar - tiada dokumen untuk dijana.', 400);
  }
  if (students.length > MAX_STUDENTS_PER_GENERATION) {
    throw new ConsentFormError(
      `Bilangan peserta (${students.length}) melebihi had penjanaan (${MAX_STUDENTS_PER_GENERATION}). Sila hubungi pentadbir sistem.`,
      400
    );
  }
  const namaAktiviti = String(eventConfig.titleLine1 || '').trim();
  const peringkatAktiviti = String(eventConfig.titleLine2 || '').trim();
  const venue = String(eventConfig.venue || '').trim();
  const startDateMalay = formatMalayDate(eventConfig.activityStartDate);
  const endDateMalay = formatMalayDate(eventConfig.activityEndDate);
  if (!namaAktiviti || !venue || !startDateMalay || !endDateMalay) {
    throw new ConsentFormError(
      'Tetapan acara belum lengkap (nama aktiviti/tempat/tarikh mula/tarikh tamat). Sila lengkapkan di Tetapan Acara sebelum menjana dokumen.',
      400
    );
  }

  const templateBytes = loadTemplateBytes();
  const srcDoc = await PDFDocument.load(templateBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  // v1.9.0 is Latin-script only by design (see CHANGELOG) - checked up
  // front, once, for the whole batch, before any page is built.
  const allStrings = collectDrawableStrings(students, school, { namaAktiviti, peringkatAktiviti });
  const unsupported = allStrings.find((s) => hasUnsupportedCharacters(font, s));
  if (unsupported) {
    throw new ConsentFormError(
      'Dokumen tidak dapat dijana kerana nama murid atau sekolah mengandungi aksara yang belum disokong.',
      422
    );
  }

  const tarikhTempatSingle = `${startDateMalay}${startDateMalay === endDateMalay ? '' : ` - ${endDateMalay}`}, ${venue}`;

  for (const student of students) {
    // Each student gets their OWN freshly-copied pair of template pages -
    // copyPages() clones page content into `outDoc` independently each
    // call, so drawing on one student's pages can never bleed into
    // another's (this is what guarantees "no later student overwrites an
    // earlier one").
    // eslint-disable-next-line no-await-in-loop
    const [p1, p2] = await outDoc.copyPages(srcDoc, [0, 1]);
    outDoc.addPage(p1);
    outDoc.addPage(p2);

    const gender = genderLabelForStudent(student);
    const draw = (page, text, x, y, maxWidth, maxSize = 11, minSize = 7) => {
      if (!text) return;
      const size = fitSingleLine(font, text, maxWidth, maxSize, minSize);
      page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
    };

    // --- Page 1 ---
    draw(p1, namaAktiviti, P1_X, PAGE1.namaAktiviti.y, P1_MAX_WIDTH);
    draw(p1, peringkatAktiviti, P1_X, PAGE1.peringkatAktiviti.y, P1_MAX_WIDTH);
    draw(p1, student.name, P1_X, PAGE1.namaPenuhMurid.y, P1_MAX_WIDTH);
    draw(p1, gender, P1_X, PAGE1.jantina.y, P1_MAX_WIDTH);

    // TARIKH DAN TEMPAT PROGRAM: single "date[-date], venue" line if it
    // fits at a readable size, otherwise date and venue on their own lines
    // - the row is tall enough for both (see PAGE1_TARIKH_TEMPAT).
    const singleFitSize = fitSingleLine(font, tarikhTempatSingle, P1_MAX_WIDTH, 11, 8);
    if (font.widthOfTextAtSize(tarikhTempatSingle, singleFitSize) <= P1_MAX_WIDTH) {
      draw(p1, tarikhTempatSingle, P1_X, PAGE1_TARIKH_TEMPAT.ySingle, P1_MAX_WIDTH, 11, 8);
    } else {
      const dateLine = startDateMalay === endDateMalay ? startDateMalay : `${startDateMalay} - ${endDateMalay}`;
      draw(p1, dateLine, P1_X, PAGE1_TARIKH_TEMPAT.yLine1, P1_MAX_WIDTH);
      draw(p1, venue, P1_X, PAGE1_TARIKH_TEMPAT.yLine2, P1_MAX_WIDTH);
    }

    // --- Page 2 ---
    draw(p2, student.name, PAGE2.namaMurid.x, PAGE2.namaMurid.y, PAGE2.namaMurid.maxWidth);
    draw(p2, school.name, PAGE2.namaSekolah.x, PAGE2.namaSekolah.y, PAGE2.namaSekolah.maxWidth);
    draw(p2, startDateMalay, PAGE2.tarikhMula.x, PAGE2.tarikhMula.y, PAGE2.tarikhMula.maxWidth, 10, 6);
    draw(p2, endDateMalay, PAGE2.tarikhTamat.x, PAGE2.tarikhTamat.y, PAGE2.tarikhTamat.maxWidth, 10, 6);
    draw(p2, venue, PAGE2.tempat.x, PAGE2.tempat.y, PAGE2.tempat.maxWidth, 10, 6);

    const fitsOnNarrowLine = font.widthOfTextAtSize(namaAktiviti, fitSingleLine(font, namaAktiviti, PAGE2.namaAktiviti.maxWidth, 11, 8)) <= PAGE2.namaAktiviti.maxWidth;
    if (fitsOnNarrowLine) {
      draw(p2, namaAktiviti, PAGE2.namaAktiviti.x, PAGE2.namaAktiviti.y, PAGE2.namaAktiviti.maxWidth, 11, 8);
    } else {
      draw(p2, namaAktiviti, PAGE2.namaAktivitiFallback.x, PAGE2.namaAktivitiFallback.y, PAGE2.namaAktivitiFallback.maxWidth);
    }
  }

  return outDoc.save();
}

module.exports = { generateConsentFormPdf, formatMalayDate, genderLabelForStudent, ConsentFormError, MAX_STUDENTS_PER_GENERATION };
