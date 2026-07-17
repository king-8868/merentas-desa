# Changelog

All notable changes to the Kejohanan Merentas Desa 2026 system are documented
in this file.

## [1.8.0] - Announcement Popup

Adds a single, simple "current announcement" - Admin edits it, School
Manager sees it as a popup on login. Deliberately narrow scope by design:
one announcement (no list), no schedule/priority/Markdown/attachments, no
per-account read history - see the feature discussion for the full list of
what was explicitly ruled out for v1.

- **New API** (`routes/announcement.js`): `GET /api/announcement` (admin,
  school - `announcement.view`) and `PUT /api/announcement` (admin only -
  `announcement.update`). Same "one JSON file, live source of truth after
  first run" pattern as `event-config` (`routes/system.js`) -
  `data/announcement.json`, auto-created by `lib/init-data.js` on first
  boot with `{ active: false, title: '', message: '', updatedAt: null,
  updatedBy: null }`. PUT trims title/message, caps them at 120/3000
  characters, requires both non-empty only when `active: true` (deactivating
  is allowed to keep whatever content was already there), stamps
  `updatedAt`/`updatedBy`, and is audit-logged.
- **New permissions**: `announcement.view` (admin, school) and
  `announcement.update` (admin) - Official is deliberately not in either;
  v1 has no use case for them to read or manage it. Picked up automatically
  by the startup permission-merge added in `[1.6.2]` - no manual edit to a
  live `role_permissions.json` needed on any already-running environment.
- **Admin page** (`public/announcement.html`, linked from the nav as
  "Pengumuman", admin-only): Tajuk / Kandungan / Aktifkan Pengumuman /
  Simpan / Nyahaktifkan, following the same load-then-edit-then-save
  pattern as `event-settings.html`. Shows a loading state and disables both
  buttons while a save is in flight (prevents double-submit), and clears
  any prior success/error message the moment a field is edited again, so a
  stale "berjaya disimpan" can never keep displaying next to unsaved
  changes.
- **School Manager homepage popup** (`public/index.html`): shown only for
  the `school` role, only when `active: true`, and only once per browser
  tab per `updatedAt` value - tracked via `sessionStorage` (not
  `localStorage`, since the requirement is "show again on every fresh
  login", not "mark permanently read"). Logging out
  (`addLogoutLink()` in `public/app.js`) explicitly clears that
  `sessionStorage` key, so switching accounts in the same tab doesn't
  suppress the next account's popup. No click-outside/ESC dismissal - only
  the "Saya Sudah Baca" button closes it. Content is rendered via
  `textContent` (never `innerHTML`) with `white-space: pre-wrap` in CSS, so
  the message can never be interpreted as HTML while still preserving line
  breaks. A failed `/api/announcement` fetch is caught and silently
  skipped - it degrades to "no popup", never breaks the rest of the
  dashboard.
- **Fix**: `public/register.html`'s "Pilih Semua" / "Kosongkan Pilihan"
  buttons (added in `[1.7.1]`) used `class="secondary"`, which
  `public/style.css` never actually defined - functionally harmless (fell
  back to the default solid-navy button look) but not the intended
  lower-emphasis style. Added a real `button.secondary` rule (outlined/
  tinted navy, same pill shape/sizing as every other button) so it's
  available project-wide instead of needing bespoke CSS wherever a
  secondary action shows up next to a primary/danger one.
- Verified: 5 backend/shared JS files + 3 pages' inline scripts + CSS all
  syntax-checked clean. In an isolated copy of production-shaped data (never
  against real Railway/local data): 13 announcement-specific checks (admin/
  school/official/anonymous access, validation of non-boolean `active`,
  empty title/message while activating, length caps, trimming, deactivate-
  preserves-content, `announcement.json` auto-created on first boot, audit
  log coverage) and 11 regression checks across login/session, the
  dashboard summary, the 4-category/3-race-group data from `[1.7]`, and the
  `[1.7.1]` bulk-delete endpoint's RBAC - all 24 passed, 0 failed, no
  regressions found. This project has no automated test suite (`npm test`)
  and no test framework - `package.json` only ever defined `start`; all
  verification here (as with every prior release) was scripted `curl`
  checks against an isolated server instance, not unit tests. The actual
  popup appearance/dismissal/re-trigger behavior in a real browser was
  reasoned through by code review only and still needs a human to click
  through once in a real browser before relying on it.

## [1.7.1] - Bulk Delete Students

Adds a real batch-delete for `Pendaftaran Peserta` (`public/register.html`),
primarily so an Admin can clear out pre-v1.7 "Tahap 1 (Data Lama)" records
without clicking Delete one at a time - but general enough for everyday
roster cleanup too.

- **New API**: `POST /api/students/bulk-delete` (`routes/students.js`).
  Takes either `{ bibs: [...] }` (an explicit list) or
  `{ filters: { schoolCode, categoryCode, legacyOnly } }` (delete everything
  matching). `legacyOnly: true` selects only pre-split category-`C` students
  still on the old bib prefix (`isLegacyTahap1()`, now in `lib/config.js` so
  both the API and the client-side display fix from `[1.7]` share one
  definition) - it can never match a new Tahap 1 Lelaki (`-T1L-`) or
  Perempuan (`-T1P-`) registration. Same permission as the existing
  single-student delete (`student.delete` - admin/school, not expanded to
  official), same lifecycle/race-group-finished protection, same
  students+results+checkins cascade, all inside the same atomic
  `EVENT_SCOPE_LOCK`-guarded transaction. Per-bib/per-student best-effort,
  matching the existing CSV import contract - one un-deletable student
  (result locked because their race group already finished) doesn't block
  the rest of the batch. Returns
  `{ requestedCount, deletedCount, skippedCount, deletedBibs, skipped }`.
  Audit-logged as `student.bulk-delete` with actor, schools, categories, and
  the full bib list.
- **RBAC for the `bibs` path**: a School Manager's request is matched
  against their own already-scoped roster (same pattern as
  `GET /api/students`) - a bib belonging to another school and a bib that
  doesn't exist at all are indistinguishable in the response (both land in
  `skipped` with the same generic reason). This is a deliberate, best-effort
  "delete what's valid, skip the rest" contract - not a whole-batch 403 -
  since a hard reject-everything-on-one-bad-bib response would otherwise let
  a School Manager learn "this bib exists at another school" (403) vs "this
  bib doesn't exist" (200/skipped) by probing one bib at a time. The `filters`
  path is scoped the same way `GET /api/students?school=` already is: a
  foreign `schoolCode` in filters just matches 0 results, not an error.
