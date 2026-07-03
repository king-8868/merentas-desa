async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTimeToSeconds(str) {
  const parts = str.split(':').map(Number);
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1 && !isNaN(parts[0])) {
    return parts[0];
  }
  return NaN;
}

// Consistent categorical palette, mapped by school index (Tableau-10 inspired)
const SCHOOL_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#af7aa1', '#b07aa1', '#e0483e', '#9c755f', '#5b6b8c',
];

function schoolBadge(schoolCode, schools) {
  const idx = schools.findIndex((s) => s.code === schoolCode);
  const color = SCHOOL_COLORS[idx >= 0 ? idx % SCHOOL_COLORS.length : 0];
  const school = schools.find((s) => s.code === schoolCode);
  const label = school ? school.code : schoolCode;
  return `<span class="school-badge" style="color:${color};border-color:${color}" title="${school ? school.name : ''}">${label}</span>`;
}

function categoryBadge(categoryCode, categories) {
  const cat = categories.find((c) => c.code === categoryCode);
  const label = cat ? cat.code : categoryCode;
  return `<span class="category-badge ${categoryCode}">${label}</span>`;
}

// CSV export helpers (zero-dependency: generated client-side, downloaded via Blob).
function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function toCSV(rows, columns) {
  const headerLine = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(','));
  return [headerLine, ...lines].join('\r\n');
}

function downloadCSV(filename, csvContent) {
  // Leading BOM so Excel correctly detects UTF-8 instead of mangling text.
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
