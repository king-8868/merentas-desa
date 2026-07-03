# Architecture

System architecture for the Merentas Desa 2026 race management system, as of **1.2-RC**.

## Design goals

- **Zero npm dependencies.** Plain Node.js (`http`, `fs`, `crypto`, `os`) only — no Express, no database, no bcrypt. Everything the server needs ships with Node itself.
- **Race-day reliability first.** Every write is durable to disk immediately (no in-memory-only state), the server never crashes on a bad request (global error handlers), and every mutation is auditable.
- **Small enough to read in one sitting.** ~2,000 lines total across `lib/` + `routes/` + `server.js`. No framework magic — every request's path through the code is traceable by reading top to bottom.

## Layers

```
public/*.html + app.js   →  browser UI (fetch() calls to /api/*)
        │
server.js                →  HTTP entry point: routing + global error safety net
        │
routes/*.js               →  one file per resource; each handler does:
        │                     auth → lifecycle gate → validate → mutate → audit → respond
lib/*.js                  →  shared infrastructure (see below)
        │
data/*.json                →  the actual persisted state
```

### `lib/` — infrastructure, not business logic

| Module | Responsibility |
|---|---|
| `config.js` | Single source of truth for every data file path, seed data, and the category/school/permission tables. Nothing else defines a file path. |
| `store.js` | `readJSON`/`writeJSON` plus the concurrency primitive: `update(file, fallback, mutator)` serializes read-modify-write cycles **per file** so concurrent race-day requests can never interleave and clobber each other. `withLock(key, fn)` generalizes this to an arbitrary key, not just a file — used to let several files share one mutex (see Lifecycle below). |
| `auth.js` | Password hashing (`scrypt`), session tokens, cookie parsing, and `requireAuth()` — the single function every protected route calls. Resolves permission keys (e.g. `'student.create'`) against `data/role_permissions.json`, never a hardcoded role list. |
| `audit.js` | `logAudit()` — fire-and-forget append to `data/event_log.json`. Never blocks or fails the operation it's describing. |
| `lifecycle.js` | The event state machine (`OPEN → CLOSED → ARCHIVED → (create new) → OPEN`) and the race-condition-safe gate every event-scoped mutation must pass through (`requireOpenEvent` + `runIfEventStillOpen`). See **Lifecycle** below — this is the most subtle module in the codebase.
| `bib.js` | Bib number generation, per school+category, via `store.update` on `counters.json`. |
| `csv.js` | Hand-rolled CSV parser for batch registration import. |
| `router.js` | ~30-line method+path matcher with `:param` support. No middleware chain — auth/lifecycle checks are plain function calls at the top of each handler. |
| `http-helpers.js` | `sendJSON`, `parseBody`, `parseRawBody`, `serveStatic` (with path-traversal protection). |
| `init-data.js` | Seeds every `data/*.json` file on first run only (`ensureFile` is a no-op if the file already exists). |

### `routes/` — one file per resource

Each file registers its endpoints and, at the top of every handler that needs it, calls (in this order):
1. `requireAuth(req, res, sendJSON, permissionKey)` — authentication + authorization.
2. `requireOpenEvent(res, sendJSON)` — lifecycle gate (only for handlers that mutate event-scoped data).
3. Business validation.
4. The actual `store.update()` write, wrapped in `runIfEventStillOpen()` if event-scoped.
5. `logAudit()`.
6. `sendJSON()` response.

`routes/results.js` and `routes/students.js` import `deriveState` from `routes/race.js` (the only cross-route coupling in the codebase) since result mutations depend on race state.

## Auth / Authz / Audit / Lifecycle — kept as four separate concerns

This separation was a deliberate 1.1-E requirement and is enforced by the module boundaries above:

- **Auth** (identity: who are you) — `lib/auth.js`'s session/password functions.
- **Authz** (permission: are you allowed) — `resolvePermission()` inside `lib/auth.js`, reading `data/role_permissions.json`. Route files never hardcode a role list; they pass a permission key string.
- **Audit** (record: what happened) — `lib/audit.js`, called from routes after a mutation succeeds (or from `requireAuth`/`requireOpenEvent` when something is denied).
- **Lifecycle** (state: is the event open) — `lib/lifecycle.js`, independent of the above three.

## Lifecycle: the epoch + shared-lock design

The event lifecycle (`OPEN/CLOSED/ARCHIVED`) gates every write to the 5 **event-scoped files** (`students.json`, `results.json`, `checkins.json`, `race-status.json`, `counters.json` — defined once in `config.js`'s `EVENT_SCOPED_FILES`).

A naive "check state, then write" has a race: a slow request can pass the check while the event is OPEN, then land its write *after* an admin has done a full Close → Archive → Create New cycle — silently leaking old-event data into the new event. This was found and fixed as a Blocker during 1.1-E's architecture review. The fix:

- Every lifecycle transition carries an **`epoch`** (generation counter), bumped on every transition.
- `requireOpenEvent()` (called early, before any `await`) captures the current epoch.
- `runIfEventStillOpen(capturedEpoch, fn)` is the real enforcement point: it acquires a shared lock (`EVENT_SCOPE_LOCK`) and re-checks **both** state and epoch immediately before `fn()` (the actual write) runs. If the epoch moved on — even if state cycled back to OPEN for a brand-new event — the write is rejected.
- Archive/Create New acquire the **same** lock before touching any event-scoped file, so a mutation and a lifecycle transition can never interleave.

This was verified under real concurrent load (30+ simultaneous requests racing a full lifecycle cycle) during Beta Validation — see `CHANGELOG.md` for details.

## Data model

All state lives in flat JSON files under `data/` (gitignored — regenerated on first run by `init-data.js`). There is no database. `store.js`'s per-file write queue is the only concurrency guarantee; it is sufficient at this system's scale (a single race day, a handful of concurrent devices on one LAN).

See the structure tree and file-by-file description in the RC Report for the current `data/` layout.

## Frontend

Plain HTML + vanilla JS (`public/app.js`), no build step, no framework. Every page except `leaderboard.html` requires a login; `public/app.js`'s `requireLogin()`/`applyNavVisibility()` enforce this and hide nav links the current role can't use — but this is a UX convenience only. **Every real authorization decision is enforced server-side**, independently of what the frontend shows or hides.
