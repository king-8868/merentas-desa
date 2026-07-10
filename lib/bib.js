const { CATEGORIES } = require('./config');

// Bib format: {SchoolCode}-{CategoryBibCode}-{Seq}
// Each school has its own sequence per category, starting at the category's
// rangeStart (e.g. TK-T2L-101, TK-T2L-102, ... independent of SL-T2L-101, ...).
//
// V3 design: a bib is a registration slot, not a permanent ID. There is no
// separate counter file - the next number is always derived by scanning the
// current roster for this schoolCode+categoryCode and picking the smallest
// unused sequence in range (First Available Bib). Deleting a student frees
// their number for the very next registration in that same school+category;
// no other student's bib is ever touched. Pure function, no I/O - the caller
// is responsible for running this inside the same store.update(STUDENTS_FILE)
// transaction that inserts the new student, so concurrent registrations for
// the same school+category can never pick the same number (lib/store.js
// serializes all mutator calls against one file).
function pickBib(students, schoolCode, categoryCode) {
  const category = CATEGORIES.find((c) => c.code === categoryCode);
  const used = new Set(
    students
      .filter((s) => s.schoolCode === schoolCode && s.categoryCode === categoryCode)
      .map((s) => Number(s.bib.slice(s.bib.lastIndexOf('-') + 1)))
  );
  let seq = category.rangeStart;
  while (used.has(seq) && seq <= category.rangeEnd) seq++;
  if (seq > category.rangeEnd) {
    throw new Error(
      `Bib range exhausted for ${schoolCode} in category ${categoryCode} (limit ${category.rangeEnd})`
    );
  }
  return `${schoolCode}-${category.bibCode}-${seq}`;
}

module.exports = { pickBib };
