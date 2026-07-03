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
