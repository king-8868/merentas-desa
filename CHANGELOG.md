# Changelog

All notable changes to the Kejohanan Merentas Desa 2026 system are documented
in this file.

## Current System Capability Summary (as of 1.2-RC)

- **Registration**: per-school, per-category, auto-generated permanent bib
  numbers (`{School}-{Category}-{Seq}`), CSV batch import with per-row
  best-effort error reporting.
- **Check-in**: bib/name search, idempotent, undo with confirmation.
- **Race Control**: independent per-category timer, `NOT_STARTED → RUNNING →
  FINISHED` state machine, `FINISHED` locks that category's results.
- **Finish Recording**: one-action (search + Finish), server-derived time,
  idempotent, no manual time entry ever.
- **Live Leaderboard**: public, unauthenticated, auto-refreshing.
- **School Scoring**: fully runtime-configurable points table and
  top-N-per-school, takes effect immediately.
- **Authentication & RBAC**: 4 roles (Administrator, School Manager, Race
  Official, public read-only), session cookies, forced password change on
  first login, server-side school data isolation.
- **Event Lifecycle**: Open/Close/Archive/Create New, race-condition-safe
  under concurrent load, historical data always archived before being
  cleared.
- **Audit Log**: append-only, covers login/logout, student/check-in/race/
  result mutations, and permission-denied attempts.
- **Permission Matrix**: externalized to `data/role_permissions.json`, hot-
  editable, fails closed on unknown keys.
