# Project Status

**Current status: Production Ready — Feature Freeze**

**Current release:** `v1.6.2-production` (see `docs/RELEASE_NOTES_v1.6.2.md`
for what's in it, and `CHANGELOG.md` for the full version history).

This project has moved from active feature development into Feature Freeze.
The system is considered production-ready for the KEJOHANAN MERENTAS DESA
SEMPENA HARI KEBANGSAAN 2026 event. Work from here should be limited to
keeping it running correctly, not extending it.

---

## Allowed during Feature Freeze

- ✔ **Critical Bug** — anything that breaks a core race-day flow
  (registration, check-in, race control, finish recording, leaderboard,
  scoring, login/RBAC).
- ✔ **Security Bug** — authentication, authorization, session handling, XSS/
  injection, or anything that could expose or corrupt another school's data.
- ✔ **Data Loss** — anything that could destroy, corrupt, or silently drop
  student/result/school/user data, or break the backup/archive/lifecycle
  safety mechanisms that protect against it.

## Paused during Feature Freeze

- ✘ **New features** — no new modules, pages, or API endpoints beyond what's
  needed to fix an item in the "Allowed" list above.
- ✘ **Large UI changes** — no redesigns, layout overhauls, or new page
  structures. Small, necessary fixes (e.g. a corrected error message) are
  fine; anything that changes how a page looks or is organized is not.
- ✘ **Architecture changes** — no refactors of the module structure, data
  storage approach, permission model shape, or deployment model, unless one
  is the *only* way to fix a Critical Bug / Security Bug / Data Loss issue
  above — and even then, treat it as an exception requiring explicit
  sign-off, not a default path.

## Why this exists

The event this system supports is real and imminent (see PRD.md / RULES.md).
Feature Freeze exists to keep the system stable and predictable for race day
rather than accumulating last-minute risk. Anything not covered by the
"Allowed" list should be logged for the next planning phase (see below)
instead of implemented now.

## Next Recommended Phase

Once the event has run (or the freeze is otherwise lifted), the next
planning phase should revisit:

- The CHANGELOG documentation gap between `1.2-RC` and `1.3`–`1.6.0` (several
  real releases happened in that range without a corresponding CHANGELOG
  entry - worth backfilling for anyone auditing history later).
- Known limitations listed in `docs/RELEASE_NOTES_v1.6.2.md` (Excel/PDF
  export, RFID/chip timing, single-finish-result correction flow, audit log
  coverage gaps).
- Whether `role_permissions.json` (and other `data/`-scoped runtime config)
  needs a more permanent per-environment migration story beyond the
  auto-merge added in v1.6.2, if more permission keys are expected to be
  added over time.
