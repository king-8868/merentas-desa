# Backup & Recovery

How data persistence, server restarts, and event archiving work — and what to do if something goes wrong on race day.

## Everything is saved to disk immediately

There is no "save button" and no risk of losing work by closing a browser tab. Every action (registration, check-in, race start/finish, result recording, login) is written to a JSON file under `data/` **the instant it happens** — nothing is held only in browser memory or only in server RAM. This is true by construction (`lib/store.js`'s `update()` writes to disk before the API call even returns a response to the browser).

## If the server crashes or the computer restarts mid-race

**This is a fully supported, tested scenario — no manual recovery steps are required.**

1. Restart the server: `node server.js` (or however it was originally started) from the project folder.
2. Open the browser again and go to the same address as before.
3. Everything is exactly as it was: registered participants, check-ins, race timers (including which categories were already started/finished), recorded results, rankings, and even your **login session** (you do not need to log in again — sessions also persist to disk, for up to 12 hours since you last logged in).

This has been verified directly: kill the server process mid-event, restart it, and confirm the participant count, lifecycle state, and an existing login session are all unchanged.

## If an unexpected error happens during a request

The server is built to never go down from a single bad request — a per-request error returns a clean error message to that one browser tab; every other user and every other in-progress request is unaffected. If you ever see the whole system become unreachable (not just one page erroring), that means the server process itself has stopped — see the restart steps above.

## Event Archive: your safety net for a full race day

The Administrator can move the event through **Close → Archive → Create New** (see `Admin Guide.md`) at the end of a race day, in preparation for a future event. **Archive is the actual backup step**:

- Archiving takes a complete snapshot of that day's participants, results, check-ins, race status, and bib counters into a timestamped folder: `data/archive/<timestamp>/`.
- **Nothing is ever cleared until it has been archived first** — this order is enforced by the system itself (Create New is only possible from the `ARCHIVED` state, which only exists after a successful Archive).
- Schools, user accounts, and the permission matrix are never touched by Archive/Create New — only the 5 files that hold that day's race data.

To manually back up an archived event (e.g. copy it off the server for long-term storage), simply copy the relevant `data/archive/<timestamp>/` folder — it's plain JSON, readable with any text editor.

## Manual full backup (recommended before any race day)

Since all state lives in `data/*.json`, a full backup is just copying that folder:

```
cp -r data/ data-backup-$(date +%Y%m%d)/
```

(macOS/Linux syntax. On Windows, see `docs/Windows Deployment Guide.md` section 4 for the `xcopy`/`Copy-Item` equivalents — this command as written won't run in Command Prompt or PowerShell.)

Do this **before** race day starts, and again after Archive at the end of the day. `data/` is intentionally excluded from git (it's real people's data, not code — see `.gitignore`), so git history is not a backup of this data; only a manual copy or the Archive mechanism above is.

## What is NOT automatically backed up

- If you delete a participant, check-in, or result by mistake **before** an Archive happens, that specific action is not automatically reversible — there is no "undo." The Audit Log (`GET /api/audit-log`, Admin only) tells you exactly what was deleted and by whom, but does not restore it. Re-register/re-record as needed.
- The 4 sensitive-but-not-yet-audited actions (see the RC Report's Security Check: school create/rename, scoring config changes, new-user creation, password changes) are not currently logged in the audit trail — keep this in mind if you need a complete record of exactly when one of those specific things happened.