- **Known gaps** (see the 1.2-RC Report's Security Check for detail): school
  create/rename, scoring config changes, new-user creation, and password
  changes are not yet in the audit log; the permission matrix is only seeded
  once (a new permission key added in the future needs a manual one-time
  entry in the live JSON file).

## [1.2-RC] - Release Candidate

Stops all new features/architecture changes. Focused on making the system
deliverable: full documentation set (`docs/`), safe code cleanup (no logic
changes), a project structure + security review, and this changelog brought
up to date through 1.1-E. See the RC Report for the full findings.

## [1.2 Beta Validation]

Full beta test pass across 20 categories (Authentication, Session Recovery,
RBAC, School Isolation, Registration, Bib Generation, Check-in, Race Control,
Result Recording, Leaderboard, Lifecycle, Archive, Create New, Audit Log,
Permission Matrix, Server Restart Recovery, CSV Import, Concurrent Requests,
Stress Test, Invalid Input) plus exploratory edge cases — 130 checks, all
passing, zero application bugs found. Verified directly:
- The 1.1-E lifecycle race-condition fix holds under real concurrent load
  (30+ simultaneous requests racing a full Close→Archive→Create New cycle).
- Server restart recovery: session, data, and lifecycle epoch all survive a
  kill + restart.
- Permission matrix hot-editing (`data/role_permissions.json`) takes effect
  with zero code change or restart.

## [1.1-E] - Event Lifecycle, Audit Logging & Permission Matrix

Architectural upgrade from "permissions work" to "auditable, traceable,
evolvable" — no new user-facing features.

- **Event Lifecycle** (`lib/lifecycle.js`, `routes/lifecycle.js`): whole-
  system state machine `OPEN → CLOSED → ARCHIVED → (Create New) → OPEN`,
  distinct from the per-category race state machine added in 1.1-C. Every
  event-scoped mutation (students/results/checkins/race-status/counters) is
  gated on the event being OPEN. Archive snapshots everything to
  `data/archive/<timestamp>/` before Create New ever clears it — historical
  data is never lost.
- **Audit Log** (`lib/audit.js`, `routes/audit.js`): append-only
  `data/event_log.json`. Every login/logout, student create/edit/delete,
  check-in, race start/finish/reset, result change, and permission-denied
  attempt records actor/action/target/timestamp/result. Fire-and-forget by
  design — logging never blocks or fails the operation it describes.
- **Permission Matrix externalized** (`data/role_permissions.json`): role
  permissions extracted from hardcoded arrays in route files into one JSON
  config, resolved through a single function (`resolvePermission()` inside
  `lib/auth.js`). Editing the file changes behavior immediately, with zero
  code change or restart — verified directly. An unknown permission key
  fails closed (denies everyone), rather than accidentally granting access.
- **Blocker found and fixed during architecture review**: a race condition
  where a slow in-flight write could pass the lifecycle check while OPEN,
  then land *after* an admin completed a full Close→Archive→Create New
  cycle — silently leaking old-event data into the new event. Fixed with a
  generation counter (`epoch`, bumped on every transition) checked at the
  actual commit point, plus a shared lock so a mutation and a lifecycle
  transition can never interleave. Verified under real concurrent load (a
  30-request race against a full lifecycle cycle: every write either landed
  correctly in the archived event or was cleanly rejected — zero leaks).

## [1.1-D] - Authentication, RBAC & School Isolation Layer

- Session-based login (`lib/auth.js`, `routes/auth.js`, `login.html`,
  `change-password.html`): `crypto.scrypt` password hashing with per-user
  salt, random session tokens in `HttpOnly` cookies persisted to
  `data/sessions.json` (survives a server restart), 12-hour expiry.
- Four roles: **Administrator** (full access), **School Manager** (own-
  school-only student management, enforced server-side — `GET /api/students`
  scopes to the caller's school, every write endpoint re-forces
  `schoolCode`), **Race Official** (check-in/race-control/finish, read-only
  participant list), **Public** (`leaderboard.html` only, unauthenticated,
  unchanged).
- Every default account is forced to change its password on first login —
  no way to skip this.
- User data model supports more than one account per role from day one
  (`POST /api/auth/users`, admin-only) — ships with one default Race Official
  account, but nothing assumes that's the only one.
- Verified: login for all 4 roles, school data isolation (a live cross-school
  write attempt was silently corrected server-side to the caller's own
  school), Race Official blocked from registration/deletion, public
  leaderboard fully functional with zero cookies.

## [1.1-C] - Race Safety & Integrity Layer

- Added the missing `FINISHED` race state (previously only `NOT_STARTED`/
  `RUNNING` existed): `NOT_STARTED → RUNNING → FINISHED`, with `FINISHED`
  locking all result mutation (finish, manual override, delete) for that
  category, and blocking Reset once results exist for it (prevents orphaning
  a recorded time against a deleted clock reference).
- Fixed a real gap: `checkin.html`'s undo check-in had no confirmation
  dialog before this — added one, matching the pattern used elsewhere for
  destructive actions.
- Confirmed no regression in registration, check-in, race start, finish
  recording, live leaderboard, or school ranking.

## [1.1-B] - LAN Multi-device Access

- Verified the server already binds to all network interfaces by default
  (no code change needed for this) — added LAN IP auto-detection
  (`os.networkInterfaces()`) and startup console output showing both Local
  and Network URLs, plus README docs on connecting from other devices on the
  same WiFi (registration desk, check-in table, finish line, race control,
  each on their own device).

## [1.1-A] - XSS Security Fix

- Added `escapeHTML()` to `app.js`, applied to every `innerHTML`
  interpolation of user-supplied text (participant names, CSV import error
  echoes) across all 8 pages that existed at the time. Verified live with a
  real `<img onerror=...>` payload — renders as literal text, no script
  execution.

## [1.0.0-stable] - 2026-07-03

First stable baseline. Core system complete per PRD.md / RULES.md — covers
registration through Finish Recording, live leaderboards, configurable
scoring, and CSV import/export. Zero npm dependencies throughout.

### Phase 0 — Project Refactoring
- Split the original monolithic `server.js` into a modular `lib/` (config,
  storage, HTTP helpers, router, bib generation, CSV parsing, data init) +
  `routes/` (one file per resource) structure.
- Added `lib/store.js`: a per-file atomic write queue so concurrent race-day
  requests (e.g. two teachers checking in different runners at once) can
  never silently clobber each other's writes.
- Fixed a crash bug: a malformed request URL (`new URL()` throwing) was
  unhandled and would take the whole server down; now returns 400 and the
  process stays alive. Added a top-level `uncaughtException` /
  `unhandledRejection` safety net.
- Converted `PRD.md.rtf` / `CLAUDE.md.rtf` to plain-text `.md` (originals
  preserved).
- Bib numbering changed to per-school ranges per category: T2L 101-199,
  T2P 201-299, T1 301-399 (e.g. `TK-T2L-101`, `SL-T2L-101` independently).

### Phase 1 — Registration System
- Student registration (name, school, category) with automatic bib
  generation; bibs are permanent once issued (editing a student never
  changes it — only delete + recreate does).
- School management (`schools.html`): schools moved from a hardcoded list to
  `data/schools.json`, editable at runtime (add school, rename — school code
  is immutable once created since it's embedded in every bib already issued).

### Phase 2 — Check-in System
- `checkin.html`: search by bib or name. An exact bib match + Enter checks in
  instantly (built for barcode scanners); a name search shows a one-click
  **Daftar Masuk** button per match.
- Check-in is idempotent (double-scanning does nothing, never errors).
- Attendance statistics on `checkin.html` and the dashboard.

### Phase 3 — Race Control
- `race-control.html`: independent start button + live timer per category
  (Tahap 2 Lelaki / Tahap 2 Perempuan / Tahap 1).
- Starting is idempotent (never resets an already-running clock); a
  confirm-gated **Reset** exists for correcting an accidental start.
- Start timestamps persist to `data/race-status.json` immediately — verified
  that a simulated server crash/restart preserves the exact elapsed time
  (Recovery Mode).

### Phase 4 — Finish Recording (highest priority)
- `record.html` rebuilt: search + **Selesai** (Finish) button, no manual time
  entry in the main UI. `POST /api/results/finish` derives the finish time
  automatically from the category's race clock.
- Enforces RULES.md: a participant can only finish if checked in AND their
  category's race has started; otherwise the button is disabled with the
  reason shown.
- Idempotent (a double-press never overwrites a real finish time with a
  later, meaningless one).
- `POST /api/results` (explicit time) kept as an admin/backup override for
  edge cases (timer malfunction) — not exposed in the main UI.

### Phase 5 — Live Leaderboard
- `leaderboard.html`: pure-display, no controls, built for a projector —
  Latest Finishers feed, top-3-per-category podiums, full school ranking.
  Auto-refreshes every 3s.
- Bug fix: results now carry a `recordedAt` wall-clock timestamp separate
  from `time` (elapsed race seconds). The "recently finished" feed was
  incorrectly sorting by `time` (surfacing the slowest finishers, not the
  most recent); fixed to sort by `recordedAt`.

### Phase 6 — School Points
- Scoring made fully runtime-configurable (`scoring.html`,
  `data/scoring-config.json`): editable points-per-rank table and
  top-N-per-school cap, no code edit or restart needed. Verified changes
  take effect on the very next ranking computation.

### Phase 7 — Import / Export (CSV only, by explicit decision)
- CSV batch registration import (`register.html`): best-effort per-row
  processing with a downloadable template; reports exactly which rows
  succeeded (with bib) and which failed (with reason).
- CSV export (client-side, no new backend calls): participant list, individual
  results, school rankings, prize winners (top 3 per category).
- Excel (.xlsx) and PDF explicitly descoped to keep the project at zero npm
  dependencies.

### Phase 8 — UI Polish
- Redesigned `style.css` (shared across all 9 pages): translucent glass
  cards, pill-shaped nav/buttons/badges, system font stack, soft gradients,
  refined shadows and rounded corners.
- `leaderboard.html` widened for projector/big-screen use.
- Added `button:disabled` styling (previously unstyled).
- Fixed a forced `table { min-width: 520px }` that risked overflow below
  640px viewports.
- Added `favicon.svg`.
- Verified visually via headless Chrome (CDP device-metric emulation) at
  375px / 768px / 1400px — zero horizontal overflow, zero console errors,
  zero failed network requests across all 9 pages.

### Known limitations (by design, documented in README.md)
- No authentication (trusted local/LAN use only).
- No RFID/chip-timing integration.
- CSV only for import/export (no Excel/.xlsx, no PDF).
- A participant can only have one finish result (correct a mistake by
  deleting the result, then finishing again).
