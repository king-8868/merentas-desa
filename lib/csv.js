// Minimal hand-rolled CSV parser (no dependency) - handles comma-separated
// fields with optional double-quote wrapping and "" as an escaped quote.
// Each row must be a single line (no embedded newlines inside quoted fields),
// which is sufficient for simple tabular imports like student registration.
function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

// Returns { headers, rows } where headers are lowercased and rows are
// objects keyed by header name (so column order in the CSV doesn't matter).
function parseCSV(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] !== undefined ? cells[i] : '';
    });
    return obj;
  });
  return { headers, rows };
}

module.exports = { parseCSV };
