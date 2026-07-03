# Admin Guide

For the **Administrator** account (default username `admin`). Admin has full access to every page and every action in the system — this guide covers what only Admin can do.

Read `User Guide.md` first for login basics.

## What only Admin can do

| Action | Where |
|---|---|
| Manage schools (add, rename) | **Pengurusan Sekolah** page |
| Configure scoring rules (points table, top-N per school) | **Konfigurasi Markah** page |
| Create additional accounts (e.g. a second Race Official, or fix a School Manager account) | via API (`POST /api/auth/users`) — no dedicated page yet in 1.2; ask your developer if you need this done, or use a REST client |
| Manually override a result (timer malfunction, backup stopwatch) | `POST /api/results` — not exposed in the UI by design, since teachers should never manually calculate/enter times (see `RULES.md`) |
| Delete a student, check-in, or result | Available on the relevant pages |
| View the Audit Log | via API (`GET /api/audit-log`) — see below |
| Control the Event Lifecycle (Open/Close/Archive/Create New) | via API (`/api/lifecycle/*`) — see the full walkthrough in the README's "Full Race Flow" section |

## Race day operational checklist

1. **Before the race**: confirm the event lifecycle is `OPEN` (`GET /api/lifecycle`). Register schools if any are missing (they're pre-seeded, so this is rarely needed). Configure scoring if the default 10/9/8/... points table isn't what this event uses.
2. **During the race**: monitor the Live Leaderboard. If a Race Official reports an issue with a specific result, you can delete it and have them re-record, or manually override it via the API.
3. **After the race**: once all results for the day are final, you can move the event through its lifecycle — see below.

## Event Lifecycle: Open → Close → Archive → Create New

This is the one workflow only Admin can perform, and it's the most consequential — read this carefully before running it on real race data.

- **OPEN** — normal state. All registration/check-in/race-control/result actions work.
- **Close** — stops all further registration/check-in/race-control/result mutations (a hard stop for "we're done for today, no more changes"). Reversible: **Open** from `CLOSED` re-opens the same event (a correction path if you closed by mistake).
- **Archive** — only valid from `CLOSED`. Snapshots all of today's data (students, results, check-ins, race status, bib counters) into `data/archive/<timestamp>/` **before** anything is touched. This is your safety net — nothing is ever cleared without being archived first.
- **Create New** — only valid from `ARCHIVED`. Clears the 5 event-scoped files back to empty and returns the event to `OPEN`, ready for a brand new event. Schools, user accounts, and the permission matrix are **never** touched by this — only participant/result/race data.

**This sequence cannot be skipped or reordered** — the system rejects any out-of-order attempt (e.g. Archive before Close) with a clear error.

Full step-by-step commands are in the README's "完整比赛流程" section.

## Audit Log

Every login, logout, registration, check-in, race start/finish/reset, result change, and permission-denied attempt is recorded in `data/event_log.json`, viewable via `GET /api/audit-log` (optionally filtered by `?actor=` or `?action=`). Use this to answer "who did what, and when" or "why was this action rejected."

**Known gap** (see the RC Report's Security Check for detail): school create/rename, scoring config changes, new-user creation, and password changes are **not yet** logged. Keep this in mind if you need a complete history of those specific actions — for now, cross-reference with whoever you know performed the action.

## Permission Matrix

`data/role_permissions.json` defines which roles can do what. It's a plain JSON file — editing it takes effect immediately, no restart needed. Only touch this if you understand the implications: an unknown or mistyped permission key locks **everyone** out of that action (fails closed, by design, for safety) rather than granting broad access.
