# Railway Deployment Guide

Complete guide to deploying Merentas Desa Management System (v1.4-stable) to
[Railway](https://railway.app) Hobby plan, as a **single-instance** Node.js
service. This is a documentation-only companion to `README.md` and
`docs/Windows Deployment Guide.md` — the application itself is unchanged;
this guide only covers platform setup and operational procedure.

## 0. Why this needs a small code change, and why it's safe

Railway's Hobby plan runs your app in an ephemeral container: anything
written to disk inside the container's own filesystem is **lost on every
redeploy or restart** unless it's on a mounted **Volume**. This system writes
all of its state to `data/` and `backup/`, both previously hardcoded to live
next to the code (`path.join(ROOT_DIR, 'data')`). Three small,
deployment-only changes were made to support Railway without touching any
business logic:

| File | Change | Business logic touched? |
|---|---|---|
| `lib/config.js` | `DATA_DIR` / `BACKUP_DIR` now read from `process.env.DATA_DIR` / `process.env.BACKUP_DIR` if set, else fall back to the exact same local paths as before | No — Race/Scoring/RBAC/Lifecycle code is untouched; this only changes *where* the same JSON files are read from |
| `server.js` | Added `SIGTERM`/`SIGINT` graceful shutdown (`server.close()` before exit) | No — purely about how the process exits, not what it does while running |
| `package.json` | Added `"engines": { "node": ">=18.0.0" }` | No — tells Railway's builder which Node version to provision |

All three were verified with the local dev experience completely unchanged
(no env vars set → identical behavior to v1.4 STABLE today) and with a full
functional regression pass (login, RBAC, registration, check-in, race
timing, scoring, leaderboard) run against a copy with these changes applied.

## 1. Creating the Railway Project

1. Log into [railway.app](https://railway.app) (GitHub login is simplest,
   since step 2 needs a GitHub connection anyway).
2. Click **New Project → Deploy from GitHub repo**.
3. If this is the first time connecting Railway to your GitHub account,
   authorize the **Railway** GitHub App and grant it access to the repository
   that contains this project (either all repos, or just this one — either
   works).
4. Select the `merentas-desa` repository from the list.

Railway will detect it as a Node.js project automatically (via
`package.json`) using its **Nixpacks** builder — no `Dockerfile` needed and
none is included in this project.

## 2. GitHub Connection Details

- Railway deploys from whichever branch you configure (**Settings → Service
  → Source → Branch**) — typically `main`. Every push to that branch
  triggers a new deploy automatically, unless you turn that off in Settings.
- Railway only ever reads what's committed to Git. Since `.gitignore` already
  excludes `/data/**` and `/backup/**` (see section 5 below), a fresh deploy
  never accidentally ships real student/result/password data — it ships code
  only, and the app re-seeds default accounts and empty data files on first
  boot via `lib/init-data.js`, exactly as it does on a brand-new local
  install.

## 3. Build Command

**Leave it as Railway's auto-detected default.** This project has **zero npm
dependencies** (`package.json` lists none), so Nixpacks' default build step
(`npm install`, which will find nothing to install) is sufficient. No custom
build command is required — do not add one.

If you want to see it explicitly in **Settings → Build**, it's fine to leave
the **Build Command** field blank/default.

## 4. Start Command

Also leave this as Railway's auto-detected default, which resolves to
`package.json`'s existing `"start": "node server.js"` script. Do not
override it — there is nothing platform-specific to add.

## 5. Environment Variables

Set these under **Settings → Variables** (the service's own variables, not
"shared" project-level ones, unless you deploy more than one service):

| Variable | Required? | Value to set | Why |
|---|---|---|---|
| `PORT` | No — do not set this | *(leave unset)* | Railway injects `PORT` automatically at runtime; `server.js` already reads `process.env.PORT` (falls back to 3000 only for local dev, which is irrelevant on Railway since Railway always sets it). Setting it yourself is unnecessary and can conflict with Railway's own port routing. |
| `DATA_DIR` | **Yes**, once a Volume is attached (section 6) | e.g. `/data/app-data` | Points live JSON state at the mounted Volume instead of the ephemeral container filesystem. Without this, all registrations/results/users are wiped on every redeploy. |
| `BACKUP_DIR` | **Yes**, same Volume | e.g. `/data/app-backup` | Same reasoning as `DATA_DIR`, kept as a sibling path so both can live under one Volume mount without colliding. |
| `BACKUP_INTERVAL_MINUTES` | No | default `15` if unset | Only set this if you deliberately want a different automatic-backup cadence. |
| `RESTORE_MODE` | No — leave unset during normal operation | `enabled`, only temporarily | "Break glass" switch for restoring from a backup (see section 9). Must be unset (disabled) the rest of the time — this is enforced by the app itself, not just a suggestion. |

**Do not set** `NODE_ENV` to anything special — this app has no
environment-specific branching (no dev/prod code paths), so it has no effect
either way.

## 6. Persistent Volume Setup

1. In the Railway service, go to **Settings → Volumes → New Volume**.
2. Pick a **mount path**, e.g. `/data` (any absolute path works — this
   example uses `/data` as the Volume's own root).
3. Set the two environment variables from section 5 to subpaths of that
   mount, e.g.:
   ```
   DATA_DIR=/data/app-data
   BACKUP_DIR=/data/app-backup
   ```
   (Subpaths, not the Volume root itself, so `data` and `backup` don't mix
   into one folder — matches how they're kept as separate sibling folders
   locally today.)
4. Redeploy. On first boot against an empty Volume, `lib/init-data.js`
   creates `app-data/` (with all default/seed files — schools, default
   accounts requiring password change on first login, empty student/result
   lists, default scoring config) and `lib/backup.js` creates `app-backup/`
   automatically — **no manual setup inside the Volume is needed.**

**Without this Volume + these two env vars, the Hobby deployment will still
run and look fine — right up until the first redeploy or restart, at which
point every registration, result, user account, and password change is
silently lost.** This is the single most important step in this whole guide.

## 7. First Deployment Flow

```
[ ] Volume created and mounted (section 6)
[ ] DATA_DIR and BACKUP_DIR environment variables set to the Volume's subpaths
[ ] Push/deploy the branch Railway is watching
[ ] Open the generated *.up.railway.app URL - confirm the login page loads
[ ] Log in with each default seed account once, change its password immediately
    (admin / official / one per school - see docs/Admin Guide.md)
[ ] Set the real event title/year under Tetapan Acara (Admin)
[ ] Confirm the Volume actually has data: Railway's Volume browser (or a
    throwaway shell) should show app-data/*.json with real content after
    the above steps, not just seed defaults
[ ] Take a manual note of the deployment date - useful for the changelog
    when comparing against later upgrades
```

Because `PORT`, static file serving (`PUBLIC_DIR`, resolved via `__dirname`
in `lib/config.js` — never `process.cwd()`), and the router (`lib/router.js`)
are already host-agnostic, nothing else needs configuring for the app to be
reachable at Railway's public URL over HTTPS (Railway terminates TLS at its
edge; the app itself still only ever speaks plain HTTP inside the
container, same as it does on a LAN today — this is normal and requires no
change, including to the session cookie, which deliberately omits the
`Secure` flag so it keeps working in both environments).

## 8. Upgrade Flow (Deploying a New Version)

Since all state lives on the Volume (not in the container image), upgrading
code is safe and ordinary:

1. Merge/push your change to the branch Railway watches. Railway builds and
   deploys automatically.
2. Railway starts the new container, which reads the exact same
   `DATA_DIR`/`BACKUP_DIR` Volume the old one used — no data migration step,
   because nothing about the file format changed unless the release notes
   say so.
3. **Recommended safety step for any upgrade**: take a manual backup export
   first (Tetapan Acara → Sandaran & Pemulihan → the automatic backups
   already sitting in `BACKUP_DIR`, or trigger one by simply letting the app
   restart — `startBackupScheduler()` takes one immediately on every boot,
   tagged `reason: "startup"`).
4. Railway performs the swap; the old container receives `SIGTERM` first
   (this is exactly why the graceful-shutdown handler was added in this
   pass) — in-flight requests are allowed to finish and no write is left
   half-completed. Confirm the new deployment's logs show the normal startup
   banner (Version/Event/Data boundaries) before considering the upgrade
   complete.
5. Spot-check: log in, confirm existing students/results/rankings are still
   present (proves the Volume attached correctly to the new container) and
   that the version number in the startup banner / **Maklumat Sistem** page
   matches what you just deployed.

## 9. Data Backup & Restore Procedure (Railway-specific)

Builds on `docs/Backup & Recovery.md` (platform-agnostic) with what's
different about doing this on Railway specifically:

- **Automatic backups** already happen on the schedule in
  `BACKUP_INTERVAL_MINUTES`, written into `BACKUP_DIR` on the same Volume —
  no extra setup needed, this runs the moment the container is up.
- **Downloading a backup off Railway** for offline/long-term storage:
  Railway doesn't give shell access on the Hobby plan the way a local PC
  does, so the simplest path is a short-lived one-off admin route is *not*
  built for this (out of scope for this pass, since that would be a feature
  change) — instead, use Railway's **Volume → Browse Files** panel in the
  dashboard (if available on your plan) to download the relevant
  `app-backup/<timestamp>/` folder, or temporarily use Railway's shell
  (`railway run bash` / **Settings → shell** feature if enabled on your
  plan) with a plain `tar`/`zip` of the folder for download.
- **Restoring** on Railway:
  1. Set `RESTORE_MODE=enabled` as a temporary environment variable and
     redeploy (this is a full redeploy since env var changes restart the
     container — expected and fine).
  2. Use **Tetapan Acara → Sandaran & Pemulihan** (Admin) to pick the backup
     timestamp and confirm the restore, exactly as documented in
     `docs/Backup & Recovery.md` / `docs/Admin Guide.md`. A safety snapshot
     of the about-to-be-overwritten state is taken automatically first, same
     as on any other platform.
  3. **Immediately after restoring, remove the `RESTORE_MODE` environment
     variable and redeploy again** — leaving it set is a standing "break
     glass" door left open. This matches the same discipline as any other
     deployment target; Railway doesn't change the underlying rule.

## 10. Common Issues / Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Data (students/results/users) disappears after a redeploy | No Volume attached, or `DATA_DIR`/`BACKUP_DIR` not set | Follow section 6 — this is the #1 Railway-specific pitfall |
| App builds but crashes immediately / `EADDRINUSE`-style errors | A custom `PORT` was manually set, conflicting with Railway's injected one | Remove any manual `PORT` variable — let Railway inject it |
| Deploy log shows a Node version warning or unexpected syntax error on boot | `engines` not respected by an older cached build, or a fork running a mismatched builder | Confirm `package.json` still has `"engines": { "node": ">=18.0.0" }`, trigger a clean redeploy |
| Can't log in with the seed admin account on a fresh deploy | Normal - first login always requires an immediate password change (`mustChangePassword: true`), not a bug | Log in with the seed password once, you'll be redirected to change it, exactly as on a local install |
| Session/login doesn't stick between requests (403 loops) | Cookie not being sent — check you're accessing the actual `*.up.railway.app` HTTPS URL, not mixing `http://` in a bookmark/proxy | Always use the HTTPS URL Railway gives you |
| Backup restore option greyed out / always rejected | `RESTORE_MODE` not set to `enabled` | Expected default-safe behavior — see section 9 |
| Two people both see "acara sedang ditutup"/stale state right after a redeploy | Normal — a brief window during container swap where the old container drains in-flight requests (graceful shutdown) before the new one is ready | Wait a few seconds and refresh; this is not data loss, just the deploy transition |
| Considering scaling to 2+ replicas for more traffic | **Do not** — see section 11 | N/A |

## 11. Single-Process Requirement (Hard Constraint)

**This application must run as exactly one Node.js process, on Railway or
anywhere else.** Do not:

- Set Railway's replica/instance count above 1 for this service.
- Enable any horizontal autoscaling for this service.
- Run it under a multi-process manager (e.g. `pm2 -i max` / cluster mode).

**Why**: all write-safety in this system (`lib/store.js`'s per-file queue,
and `lib/lifecycle.js`'s `EVENT_SCOPE_LOCK` covering
registration/check-in/race-timing/results/lifecycle transitions) is an
**in-memory lock inside one process**. It correctly serializes concurrent
requests *within* that one process — verified directly under a 250+
concurrent request stress test with zero lost writes, zero duplicate bibs,
zero race conditions. If two or more processes/instances ever ran
simultaneously against the same `DATA_DIR`, each would hold its own,
un-synchronized copy of these locks, and concurrent writes from different
instances **could silently overwrite each other** — the exact class of bug
this locking exists to prevent. Railway Hobby's default of 1 replica for a
service already matches this; this section exists so the constraint is
written down and doesn't get "optimized away" later by someone scaling the
service without knowing why it can't be.

## 12. What Goes Into Git vs. What Doesn't

| Path | In Git? | On Railway |
|---|---|---|
| `server.js`, `lib/`, `routes/`, `public/`, `package.json`, `docs/` | **Yes** | Deployed as the container image on every push |
| `data/` | **No** (`.gitignore`: `/data/**`) | Lives only on the mounted Volume via `DATA_DIR` — real student names, results, and password hashes must never enter source control |
| `backup/` | **No** (`.gitignore`: `/backup/**`) | Lives only on the mounted Volume via `BACKUP_DIR`, same reasoning as `data/` |
| `DEVELOPER_AUTH.md` | No (untracked, unrelated to this project's deployment) | N/A |

This was already correct before this deployment pass (`.gitignore` already
excluded both at the v1.4 STABLE freeze) — Railway deployment doesn't change
this rule, it just makes it matter in a new place: a Volume, not a folder
next to the code.
