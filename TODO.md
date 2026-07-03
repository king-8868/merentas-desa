Kejohanan Merentas Desa 2026 - Development Progress

Phase 0 - Project Refactoring
[x] Split server.js into modular lib/ + routes/ structure
[x] Add atomic per-file write queue (lib/store.js) for race-day concurrency safety
[x] Persist race-status.json scaffold on disk (for Phase 3 recovery)
[x] Convert PRD.md.rtf / CLAUDE.md.rtf to plain .md
[x] Update Bib Number ranges to per-school sequences (T2L 101-199, T2P 201-299, T1 301-399)

Phase 1 - Registration System
[x] Student registration (name, school, category)
[x] Automatic Bib Number generation
[x] School management (add/edit schools at runtime, data/schools.json)

Phase 2 - Check-in System
[x] Search by Bib Number or Student Name (checkin.html)
[x] One-click check-in (exact bib scan + Enter = 0-click auto check-in; name search = 1-click)
[x] Attendance statistics (checked-in vs not-yet, shown on checkin.html and index.html)
[x] Only checked-in participants allowed in Finish Recording - implemented in Phase 4

Phase 3 - Race Control
[x] Manual start per category (T2 Lelaki / T2 Perempuan / Tahap 1) - race-control.html
[x] Independent timers per category, persisted to disk (data/race-status.json)
[x] Idempotent start (double-click never resets an already-running clock)
[x] Reset action for admin correction (confirm-gated, since destructive)
[x] Verified: timer survives simulated server crash/restart (Recovery Mode)

Phase 4 - Finish Recording (Highest Priority)
[x] Search + Finish button, no manual time entry in the main UI (record.html rebuilt)
[x] Automatic finish time calculation from category timer (POST /api/results/finish)
[x] Gated on check-in and race-started (RULES.md compliance)
[x] Idempotent finish (double-press never overwrites a real finish time)
[x] Automatic ranking / school points / statistics / leaderboard update - already
    true structurally since rankings recompute fresh on every /api/rankings call;
    record.html also shows the finisher's live rank immediately after Finish
[x] Manual time entry (POST /api/results) kept as an admin/backup override only,
    not exposed in the main Finish Recording UI

Phase 5 - Live Leaderboard
[x] Latest Finishers feed (leaderboard.html - sorted by recordedAt, projector-friendly)
[x] Top 3 per category (podium-style cards with medals)
[x] School ranking (full standings table, large-font display)
[x] Auto refresh every 3s, no manual refresh, no interactive controls on this page
[x] Bug fix: results.json now stores recordedAt (wall-clock timestamp) separately
    from time (elapsed race seconds) - record.html's "Baru Tamat" feed was
    incorrectly sorting by time (elapsed seconds) instead of recency; fixed
    to sort by recordedAt, verified with a fast-time-but-late-recorded case

Phase 6 - School Points
[x] Best 5 finishers per school (implemented, verified correct)
[x] Make point rules configurable at runtime - scoring.html + data/scoring-config.json
    (points table per rank, top-N-per-school), no restart needed, changes take
    effect on the very next /api/rankings call. Verified with a live before/after
    test (custom points [100,50,25] + topN=1 correctly changed both category
    points and school totals immediately) plus input validation tests.

Phase 7 - Import / Export
[x] Import CSV batch registration (POST /api/students/import, register.html) -
    best-effort per-row processing, reports which rows succeeded (with bib)
    and which failed (with row number + reason); downloadable CSV template
[x] Export CSV: Senarai Peserta (register.html), Keputusan Individu, Kedudukan
    Sekolah, Pemenang Hadiah (rankings.html) - generated client-side from data
    already fetched via existing APIs, downloaded via Blob, no new dependency
[-] Excel (.xlsx) import/export - explicitly descoped per user decision
    (2026-07-03): CSV only, no extra library. Real .xlsx would require adding
    a dependency, breaking the zero-dependency constraint.
[-] PDF export / Certificate List - not requested; skipped to keep scope to
    what was explicitly asked (CSV only)

Phase 8 - UI Polish
[x] Modern Apple-inspired glass-effect interface - translucent cards with
    backdrop-filter blur, pill-shaped nav/buttons/badges, system font stack,
    soft gradient background, refined shadows/rounded corners across all
    9 pages (shared style.css + the 3 pages' inline <style> blocks)
[x] Verify responsive on desktop / tablet / projector - visually verified via
    headless Chrome screenshots (CDP-driven, accurate device emulation) at
    375px/768px/1400px; confirmed zero horizontal overflow on all 9 pages at
    768px (tablet) via automated scrollWidth check; leaderboard.html widened
    to 1400px max-width for projector/big-screen use
[x] Bug fix: removed forced `table { min-width: 520px }` below 640px viewports
    (was an unnecessary constraint risking overflow on very narrow screens,
    even though PRD only requires desktop/tablet/projector support)
[x] Added disabled-button styling (checkin.html/record.html show disabled
    buttons with an ineligibility reason - these had no visual treatment before)
[x] Added favicon.svg (was a harmless but noisy 404 in the browser console)
[x] Full functional regression re-run after all visual changes: register,
    check-in, race start, finish recording, rankings all still work correctly
[x] Verified zero console errors / zero failed network requests across all
    9 pages via Chrome DevTools Protocol

=== Version 1.0 Stable (tag: v1.0.0-stable) ===

Version 1.1 - Production Ready

Phase 1.1-A - XSS Security Fix
[x] escapeHTML() added to app.js, applied to every innerHTML interpolation of
    user-supplied text (names, CSV import error echoes) across 8 pages.
    Verified live with a real <img onerror=...> payload - renders as literal
    text, no script execution, no alert() dialog.

Phase 1.1-B - LAN Multi-device Access
[x] Verified server already binds to all interfaces by default (no code
    change needed) - added LAN IP auto-detection (os.networkInterfaces()) and
    startup console output showing both Local and Network URLs, plus README
    docs on connecting from other devices on the same WiFi.

Phase 1.1-C - Race Safety & Integrity Layer
[x] Added the missing FINISHED race state (previously only NOT_STARTED/
    RUNNING existed) - NOT_STARTED -> RUNNING -> FINISHED, with FINISHED
    locking all result mutation (finish, manual override, delete) for that
    category, and blocking Reset once results exist (prevents orphaning them
    against a deleted clock reference).
[x] Fixed a real gap: checkin.html's undo check-in had no confirmation dialog.
[x] Verified idempotency of check-in/finish (already existed from Phase 2/4).

Phase 1.1-D - Login + Role-Based Access Control
[x] Session-based auth (crypto.scrypt password hashing, HttpOnly cookie
    sessions persisted to data/sessions.json, no OAuth/cloud dependency).
[x] Four roles: admin (full access), school (own-school-only student
    management, enforced server-side not just hidden in the UI), official
    (check-in/race-control/finish, view-only participant list), public
    (leaderboard.html, unauthenticated, unchanged).
[x] Every default account forced to change password on first login.
[x] User data model (data/users.json) supports multiple accounts per role
    from day one (plain array + role field) - POST /api/auth/users lets an
    admin add more without any redesign (Version 1.1 ships with one official
    account, per the approved plan).
[x] Verified: login for all 4 roles, school data isolation (a School Manager
    only ever sees/touches their own school, confirmed via a live cross-school
    write attempt that got silently corrected server-side), Race Official
    blocked from registration/deletion, public leaderboard fully functional
    with zero cookies/session.
