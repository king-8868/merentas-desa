# Changelog

All notable changes to the Kejohanan Merentas Desa 2026 system are documented
in this file.

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
