const { CATEGORIES, COUNTERS_FILE } = require('./config');
const store = require('./store');

// Bib format: {SchoolCode}-{CategoryBibCode}-{Seq}
// Each school has its own sequence per category, starting at the category's
// rangeStart (e.g. TK-T2L-101, TK-T2L-102, ... independent of SL-T2L-101, ...).
// Once assigned, a bib is never reused or regenerated - only deleting and
// recreating a participant can produce a new bib.
function generateBib(schoolCode, categoryCode) {
  return store.update(COUNTERS_FILE, {}, (counters) => {
    const category = CATEGORIES.find((c) => c.code === categoryCode);
    const key = `${schoolCode}-${categoryCode}`;
    const current = counters[key] || category.rangeStart - 1;
    const next = current + 1;
    if (next > category.rangeEnd) {
      throw new Error(
        `Bib range exhausted for ${schoolCode} in category ${categoryCode} (limit ${category.rangeEnd})`
      );
    }
    const bib = `${schoolCode}-${category.bibCode}-${next}`;
    return { data: { ...counters, [key]: next }, result: bib };
  });
}

module.exports = { generateBib };