- **UI** (`public/register.html`): a checkbox per row (hidden entirely for
  Official - no delete permission to begin with), Pilih Semua / Kosongkan
  Pilihan / Padam Dipilih acting on the current selection, Padam Semua
  Mengikut Penapis acting on whatever the school/category filters currently
  show, and an Admin-only Padam Semua Tahap 1 (Data Lama). Every delete path
  shows a confirmation dialog first (count, schools, categories, an explicit
  "cannot be undone" warning) before calling the API.
- Verified in an isolated copy of production-shaped data: admin cross-school
  batch delete, a School Manager deleting only their own students, a mixed
  bib list (own + another school's + a nonexistent bib) correctly deleting
  the valid one and skipping the other two with the same generic reason (no
  403), Official denied, filter-by-school, filter-by-category,
  Padam Semua Tahap 1 (Data Lama) correctly leaving new Tahap 1
  Lelaki/Perempuan untouched, cascade delete of checkins/results, a mixed
  batch correctly skipping a student whose race group had already finished
  while still deleting the rest, First Available Bib gap-filling still
  working post-delete, rejection while the event isn't OPEN, audit log
  coverage, no regression in Dashboard/Rankings/public Leaderboard, and a
  simulated Railway restart (data byte-identical before/after).

## [1.7] - Four-Category Competition Rules (Tahap 1 Lelaki/Perempuan Split)

Rule change requested after re-confirming the official Kertas Kerja:
individual ranking, personal awards, and school scoring now run on 4
categories instead of 3 - Tahap 1 is split into Lelaki/Perempuan, matching
Tahap 2's existing split. Race-day Start/Finish/Timer control is
deliberately **not** split the same way - see below.

- **4 categories, 3 race groups**: `A` Tahap 2 Lelaki, `B` Tahap 2 Perempuan,
  `C` Tahap 1 Lelaki, `D` Tahap 1 Perempuan (`lib/config.js`). Individual
  ranking/bib/personal-awards/school-scoring are keyed by these 4
  `categoryCode`s. Race clocks are a **separate**, new `raceGroupCode`
  concept with only 3 clocks - `T2L`, `T2P`, and `T1` (shared by both Tahap 1
  categories) - so Tahap 1 Lelaki and Perempuan start together, finish
  together, and share one `startTime`, while still ranking, awarding, and
  scoring completely independently. `routes/race.js`, `routes/results.js`,
  and `routes/students.js` (delete-eligibility check) all resolve a
  student's category to its race group before touching the shared clock.
- **Bib ranges**: `T2L` 101-199, `T2P` 201-299, `T1L` 301-399 (category `C`,
  reusing the number range the old combined "Tahap 1" category used), `T1P`
  401-499 (category `D`, new). First Available Bib (gap-scan, no counter
  file) is unchanged and still per-school-per-category.
- **Registration UI simplified**: a teacher now picks Tahap (1/2) + Jantina
  (Lelaki/Perempuan) - never a category code directly
  (`public/register.html`). `POST /api/students` and CSV import
  (`routes/students.js`) both take `tahap`/`gender` and resolve the
  categoryCode via a single shared function (`resolveCategoryCode()` in
  `lib/config.js`), accepting `1`/`2`/`T1`/`T2`/"Tahap 1"/"Tahap 2" and
  `L`/`P`/`Lelaki`/`Perempuan` case-insensitively. CSV columns changed from
  `name, schoolCode, categoryCode` to `name, schoolCode, tahap, gender`.
- **School scoring rewritten** (`routes/rankings.js`): a school's total score
  is now the sum of **every** effective point (rank 1-10, per the points
  table) its students earned across all 4 categories - the previous
  "best 5 finishers only" (`topNPerSchool`) cutoff is no longer applied.
  Still naturally bounded, since only the top 10 per category ever score
  anything. `topNPerSchool` stays in the scoring-config schema/API for
  backward compatibility but has no effect (`routes/scoring.js`,
  `public/scoring.html`).
- **New school tie-break**: schools level on total score are now ranked by
  gold (rank 1) count, then silver (rank 2), then bronze (rank 3) count -
  "more finishers" is no longer a tie-break. Schools still tied after all
  four comparisons share the same displayed rank (standard competition
  ranking, e.g. `1, 1, 3, 4`) instead of an arbitrary order.
- **12 individual awards**: Johan/Naib Johan/Ketiga × 4 categories, via the
  existing `categoryRankings`-driven award/export code (no change needed
  there - it was already category-count-agnostic).
- **Old Tahap 1 data is untouched by design** - no automatic migration, no
  gender guessing, no historical-compatibility category was built (all
  explicitly ruled out for this single-event 2026 system). A student
  registered before this release under the old combined "Tahap 1" category
  still has `categoryCode: 'C'` and is left exactly as-is; cleaning them up
  (delete + ask the school to re-register under the new Tahap 1
  Lelaki/Perempuan split) is a manual, out-of-band admin action, not
  something this code does automatically.
- **Hotfix within this same release**: a student still on the pre-split bib
  prefix (`-T1-...`, not the new `-T1L-...`) is never labeled "Tahap 1
  Lelaki" or given a fabricated gender in the UI or in any CSV export -
  shown as "Tahap 1 (Data Lama)" with a blank gender instead
  (`public/register.html`, `public/rankings.html`). Detected via bib prefix,
  the only signal telling an old vs a new category-`C` registration apart
  (both share the same categoryCode). Registration-roster CSV export
  columns re-confirmed/reordered: Nama, Kod Sekolah, Nama Sekolah, Tahap,
  Jantina, No. Peserta (Bib), Kod Kategori, Kategori - Bib was never
  actually dropped, just re-verified present.
- Verified in an isolated copy of production-shaped data (never against
  real Railway/local data): registration across all 4 categories, Tahap 1
  Lelaki+Perempuan sharing one Start/startTime/race-state and finishing
  together, independent per-category rankings and top-3 awards, school
  score = sum of all valid points (hand-verified arithmetic against the
  API's own output), tie-break gold->silver->bronze->tied (isolated
  synthetic test: two schools identical on score+medals correctly share
  rank 1, a third ranks 3rd, not 2nd), Bib gap-filling, CSV import (mixed-
  case tahap/gender, bad rows correctly rejected without blocking good
  ones), check-in/finish/delete/reset all correctly resolving the shared
  race group for both Tahap 1 categories, public leaderboard access,
  RBAC + School Isolation, audit log coverage, full Close -> Archive ->
  Create New lifecycle (archived `rankings-snapshot.json` correctly
  reflects 4 categories), and a simulated Railway restart (data
  byte-identical before/after). The legacy-label fix was additionally
  unit-verified against representative old/new bib strings and re-checked
  end-to-end against a seeded legacy record.

## v1.6.2 Production Release

Feature Freeze milestone - bundles the most recent 1.6.x work into one
production-ready release. See `docs/RELEASE_NOTES_v1.6.2.md` for the full
release notes (new features, bug fixes, known limitations, deployment and
rollback instructions) and `docs/PROJECT_STATUS.md` for current project
status/what's in scope during the freeze.

Includes:
- **Bib Allocation V3** (First Available Bib) - bib numbers are assigned by
  scanning for the first available gap per school+category instead of a
  separate `counters.json` sequence (see `[1.6.0]` below).
- **School Manager auto-creation** - School Manager accounts are created
  automatically as part of the school onboarding flow (see `[1.5.1]`).
- **Dashboard Summary API** (`GET /api/students/summary`) - aggregate-only
  (no participant names) totals endpoint, never scoped by school, so the
  "Ringkasan Acara" dashboard shows true event-wide numbers to every role.
- **Dashboard RBAC fix** - the dashboard previously computed its totals from
  the school-scoped `/api/students`, so a School Manager only ever saw their
  own school's numbers; now sourced from the Summary API above (see
  `[1.6.1]`).
