# Release Notes - v1.6.2 Production Release

**Tag:** `v1.6.2-production`
**Status:** Production Ready / Feature Freeze
**Date:** 2026-07-16

This release bundles the most recent 1.6.x work (Bib Allocation V3, School
Manager auto-creation, Dashboard RBAC + its follow-up hotfix) into one
production milestone. It marks the start of a Feature Freeze - see
`docs/PROJECT_STATUS.md` for what's in and out of scope going forward.

---

## New Features

- **Bib Allocation V3 - First Available Bib** (`[1.6.0]`): bib numbers are
  assigned by scanning existing students for the first available gap within
  a school+category's numeric range, instead of a separate incrementing
  `counters.json` sequence. `counters.json` is no longer used for bib
  numbering. Numbering ranges are unchanged (T2L 101-199, T2P 201-299, T1
  301-399, per school).
- **School Manager auto-creation** (`[1.5.1]`): School Manager accounts are
  created as part of the school onboarding flow, instead of requiring a
  separate manual account-creation step.
- **Dashboard Summary API** (`[1.6.1]`): `GET /api/students/summary` returns
  event-wide totals only (total participants, per-school counts, per-category
  counts - no participant names), gated by a new `dashboard.view` permission
  (admin, school, official).

## Bug Fixes

- **Dashboard RBAC fix** (`[1.6.1]`): the "Ringkasan Acara" / "Sekolah Yang
  Menyertai" / "Kategori" dashboard used to compute its numbers from
  `GET /api/students`, which is deliberately scoped to a School Manager's own
  school (to protect other schools' participant names). That made a School
  Manager's dashboard show only their own school's numbers instead of the
  true event-wide totals. Fixed by sourcing the dashboard from the new
  aggregate-only Summary API above, which is never school-scoped.
- **Register page school filter** (`[1.6.1]`): the "Senarai Peserta
  Berdaftar" school filter dropdown listed every school for a School Manager
  too, even though their result set was already locked server-side to their
  own school - picking any other school just silently returned an empty
  table. The dropdown is now hidden entirely for the `school` role (`admin` /
  `official` unaffected).
- **Permission Auto Merge** (`[1.6.2]`, production hotfix): the
  `dashboard.view` permission above 403'd on any environment whose
  `role_permissions.json` already existed before v1.6.1 shipped (this hit
  Railway's persistent Volume in production), because the file is only
  seeded on first run and never re-seeded afterward. Server startup now
  merges any permission key that's in code but missing on disk, without ever
  touching a key that's already there, and logs exactly what it added.
- **Dashboard Loading resilience** (`[1.6.2]`, production hotfix): a single
  failing request inside the dashboard's `Promise.all()` used to abort the
  entire page load, leaving every section stuck on "Loading..." with only an
  unhandled promise rejection in the console to explain why. Switched to
  `Promise.allSettled()` - one failure now degrades only its own section,
  with a visible on-page error and a logged diagnostic, while everything else
  still renders.

## Known Limitations

- No RFID/chip-timing integration (manual "Finish" button per participant).
- CSV only for import/export - no Excel (.xlsx), no PDF.
- A participant can only have one finish result; correcting a mistake
  requires deleting the result first, then finishing again.
- `role_permissions.json`, `users.json`, and all other files under `data/`
  are runtime state, not version-controlled (`.gitignore`'d by design) - a
  fresh environment only gets the code's default permissions/accounts; any
  environment-specific customization (e.g. a narrowed permission, an added
  School Manager account) has to be redone per environment, or restored from
  a backup.
- No automated test suite (zero npm dependencies is a deliberate project
  constraint) - verification for this release was done by hand and by
  scripted `curl`/isolated-server checks against copies of production-shaped
  data, documented in the corresponding CHANGELOG entries.
- The audit log (`data/event_log.json`) does not yet cover every mutation
  type (see the 1.2-RC-era "Known gaps" note earlier in CHANGELOG.md, which
  still applies).

## Deployment Instructions

1. Merge/push to the branch Railway is configured to watch (`main`).
   Railway builds and deploys automatically - see
   `docs/Railway Deployment Guide.md` for first-time setup.
2. No new environment variables or Volume changes are required for this
   release - `DATA_DIR` / `BACKUP_DIR` behavior is unchanged from prior
   releases.
3. On the first startup after this deploy, check the deployment logs for:
   ```
   auto-added missing permission key(s): dashboard.view
   ```
   This confirms the permission auto-merge ran and patched the live
   `role_permissions.json`. If `dashboard.view` was already present (e.g.
   added manually as an interim fix before this release), this line will
   correctly **not** appear - that's expected, not an error.
4. Verify post-deploy: log in as each of admin / school / official and
   confirm the dashboard ("Ringkasan Acara") shows real numbers instead of
   "Loading...", and that `GET /api/students/summary` returns `200` for all
   three roles and `401` when logged out.
5. Confirm existing registration data (student count, results) is unchanged
   from before the deploy - this release does not modify `students.json`,
   `results.json`, `users.json`, `schools.json`, `checkins.json`, or any
   other file under `data/` besides `role_permissions.json` (and only ever
   adds missing keys to that one).

## Rollback Instructions

If this release needs to be rolled back:

1. **Code**: redeploy the previous tag/commit (`v1.5.2`/pre-`v1.6.0`, or
   whichever previously-known-good commit predates this release) via
   Railway's deployment history ("Redeploy" on an earlier build), or
   `git revert`/re-push an older commit to `main` if Railway watches `main`
   directly.
2. **Data**: no rollback action is required for `data/`. The permission
   auto-merge only ever *adds* keys, never removes or renames one - reverting
   the code does not need the added `dashboard.view` key to be manually
   removed from `role_permissions.json` (an unused permission key is
   harmless; it just won't be checked by any older route).
3. If a rollback is done specifically because of a Bib Allocation V3 (1.6.0)
   regression, note that `counters.json` is no longer written to by that
   code path - rolling back to a pre-1.6.0 build resumes reading whatever
   counter values were last written, which may be stale relative to bibs
   issued under V3's gap-scanning logic. Re-verify bib numbering manually
   after such a rollback before resuming live registration.
