# Windows Deployment Guide

Complete guide to running Merentas Desa Management System (v1.4-stable) on a
Windows PC. This is a documentation-only companion to the main `README.md` —
nothing about the application itself changes on Windows; only the commands
you type differ from macOS/Linux.

## 1. Required Software

| Software | Version | Notes |
|---|---|---|
| **Node.js** | 18 LTS or later (minimum technical floor: 14.14) | The only required install. [nodejs.org](https://nodejs.org) → download the **Windows Installer (.msi)**, LTS version. |
| npm | Bundled with Node.js | Not actually needed day-to-day — this project has **zero npm dependencies** — but the installer includes it anyway. |
| A modern browser | Chrome, Edge, or Firefox | For accessing the system's pages. |

That's the complete list. No database, no IIS, no Python, no build tools, no
Visual Studio components — the Node.js installer alone is sufficient. The
project has zero npm dependencies (confirmed: `package.json` lists none), so
there is no `npm install` step and no `node_modules` folder to manage.

**Why Node 18 LTS instead of the README's general "v14+"**: `lib/backup.js`
(1.4's automatic backup system) uses `fs.promises.rm()`, which was
introduced in Node **14.14.0** specifically — not the whole v14 line. Node 18
LTS comfortably clears that floor and is the realistic choice for a fresh
install today; there's no reason to install something as old as 14.x on a
new machine.

## 2. Installing and Starting the Server on Windows

### 2.1 Install Node.js

1. Download the Windows Installer from [nodejs.org](https://nodejs.org)
   (choose the **LTS** button).
2. Run the installer, accept the defaults (this adds `node` and `npm` to
   your `PATH` automatically — no manual configuration needed).
3. Verify the install by opening **Command Prompt** (`cmd.exe`) or
   **PowerShell** and running:
   ```
   node --version
   ```
   You should see something like `v18.x.x` or higher.

### 2.2 Copy the Project onto the Windows PC

Copy the entire project folder (e.g. `merentas-desa`) onto the Windows
machine — via USB drive, network share, or `git clone` if Git for Windows is
installed. Any location works (Desktop, `Documents`, `C:\apps\`, etc.) — the
project only ever reads/writes files relative to its own folder
(`lib/config.js` resolves every path from `__dirname`, never a hardcoded
absolute path), so where you put it doesn't matter.

**Do not copy an existing `data/` or `backup/` folder from a Mac into a
brand-new install unless you intend to bring that real data with you** — see
section 6 below for the correct way to migrate data.

### 2.3 Start the Server

Open **Command Prompt** or **PowerShell**, navigate into the project folder,
and start it:

```
cd C:\path\to\merentas-desa
node server.js
```

You'll see the same startup banner as on any other platform:

```
Merentas Desa system running:
  - Version: 1.4
  - Event:   KEJOHANAN MERENTAS DESA SEMPENA HARI KEBANGSAAN 2026
  - Local:   http://localhost:3000
  - Network: http://192.168.x.x:3000
...
```

Open **http://localhost:3000** in a browser on that same PC to confirm it's
running. `npm start` also works identically (it just runs `node server.js`
per `package.json`).

**To use a different port** — the `PORT=8080 node server.js` syntax shown in
`README.md` is bash/zsh syntax (macOS/Linux) and **will not work in Windows
Command Prompt or PowerShell**. Use the Windows-appropriate form instead:

- **Command Prompt (cmd.exe):**
  ```
  set PORT=8080
  node server.js
  ```
- **PowerShell:**
  ```
  $env:PORT=8080
  node server.js
  ```

The same applies to the other environment variables this system supports
(`BACKUP_INTERVAL_MINUTES`, `RESTORE_MODE`) — always `set VAR=value` then
`node server.js` on its own line in Command Prompt, or `$env:VAR="value"`
then `node server.js` in PowerShell. Never the `VAR=value command` one-liner
form — that's shell syntax Windows doesn't have.

### 2.4 Keeping the Server Running

Closing the Command Prompt/PowerShell window stops the server (same as
Ctrl+C would). For race day:
- Simplest: leave that window open, minimized, for the duration of the event.
- To avoid accidentally closing it, create a desktop shortcut with target
  `cmd.exe /k "cd /d C:\path\to\merentas-desa && node server.js"` — the
  `/k` keeps the window open after the command finishes/errors, so you can
  see any error message instead of a window that vanishes instantly.
- Running as a background Windows Service (e.g. via NSSM or Task Scheduler)
  is possible but out of scope for this guide — it's an operational choice,
  not something the application needs; a plain foreground `node server.js`
  in a window you leave open is entirely sufficient for a single race-day
  event and is what this guide recommends.

## 3. Accessing from Other Devices on the Same LAN

This works identically to macOS/Linux (`server.js`'s LAN detection uses
Node's built-in `os.networkInterfaces()`, which is fully cross-platform) —
**with one Windows-specific extra step: the Windows Firewall prompt.**

1. The **first time** you run `node server.js` on Windows, you will likely
   see a **"Windows Defender Firewall has blocked some features of this
   app"** popup. **You must click "Allow access"** (for at least "Private
   networks") — if you click Cancel/dismiss it, other devices on the LAN
   will **not** be able to reach the server, even though it works fine on
   `localhost` from the same PC.
   - If you missed this prompt or clicked the wrong option, go to
     **Windows Security → Firewall & network protection → Allow an app
     through firewall**, find **Node.js JavaScript Runtime**, and make sure
     both **Private** and (if needed) **Public** are checked.
2. Find this PC's LAN IP address — either read it from the server's own
   startup banner (`Network: http://192.168.x.x:3000`), or run `ipconfig`
   in Command Prompt and look for **IPv4 Address** under your active adapter
   (Wi-Fi or Ethernet).
3. On any other device (phone, tablet, another laptop) connected to the
   **same WiFi network**, open that address in a browser, e.g.
   `http://192.168.0.43:3000`.
4. If it still doesn't connect: confirm the other device is on the *same*
   network (not a guest network or mobile data), and double-check the
   firewall prompt from step 1 was actually allowed.

## 4. Backup and Restore on Windows

The application's own backup/restore system (introduced in 1.4) works
identically on Windows — it's pure Node.js file operations
(`fs.promises.copyFile`, etc.), nothing shell- or OS-specific:

- **Automatic backups** happen on their own (every 15 minutes by default,
  configurable via `BACKUP_INTERVAL_MINUTES` — see the Windows env var
  syntax in section 2.3) into a `backup\` folder next to the project.
- **Restoring** is disabled by default and must be explicitly enabled for
  that run:
  - Command Prompt: `set RESTORE_MODE=enabled` then `node server.js`
  - PowerShell: `$env:RESTORE_MODE="enabled"` then `node server.js`
  - Then use the **Tetapan Acara → Sandaran & Pemulihan** section (Admin
    only) or `docs/Admin Guide.md` / `docs/Backup & Recovery.md` for the
    full restore workflow — the API and UI behave exactly the same as on
    any other platform.

**Manual full backup** — `docs/Backup & Recovery.md` shows the macOS/Linux
command (`cp -r data/ data-backup-YYYYMMDD/`). The Windows equivalents:

- **Command Prompt:**
  ```
  xcopy data data-backup-20260704 /E /I
  ```
- **PowerShell:**
  ```
  Copy-Item -Path data -Destination data-backup-20260704 -Recurse
  ```

Do this before race day starts, and again after Archive at the end of the
day — same guidance as `docs/Backup & Recovery.md`, just with Windows
commands.

## 5. Moving to Another Windows PC Without Losing Data

Because **every piece of state lives in the `data\` folder** (plain JSON
files — students, results, users, scoring config, lifecycle state, audit
log) and nothing is stored anywhere else (no database, no OS registry, no
user profile folders), moving the whole system is just moving files:

1. **Stop the server** on the old PC (close its Command Prompt/PowerShell
   window, or Ctrl+C).
2. **Copy the entire project folder** (including `data\`, and `backup\` if
   you want its history too) to a USB drive or network share.
3. On the new Windows PC: install Node.js (section 1-2 above) if not already
   present, then copy the project folder onto it.
4. Start the server the same way (`node server.js`). It will find the
   existing `data\` folder and use it as-is — `lib/init-data.js` only
   creates default/seed files when they're **missing**, so your real
   students, results, user accounts, and event configuration all carry over
   untouched.
5. Verify: open the system, confirm the participant list, rankings, and
   Event Settings (title/year) all match what was on the old machine.

**What you do NOT need to do**: reinstall or reconfigure anything beyond
Node.js itself — there's no `node_modules` folder (zero dependencies) and no
separate configuration file to edit; the port defaults to 3000 unless you
set `PORT` again on the new machine.

## 6. Cross-Platform Verification (Requirement 7)

A full code audit was performed specifically for this deployment guide, to
confirm nothing in the codebase assumes macOS/Linux:

| Check | Result |
|---|---|
| Hardcoded absolute paths (`/Users/`, `/Applications/`, etc.) | None found |
| String-concatenated file paths (`'/' + name`) instead of `path.join()` | None found — every path in `lib/config.js` and elsewhere uses `path.join()`, which produces the correct separator (`\` on Windows, `/` elsewhere) automatically |
| Shell commands invoked from Node (`child_process`, `execSync`, `spawn`) | None found — the application never shells out to an external command |
| `process.platform` / `os.platform()` branches | None found — no platform-specific code paths exist at all, so there's nothing that could be "only tested on Mac" |
| File permission assumptions (`chmod`, Unix-style modes) | None found |
| LAN address detection | Uses `os.networkInterfaces()`, a cross-platform Node.js built-in |

**One genuine gap found and fixed during this pass** (documentation-only,
no application code changed): `docs/Backup & Recovery.md`'s manual backup
example and `README.md`'s `PORT=8080 node server.js` example both use
bash/zsh syntax that doesn't work in Command Prompt or PowerShell. Both are
addressed with Windows-specific equivalents in this guide (sections 2.3 and
4) rather than rewriting the original docs, since those are correct as
written for their primary macOS/Linux audience.

**Conclusion**: the application code itself has no Mac-specific dependencies
or paths. Everything that differs on Windows is at the *operator* level
(shell syntax for environment variables, the firewall prompt, backup
commands) — all covered above.

## 7. Deployment Checklist

Print or copy this list for the actual deployment day:

```
BEFORE RACE DAY
[ ] Node.js 18 LTS (or later) installed on the Windows PC - verified with `node --version`
[ ] Project folder copied onto the PC
[ ] First test run completed: `node server.js` starts without errors
[ ] Windows Firewall prompt answered "Allow access" (Private networks minimum)
[ ] Confirmed http://localhost:3000 loads in a browser on the host PC
[ ] Confirmed the LAN address (from the startup banner, or `ipconfig`) loads from a second device on the same WiFi
[ ] All default accounts logged in once and passwords changed (see docs/Admin Guide.md)
[ ] Event title/year set correctly under Tetapan Acara (Admin)
[ ] Manual full backup taken (section 4 above) as a pre-event safety copy
[ ] Confirmed only ONE node server.js process is running (check Task Manager - see note below)

DURING RACE DAY
[ ] Server window left open (not closed/minimized-and-forgotten) for the whole event
[ ] Devices for registration/check-in/race-control/finish-recording all confirmed connected to the host PC's address
[ ] Projector/public display running Papan Markah Langsung (leaderboard.html), no login needed

AFTER RACE DAY
[ ] Event lifecycle moved through Close -> Archive -> Create New (Tetapan Acara page, or docs/Admin Guide.md)
[ ] Manual backup taken again, post-archive
[ ] If moving to a different PC for storage/next event: follow section 5 above
```

**Note on "only one process running"**: this system has no coordination
between multiple `node server.js` instances writing to the same `data\`
folder (by design - see `docs/Architecture.md`'s Lifecycle section and the
1.4 architecture review). On Windows, check **Task Manager → Details tab**
for more than one `node.exe` process before starting a fresh one, same
caution as on any other platform.