- **Permission Auto Merge** - server startup now merges any permission key
  present in code but missing from an already-existing `role_permissions.json`
  (e.g. on Railway's persistent Volume), without ever touching a key that's
  already there - so a new permission never again requires a manual edit to
  a live environment's data file (see `[1.6.2]`).
- **Dashboard Loading resilience** - `public/index.html` uses
  `Promise.allSettled` instead of `Promise.all`; one failing request now
  degrades only its own section (with a visible, diagnosable error) instead
  of leaving the entire dashboard stuck on "Loading..." (see `[1.6.2]`).
- **Railway Production Ready** - deployment compatibility (`DATA_DIR`/
  `BACKUP_DIR` env overrides for ephemeral containers + mounted Volumes),
  graceful `SIGTERM` shutdown, and this release's permission auto-merge all
  verified against an isolated copy of production-shaped data before
  shipping.

## [1.6.2] - Permission Auto Merge & Dashboard Loading Resilience

Hotfix for a production incident: `dashboard.view` (added in 1.6.1) 403'd on
any environment whose `role_permissions.json` already existed before that
release (Railway's persistent Volume in particular), because the seed
function only writes that file when it's completely absent. That collapsed
the entire dashboard to a stuck "Loading..." for every role, since the one
failing request was inside an un-caught `Promise.all()`.

- **Permission Auto Merge** (`lib/init-data.js`, `server.js`): on every
  startup, after the existing first-run seed step, a new
  `mergeRolePermissions()` diffs the on-disk `role_permissions.json` against
  the code's default permission map and adds only the keys that are
  completely missing, via the same atomic `store.update()` queue every other
  write in the app uses. Existing keys - including any hand-customized role
  list - are never touched, and nothing is written at all if there's nothing
  missing. `server.js`'s startup sequence now awaits this before
  `server.listen()`, so no request can land before the merge write lands.
  Logs exactly which key(s) were added, e.g. `auto-added missing permission
  key(s): dashboard.view`.
- **Dashboard Loading resilience** (`public/index.html`): `load()` switched
  from `Promise.all()` to `Promise.allSettled()`. A failing request now only
  blanks its own section - shown as an explicit on-page error plus a
  `console.error()` with the real error message - while every other section
  that did load renders normally. Success-path UI is unchanged.
- Verified in an isolated copy of production-shaped data: missing-key
  auto-add (with a hand-customized permission left untouched), no-op on
  repeat startup (byte-identical file, no log spam), admin/school/official
  all get `200` from `/api/students/summary`, anonymous gets `401`, and a
  regression pass across schools/results/rankings/race-status/checkins
  showed no behavior change.

## [1.6.1] - Dashboard RBAC Improvements

Fixes two related School Manager-role bugs on the dashboard/registration
pages, both traced to the same root cause.

- **Bug**: `GET /api/students` deliberately scopes to the caller's own
  school when the caller is a School Manager (protects other schools'
  participant names/bibs - see 1.1-D). `public/index.html` (the post-login
  home page - "Ringkasan Acara" / "Sekolah Yang Menyertai" / "Kategori")
  was computing its event-wide counts from that same scoped response, so a
  School Manager only ever saw their own school's numbers instead of the
  true totals across all participating schools.
- **Fix**: added `GET /api/students/summary` (`routes/students.js`) - an
  aggregate-only endpoint (total participants, per-school counts,
  per-category counts, no names) that is **never** scoped by school, since
  counts alone aren't the private data the scoping exists to protect. Wired
  up via a new `dashboard.view` permission (`admin`, `school`, `official`)
  in the permission matrix (`lib/config.js` seed + live
  `data/role_permissions.json`). `public/index.html` now reads its summary
  numbers from this endpoint instead of the scoped `/api/students`.
- **UX fix**: `public/register.html`'s "Senarai Peserta Berdaftar" school
  filter dropdown listed every school for a School Manager too, even though
  their result set is already locked to their own school server-side -
  picking any other school just silently produced an empty table. The
  dropdown is now hidden entirely for the `school` role (unchanged for
  `admin` / `official`), matching the pattern already used for the
  registration form's own school picker.
- Verified with an isolated test server (scratch `DATA_DIR`/`BACKUP_DIR`,
  synthetic multi-school student data, temporary test accounts for all
  three roles): School Manager sees correct event-wide totals via
  `/api/students/summary` while `/api/students` stays correctly scoped to
  their own school; Admin/Official behavior unchanged; anonymous requests
  to the new endpoint are rejected with 401.
- Bumped `SYSTEM_VERSION` (`lib/config.js`) from the long-stale `1.4` to
  `1.6.1` to match this tag.

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
