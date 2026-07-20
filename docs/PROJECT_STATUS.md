# Project Status

**Current status: Production Ready — Feature Freeze**

**Current release:** `v1.9.1` (see `CHANGELOG.md` for the full version
history; `docs/RELEASE_NOTES_v1.6.2.md` covers the earlier v1.6.2 milestone
specifically).

This project has moved from active feature development into Feature Freeze.
The system is considered production-ready for the KEJOHANAN MERENTAS DESA
SEMPENA HARI KEBANGSAAN 2026 event. Work from here should be limited to
keeping it running correctly, not extending it.

---

## Feature development since v1.6.2

Feature Freeze was first declared at `v1.6.2-production`. Development
continued past that point to deliver a set of already-planned, real
features before locking the system down again. Those releases are:

- **v1.7** — Four-Category Competition Rules (Tahap 1 Lelaki/Perempuan
  Split)
- **v1.7.1** — Bulk Delete Students
- **v1.8.0** — Pengumuman (Announcement Popup)
- **v1.9.0** — Document Generator (Penjana Dokumen) — auto-generated
  Borang Kebenaran (parent consent form) PDF
- **v1.9.1** — Pengurus Sekolah Manual — trilingual (Bahasa Malaysia /
  English / 中文) user guide

**Feature Freeze is now back in effect as of `v1.9.1`.** The rules below
apply from this release forward.

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
- ✔ **Railway / Windows deployment maintenance** — keeping the hosted
  Railway instance and the Windows local build running and up to date
  (e.g. applying an already-completed release via the update tooling),
  without introducing new behavior.
- ✔ **Documentation corrections** — fixing inaccurate, outdated, or
  misleading docs (this file included).
- ✔ **Small-scope compatibility fixes** — narrow fixes needed to keep the
  system working on a supported OS/browser/Node version, with no visible
  behavior change beyond restoring compatibility.

## Paused during Feature Freeze

- ✘ **New features** — no new modules, pages, or API endpoints beyond what's
  needed to fix an item in the "Allowed" list above.
- ✘ **Large UI changes** — no redesigns, layout overhauls, or new page
  structures. Small, necessary fixes (e.g. a corrected error message) are
  fine; anything that changes how a page looks or is organized is not.
- ✘ **Data structure changes** — no changes to the shape of `data/*.json`
  records beyond what an Allowed fix strictly requires.
- ✘ **Competition rule changes** — no changes to category splits, scoring
  rules, or race-day logic.
- ✘ **Architecture changes** — no refactors of the module structure, data
  storage approach, permission model shape, or deployment model, unless one
  is the *only* way to fix a Critical Bug / Security Bug / Data Loss issue
  above — and even then, treat it as an exception requiring explicit
  sign-off, not a default path.
- ✘ **Non-essential dependency upgrades** — no version bumps beyond what's
  required to fix a Security Bug or Critical Bug above.

## Why this exists

The event this system supports is real and imminent (see PRD.md / RULES.md).
Feature Freeze exists to keep the system stable and predictable for race day
rather than accumulating last-minute risk. Anything not covered by the
"Allowed" list should be logged for the next planning phase (see below)
instead of implemented now.

---

## Current deployment status

- **GitHub:** `main` branch is the source of truth, up to date with
  `origin/main`.
- **Railway:** `v1.9.1` deployed and live at
  `https://merentas-desa-production.up.railway.app`.
- **Windows local build:** `v1.9.1` — real-machine update completed.
- **Windows update tooling:** update/restore scripts completed and the
  basic update flow has been verified.

## Current core features (production)

- School registration (pendaftaran sekolah)
- Four-category / three-start-group competition structure
- Automatic bib number assignment
- Check-in
- Race control / timer
- Rankings / scoring
- CSV export
- Pengumuman (announcements)
- Borang Kebenaran PDF generator (parent/guardian consent form)
- Pengurus Sekolah trilingual user manual
- Windows one-click update & restore tooling

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
