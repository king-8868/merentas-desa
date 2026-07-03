// Escapes text before it's interpolated into an innerHTML template string or
// an HTML attribute. Anything that can contain user-supplied text (student
// names, school names, echoed CSV values in import errors, etc.) must go
// through this - otherwise a name like `<img src=x onerror=...>` executes
// for anyone viewing that page.
function escapeHTML(value) {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  return `<span class="school-badge" style="color:${color};border-color:${color}" title="${escapeHTML(school ? school.name : '')}">${escapeHTML(label)}</span>`;
}

function categoryBadge(categoryCode, categories) {
  const cat = categories.find((c) => c.code === categoryCode);
  const label = cat ? cat.code : categoryCode;
  return `<span class="category-badge ${escapeHTML(categoryCode)}">${escapeHTML(label)}</span>`;
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

// Which nav links each role gets to see. Backend routes are the real
// enforcement (see lib/auth.js's requireAuth) - this only keeps the menu
// from offering pages/actions a role can't use.
const NAV_VISIBILITY = {
  admin: ['index.html', 'register.html', 'checkin.html', 'race-control.html', 'record.html', 'rankings.html', 'leaderboard.html', 'schools.html', 'scoring.html'],
  school: ['index.html', 'register.html', 'rankings.html', 'leaderboard.html'],
  official: ['index.html', 'register.html', 'checkin.html', 'race-control.html', 'record.html', 'rankings.html', 'leaderboard.html'],
};

function applyNavVisibility(role) {
  const allowed = NAV_VISIBILITY[role] || [];
  document.querySelectorAll('nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === 'leaderboard.html') return; // always visible, always public
    a.style.display = allowed.includes(href) ? '' : 'none';
  });
}

function addLogoutLink() {
  const nav = document.querySelector('nav');
  if (!nav || nav.querySelector('.logout-link')) return;
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'logout-link';
  link.textContent = 'Log Keluar';
  link.style.marginLeft = 'auto';
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
  nav.appendChild(link);
}

// Call at the top of every protected page's script, before any data
// loading. Redirects to login.html if not authenticated, to
// change-password.html if the account still has the forced first-login
// password change pending, or to index.html if logged in but this page's
// role isn't in allowedRoles. Returns the session user on success (the page
// can use it for further per-role UI adjustments, e.g. register.html hiding
// the school picker for a School Manager).
async function requireLogin(allowedRoles) {
  let user;
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error('not logged in');
    user = await res.json();
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
  if (user.mustChangePassword) {
    window.location.href = 'change-password.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.href = 'index.html';
    return null;
  }
  applyNavVisibility(user.role);
  addLogoutLink();
  return user;
}
