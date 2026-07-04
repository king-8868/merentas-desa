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

// SINGLE source of truth for the nav bar's content and ordering. No page's
// HTML hardcodes its own <a> list anymore (see renderNav() below) - every
// page just has an empty <nav></nav>, filled in from here.
const NAV_ITEMS = [
  { href: 'index.html', label: 'Utama' },
  { href: 'register.html', label: 'Pendaftaran Peserta' },
  { href: 'checkin.html', label: 'Daftar Masuk' },
  { href: 'race-control.html', label: 'Kawalan Perlumbaan' },
  { href: 'record.html', label: 'Rekod Tamat' },
  { href: 'rankings.html', label: 'Kedudukan &amp; Markah Sekolah' },
  { href: 'leaderboard.html', label: 'Papan Markah Langsung' },
  { href: 'schools.html', label: 'Pengurusan Sekolah' },
  { href: 'scoring.html', label: 'Konfigurasi Markah' },
  { href: 'users.html', label: 'Pengurusan Pengguna' },
  { href: 'system-info.html', label: 'Maklumat Sistem' },
  { href: 'event-settings.html', label: 'Tetapan Acara' },
];

// Which nav links each role gets to see. Backend routes are the real
// enforcement (see lib/auth.js's requireAuth) - this only decides what the
// menu offers. 'public' is for an anonymous visitor (currently only
// leaderboard.html renders without requiring a session).
const NAV_VISIBILITY = {
  admin: ['index.html', 'register.html', 'checkin.html', 'race-control.html', 'record.html', 'rankings.html', 'leaderboard.html', 'schools.html', 'scoring.html', 'users.html', 'system-info.html', 'event-settings.html'],
  school: ['index.html', 'register.html', 'rankings.html', 'leaderboard.html'],
  official: ['index.html', 'register.html', 'checkin.html', 'race-control.html', 'record.html', 'rankings.html', 'leaderboard.html'],
  public: ['leaderboard.html'],
};

const ROLE_LABELS = {
  admin: 'Pentadbir',
  school: 'Pengurus Sekolah',
  official: 'Pegawai Perlumbaan',
};

// Builds the nav bar's DOM nodes directly from NAV_ITEMS, filtered by role -
// an unauthorized link is never created in the first place, not created-
// then-hidden. Call this only once the role is actually known (requireLogin
// awaits /api/auth/me first) so there's no window where a fuller, static
// nav is visible before role-based filtering kicks in.
function renderNav(role) {
  const nav = document.querySelector('nav');
  if (!nav) return;
  const allowed = NAV_VISIBILITY[role] || [];
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  nav.innerHTML = '';
  NAV_ITEMS
    .filter((item) => allowed.includes(item.href))
    .forEach((item) => {
      const a = document.createElement('a');
      a.href = item.href;
      a.innerHTML = item.label;
      if (item.href === currentPage) a.className = 'active';
      nav.appendChild(a);
    });
  if (role !== 'public') addLogoutLink();
}

// For leaderboard.html only: it's deliberately public (no requireLogin call,
// no redirect ever) since it's meant to run unattended on a projector. This
// does a best-effort, non-redirecting session check so someone who *is*
// logged in still gets their normal role-appropriate nav (e.g. to navigate
// back to another page) while a genuinely anonymous viewer only ever gets
// the public nav (leaderboard.html itself) - never an unauthorized link.
async function renderPublicPageNav() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error('no session');
    const user = await res.json();
    renderNav(user.role);
  } catch (err) {
    renderNav('public');
  }
}

// Usability patch: wraps a password <input> with a 👁️/🙈 toggle button that
// switches it between type="password" and type="text". Purely a display
// convenience for the person typing - does not touch how the value is
// submitted or validated. Safe to call more than once on the same input
// (e.g. a dynamically-created reset-password field) - guarded so it never
// wraps the same input twice.
function addPasswordToggle(input) {
  if (!input || input.dataset.toggleAdded) return;
  input.dataset.toggleAdded = 'true';
  const wrapper = document.createElement('span');
  wrapper.className = 'password-field-wrapper';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.textContent = '👁️';
  toggle.setAttribute('aria-label', 'Tunjuk/Sembunyi kata laluan');
  toggle.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? '👁️' : '🙈';
  });
  wrapper.appendChild(toggle);
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

// 1.3: shows who is logged in (username, role, school if applicable) in the
// header, next to the nav. Purely a display convenience - the server-side
// checks in lib/auth.js are the actual enforcement, unaffected by this.
function addUserBadge(user) {
  const header = document.querySelector('header');
  if (!header || header.querySelector('.user-badge')) return;
  const badge = document.createElement('div');
  badge.className = 'user-badge';
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const schoolPart = user.schoolCode ? ` &middot; ${escapeHTML(user.schoolCode)}` : '';
  badge.innerHTML = `${escapeHTML(user.username)} &middot; ${escapeHTML(roleLabel)}${schoolPart}`;
  header.appendChild(badge);
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
  renderNav(user.role);
  addUserBadge(user);
  return user;
}

// Usability patch: the event title/year used to be hardcoded text baked
// into every page's <h1>/<h2> (and a shorter "KEJOHANAN MERENTAS DESA
// {year}" version on login.html/change-password.html). Both are now
// data/event-config.json (see routes/system.js), editable from
// event-settings.html - this fetches it and overwrites whatever static text
// is in the markup, so every page (including the public leaderboard, hence
// no auth here) shows the current title/year without needing a code change.
// Self-installs like addFooter() below - runs on every page since app.js is
// loaded everywhere. If the fetch fails for any reason, the static fallback
// text already in the HTML stays as-is rather than showing something blank.
async function applyEventBranding() {
  let config;
  try {
    config = await fetchJSON('/api/event-config');
  } catch (err) {
    return;
  }
  const h1 = document.querySelector('header h1, .login-card h1');
  const h2 = document.querySelector('header h2');
  if (h1 && h1.closest('.login-card')) {
    h1.textContent = `KEJOHANAN MERENTAS DESA ${config.year}`;
  } else {
    if (h1) h1.textContent = config.titleLine1;
    if (h2) h2.textContent = config.titleLine2 || '';
  }
}
applyEventBranding();

// 1.3: consistent footer on every page. Self-installs from here (app.js is
// already included on all 13 pages, including the public leaderboard) so no
// page's own markup needs to change - this script runs after the body is
// already parsed (it's loaded at the end of <body>), so appending now is safe.
function addFooter() {
  if (document.querySelector('footer.app-footer')) return;
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = `
    <p>Merentas Desa Management System</p>
    <p>Developed by William Ngu &middot; &copy; 2026 William Ngu</p>
  `;
  document.body.appendChild(footer);
}
addFooter();
