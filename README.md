# Kejohanan Merentas Desa Sempena Hari Kebangsaan 2026
### Peringkat Sekolah Zon Luar Bandar

A web system for managing an inter-school cross-country championship:
participant registration with auto-generated bib numbers, attendance check-in,
per-category race timers, automatic Finish Recording (no manual time entry),
category-based individual ranking, and school scoring (top-5-per-school rule).

## Stack

- **Backend:** Plain Node.js (`http`, `fs` built-in modules only — zero npm dependencies)
- **Frontend:** Plain HTML/CSS/JavaScript (no frameworks)
- **Storage:** Local JSON files in `data/`

## Project Structure

```
merentas-desa/
├── server.js               # thin HTTP entry point: wires routes, starts listening
├── package.json
├── docs/                   # role-by-role guides + architecture (see below)
├── lib/
│   ├── config.js           # schools, categories, scoring, permission-matrix seeds, data file paths
│   ├── store.js            # JSON read/write + per-file (and per-key) atomic write queue
│   ├── auth.js             # password hashing, sessions, requireAuth() (auth + authz)
│   ├── audit.js            # logAudit() / readAuditLog() - append-only audit trail
│   ├── lifecycle.js        # event lifecycle state machine (Open/Close/Archive/Create New)
│   ├── http-helpers.js     # sendJSON, parseBody, static file serving
│   ├── router.js           # minimal method+path router (no framework)
│   ├── bib.js              # bib number generation logic
│   ├── csv.js              # zero-dependency CSV parser (for batch import)
│   └── init-data.js        # ensures data/*.json exist on startup
├── routes/
│   ├── auth.js              # login/logout/change-password/create-user
│   ├── schools.js           # school management (add/rename)
│   ├── categories.js
│   ├── students.js          # registration CRUD + CSV batch import
│   ├── checkins.js          # attendance check-in
│   ├── race.js               # per-category race timers (start/finish/reset)
│   ├── results.js           # Finish Recording (auto time) + manual override
│   ├── rankings.js          # ranking + school scoring computation
│   ├── scoring.js            # runtime-configurable points table / top-N-per-school
│   ├── lifecycle.js         # event lifecycle transitions (admin-only)
│   └── audit.js              # audit log viewer (admin-only)
├── data/                    # gitignored - runtime state, not code (see docs/Backup & Recovery.md)
│   ├── schools.json          # participating schools (seeded once, then editable)
│   ├── students.json        # registered participants
│   ├── checkins.json         # attendance check-in records (bib + timestamp)
│   ├── results.json         # recorded finish times (bib + elapsed seconds + recordedAt timestamp)
│   ├── counters.json        # bib sequence counters (per school + category)
│   ├── race-status.json      # per-category race start timestamps
│   ├── scoring-config.json   # points-per-rank table + top-N-per-school (seeded once, then editable)
│   ├── users.json           # accounts (password hashes, never plaintext)
│   ├── sessions.json         # active login sessions
│   ├── event_log.json        # append-only audit trail
│   ├── event-lifecycle.json  # current lifecycle state (OPEN/CLOSED/ARCHIVED) + epoch
│   ├── role_permissions.json # the permission matrix (editable, takes effect immediately)
│   └── archive/               # one timestamped snapshot folder per Archive action
└── public/
    ├── login.html            # login page
    ├── change-password.html  # forced password change on first login
    ├── index.html            # dashboard / event summary
    ├── register.html         # participant registration (auto bib generation)
    ├── checkin.html           # attendance check-in (search/scan + one click)
    ├── race-control.html      # per-category race timer start/finish/reset
    ├── record.html          # Finish Recording (search + Finish button)
    ├── rankings.html         # category rankings + school leaderboard (admin/detail view)
    ├── leaderboard.html        # live scoreboard: latest finishers, top 3, school ranking (projector view) - public, no login
    ├── schools.html           # school management (add school / rename)
    ├── scoring.html            # scoring configuration (points table, top-N-per-school)
    ├── style.css
    └── app.js               # shared helper functions (incl. login/role/nav-visibility logic)
```

See `docs/Architecture.md` for how these pieces fit together, the
role-specific guides (`docs/Admin Guide.md`, `docs/School Manager Guide.md`,
`docs/Race Official Guide.md`, `docs/User Guide.md`) for day-to-day usage,
and `docs/Windows Deployment Guide.md` if you're deploying on Windows rather
than macOS/Linux (the commands below are bash/zsh syntax).

## Installation

**Prerequisites:** Node.js 18 LTS or later recommended (technical minimum:
14.14, since `lib/backup.js` uses `fs.promises.rm()` which was introduced in
that release). That's it — zero npm dependencies, so there is no
`npm install` step.

```bash
git clone <this repository>
cd merentas-desa
```

No build step, no compilation, no database to set up. `data/*.json` is
created automatically on first startup (see `lib/init-data.js`).

## Starting the Server

```bash
node server.js
```

Then open **http://localhost:3000** in your browser. You'll land on the login
page — see **Default Accounts** below.

(Optional) `npm start` runs the same command. To use a different port:

```bash
PORT=8080 node server.js
```

To stop the server, press `Ctrl+C` in the terminal it's running in (or kill
the process another way) — see `docs/Backup & Recovery.md` for what happens
on restart (short answer: nothing is lost).

## Default Accounts

| Role | Username | Default Password |
|---|---|---|
| Administrator | `admin` | `admin2026` |
| School Manager | your school code (`TK`, `SL`, `HU`, `YC`, `CU`, `NS`, `KK`, `NK`, `SM`, or `NP`) | `<CODE>2026` (e.g. `TK2026`) |
| Race Official | `official` | `official2026` |

**Every account is forced to change its password on first login** — there is
no way to skip this. See **Login & Roles** below for details, and the
role-specific guides in `docs/` for what each role can do.

## Login & Roles

Every page except **Papan Markah Langsung** (`leaderboard.html`, the public
projector display) requires logging in. Four roles, enforced on the backend
(not just hidden in the UI):

| Role | Username | Default Password | Can access |
|---|---|---|---|
| Administrator | `admin` | `admin2026` | Everything |
| School Manager | school code (`TK`, `SL`, `HU`, `YC`, `CU`, `NS`, `KK`, `NK`, `SM`, or `NP`) | `<CODE>2026` (e.g. `TK2026`) | Register/view/delete **only their own school's** participants; view rankings/leaderboard |
| Race Official | `official` | `official2026` | Check-in, Race Control, Finish Recording, view (not edit) the participant list |
| Public Display | *(none)* | *(none)* | `leaderboard.html` only, no login |

**Every default account must change its password on first login** - the
server redirects straight to a change-password screen and blocks every other
action until that's done. There's no way to skip this.

School data isolation is enforced server-side: `GET /api/students` returns
only a School Manager's own school when they're logged in (not filtered
client-side), and every write endpoint (`POST`/`DELETE /api/students`, CSV
import) re-checks and forces their `schoolCode` regardless of what the
request claims.

The data model (`data/users.json`, gitignored - never committed, since it
holds password hashes) doesn't assume there's only one account per role: an
admin can create more via `POST /api/auth/users` (e.g. a second Race Official
for a larger event) with no code changes needed.

Passwords are hashed with Node's built-in `crypto.scrypt` (no dependency).
Sessions are a random token in an `HttpOnly` cookie, persisted to
`data/sessions.json` (survives a server restart, consistent with this
project's Recovery Mode design), expiring after 12 hours.

## Access from Other Devices (Same WiFi)

The server already listens on all network interfaces by default (this is
just how Node.js works when you don't specify a host — no configuration
needed), so other devices on the same WiFi/LAN — phones, tablets, other
laptops — can reach it too. On startup, the console prints both addresses:

```
Merentas Desa system running:
  - Local:   http://localhost:3000
  - Network: http://192.168.x.x:3000
```

- On the machine running the server, use the **Local** address.
- On any other device connected to the **same WiFi network**, open the
  **Network** address shown in the console in that device's browser
  (e.g. `http://192.168.0.43:3000`). This lets you run registration,
  check-in, race control, and Finish Recording from separate devices at
  the same time — exactly as described in PRD.md's multi-station layout
  (registration desk, check-in table, finish line, race control each on
  their own device).
- If a device can't connect: confirm it's on the *same* WiFi network as the
  host machine (not a guest network, not mobile data), and check the host
  machine's firewall isn't blocking incoming connections on the port.

## Schools

Preloaded on first run (in `data/schools.json`):

| Code | School Name       |
|------|-------------------|
| TK   | SJKC TUNG KIEW    |
| SL   | SJKC SAM LAM      |
| HU   | SJKC HING UNG     |
| YC   | SJKC YUK CHAI     |
| CU   | SJKC CHUNG UNG    |
| NS   | SJKC NENG SHING   |
| KK   | SJKC KWONG KOK    |
| NK   | SJKC NANG KIANG   |
| SM   | SJKC SING MING    |
| NP   | SK NANGA PAK      |

Manage schools at runtime via **Pengurusan Sekolah** (`schools.html`):
- **Add school** — enter a code (1-6 letters/digits, e.g. `PH`) and name. The new
  school is immediately usable for registration.
- **Edit school** — only the display name can be renamed. The code is permanent
  once created, since it's already embedded in every bib number and counter key
  issued for that school — changing it would orphan historical data.
- **View participants** — participant count per school shown in the same table;
  full participant list filterable by school on `register.html`.

(API: `GET/POST /api/schools`, `PUT /api/schools/:code`)

## Categories

| Code | Category Label                  | Bib Code |
|------|----------------------------------|----------|
| A    | Tahap 2 Lelaki                   | T2L      |
| B    | Tahap 2 Perempuan                 | T2P      |
| C    | Tahap 1 (Lelaki & Perempuan)      | T1       |

Edit the `CATEGORIES` array in `lib/config.js` to change categories.

## Bib Number Format

`{SchoolCode}-{CategoryBibCode}-{Sequence}`, following the official competition
numbering ranges. Each school has its own sequence per category (not shared
across schools):

| Category | Bib Code | Range   | Example      |
|----------|----------|---------|--------------|
| A (Tahap 2 Lelaki)    | T2L | 101-199 | `TK-T2L-101` |
| B (Tahap 2 Perempuan) | T2P | 201-299 | `TK-T2P-201` |
| C (Tahap 1)           | T1  | 301-399 | `TK-T1-301`  |

So `TK-T2L-101`, `TK-T2L-102`, ... and `SL-T2L-101`, `SL-T2L-102`, ... increment
independently — up to 99 participants per school per category. The sequence is
tracked in `data/counters.json` and never reused, even if a participant is
later deleted — bib numbers are permanent once assigned. Editing a participant
never changes their bib; only deleting and re-registering does.

## How to Use

1. **Pendaftaran Peserta** (`register.html`) — enter the participant's name, pick
   their school and category, then submit. The system generates and displays the
   bib number immediately. The list below can be filtered by school/category.
   Also supports **CSV batch import** and **CSV export** — see Import/Export
   section below.
2. **Rekod Tamat** (`record.html`) — Finish Recording. Scan/type a bib and press
   **Enter** (or search a name and press the **Selesai** button) → the finish
   time is calculated automatically from that category's race clock. No time is
   ever typed. A participant can only finish if they are checked in and their
   category's race has started; otherwise the button is disabled with the
   reason shown (e.g. "Belum daftar masuk" / "Perlumbaan belum bermula"). Shows
   the participant's live category rank immediately after finishing, a
   "recently finished" feed (with undo), and the full participant list with
   check-in/finish status, filterable by school/category/status.
3. **Kedudukan & Markah Sekolah** (`rankings.html`) — detailed/admin view:
   - **School leaderboard**: schools ranked by total score, descending.
   - **Category rankings**: switch between category tabs (A/B/C) to see the
     full individual ranking (not just top 3) sorted by fastest time, with
     points awarded per rank, plus who hasn't finished yet per category.
   - Auto-refreshes every 5 seconds.
4. **Pengurusan Sekolah** (`schools.html`) — add new participating schools or
   rename existing ones; see participant count per school.
5. **Daftar Masuk** (`checkin.html`) — race-day attendance:
   - Scan (or type) a bib number and press **Enter** → instant check-in, no click
     needed. Built for barcode scanners: a scanner "types" the bib + Enter, so
     the search box stays focused and ready for the next participant continuously.
   - Typing a name instead shows matching participants below with a **Daftar
     Masuk** button each (one click).
   - Shows attendance stats, a "recently checked-in" feed (with undo), and the
     full participant list filterable by school/category/status.

(API: `GET/POST /api/checkins`, `DELETE /api/checkins/:bib`. Check-in is
idempotent — checking in an already-checked-in bib is a no-op, not an error,
so an accidental double-scan never surfaces a scary message on race day.)

6. **Kawalan Perlumbaan** (`race-control.html`) — administrator starts each
   category's race clock independently:
   - Each of the 3 categories has its own **Mula Perlumbaan** (Start) button and
     a live elapsed timer, ticking every second.
   - Starting is idempotent — pressing Start again on an already-running
     category does nothing (it never resets the clock).
   - **Reset** clears a category's start time (for correcting an accidental
     start) — this is destructive and requires confirmation, since any finish
     times recorded after a reset will be computed against the new start time.
   - The start timestamp is written to disk immediately, so a browser refresh,
     crash, or server restart never loses the running clock (verified: killing
     and restarting the server mid-race preserves the exact elapsed time).

(API: `GET /api/race-status`, `POST /api/race-status/:code/start`,
`POST /api/race-status/:code/reset`)

**Finish Recording** (`POST /api/results/finish`, body `{ bib }`) is the only
endpoint the Finish Recording UI calls. It:
1. Rejects if the bib doesn't exist, isn't checked in, or that category's race
   hasn't started (RULES.md: "only checked-in participants can finish").
2. Computes `elapsedSeconds = now - categoryStartTime` and stores it as the
   result — the same shape as before, so ranking/scoring code needed no changes.
3. Is idempotent: finishing an already-finished bib returns the original
   result untouched, so a double-press never corrupts a real finish time with
   a later, meaningless timestamp.

`POST /api/results` (explicit `{ bib, time }`) still exists as a manual
override for edge cases (timer malfunction, backup stopwatch) — it is
intentionally not exposed in the main Finish Recording UI.

7. **Papan Markah Langsung** (`leaderboard.html`) — pure display, no
   interactive controls, designed to run on a projector/public screen
   throughout the event:
   - **Baru Tamat** (Latest Finishers) — the most recently recorded finishers,
     newest first (based on `recordedAt`, a wall-clock timestamp, not the
     race elapsed time - see bug note below).
   - **3 Teratas Setiap Kategori** (Top 3 per category) — podium-style cards
     with medals, per category.
   - **Kedudukan Keseluruhan Sekolah** (Overall School Ranking) — full team
     standings, large-font.
   - Auto-refreshes every 3 seconds.

   Every result now carries a `recordedAt` timestamp (set server-side when the
   result is created/corrected) in addition to `time` (elapsed race seconds).
   `record.html`'s "Baru Tamat" feed originally sorted by `time` descending,
   which actually surfaced the *slowest* finishers, not the most recent ones -
   fixed to sort by `recordedAt` instead. Category/school rankings are
   unaffected - they correctly sort by `time` (fastest wins), never `recordedAt`.

8. **Konfigurasi Markah** (`scoring.html`) — edit the points-per-rank table
   (add/remove rows) and the top-N-per-school cap, then **Simpan**. Takes
   effect immediately, everywhere rankings are shown.

## Import / Export (CSV)

CSV only, by design — no Excel/.xlsx or PDF support, to keep the project at
zero npm dependencies (real `.xlsx` parsing/writing needs a library; CSV does
not).

**Import** — on `register.html`, under "Import Peserta Secara Pukal (CSV)":
- Download the template (**Muat Turun Templat CSV**) to see the exact expected
  columns: `name`, `schoolCode`, `categoryCode` (any column order; matched
  case-insensitively).
- Choose a `.csv` file and press **Import CSV**. Each row is validated and
  registered independently (best-effort) — one bad row (typo'd school code,
  missing name, etc.) never blocks the rest of a large batch. The result shows
  exactly how many rows succeeded (with their new bib numbers) and which rows
  failed with the reason, so you can fix just those and re-import them.
- The CSV parser is hand-written (`lib/csv.js`, no dependency) and handles
  quoted fields (e.g. a name containing a comma) and both `\n`/`\r\n` line endings.

(API: `POST /api/students/import`, raw CSV text as the request body.)

**Export** — generated entirely in the browser from data already loaded via
the existing APIs (no new backend calls, no dependency):
- `register.html` → **Eksport Senarai (CSV)**: full participant list.
- `rankings.html` → **Eksport Keputusan Individu (CSV)**: every finisher across
  all categories, with rank/time/points.
- `rankings.html` → **Eksport Kedudukan Sekolah (CSV)**: full school standings.
- `rankings.html` → **Eksport Pemenang Hadiah (CSV)**: top 3 per category.

## Scoring Rules

Fully configurable at runtime via **Konfigurasi Markah** (`scoring.html`) — no
code edit or restart needed:

- **Individual points** are awarded per category based on finishing rank via an
  editable table (default: 1st = 10 pts, 2nd = 9 pts, ... 10th = 1 pt). Add or
  remove rank rows freely; any rank beyond the table gets 0 points.
- **School score** = sum of points from that school's **best N finishers only**
  (across all categories) — N is editable (default 5), regardless of how many
  participants the school enters.
- Changes apply immediately to every subsequent `/api/rankings` call — verified
  live (changing the points table and top-N instantly changed both category
  points and school totals with no server restart).

(API: `GET/PUT /api/scoring-config`, stored in `data/scoring-config.json`,
seeded once from defaults in `lib/config.js` then fully live-editable.)

## Full Race Flow: Open → Close → Archive → Create New

This is how you take a race day from start to finish and prepare for the
*next* event, without ever losing historical data. Only the Administrator can
do this (see `docs/Admin Guide.md` for the full walkthrough).

```
OPEN ──close──> CLOSED ──archive──> ARCHIVED ──create new──> OPEN (next event)
  ▲               │
  └───reopen──────┘   (correction path if closed by mistake)
```

1. **OPEN** (the default/normal state) — registration, check-in, race control,
   and result recording all work normally.
2. **Close** — stops all further mutations for the day. This is reversible:
   you can **Open** again from `CLOSED` if you closed too early by mistake.
3. **Archive** — only valid from `CLOSED`. Snapshots students/results/
   check-ins/race-status/bib-counters into `data/archive/<timestamp>/`
   **before** anything is cleared. This is the actual backup step.
4. **Create New** — only valid from `ARCHIVED`. Clears those same 5 files
   back to empty and returns to `OPEN`, ready for the next event. Schools,
   user accounts, and the permission matrix are never touched.

This sequence cannot be skipped or reordered — the system rejects any
out-of-order attempt with a clear error (e.g. trying to Archive while still
`OPEN`). See `docs/Backup & Recovery.md` for the full backup story, and
`docs/Architecture.md` for how this is made safe under concurrent race-day
load (the short version: a generation counter plus a shared lock closes a
race condition where an in-flight write could otherwise land in the wrong
event after a fast Close→Archive→Create New cycle — found and fixed during
1.1-E's architecture review, then verified under real concurrent load).

(API: `GET /api/lifecycle`, `POST /api/lifecycle/open|close|archive|create-new`)

## Data Storage & Recovery

All data lives as plain JSON in `data/` (gitignored — it's real people's
data, not code) — see `docs/Backup & Recovery.md` for the full picture,
including manual backup instructions and what to do if the server crashes or
the computer restarts mid-race (short answer: nothing is lost, no manual
recovery step is needed — every write goes to disk immediately, and this has
been verified directly).

To start a genuinely fresh event with none of the current data, use the
lifecycle flow above (**Close → Archive → Create New**) rather than manually
deleting/editing files in `data/` — this way the outgoing event's data is
safely archived first instead of being silently lost.

## UI Design

Every page shares `style.css` (plus a small page-specific `<style>` block on
`race-control.html`, `record.html`, and `leaderboard.html` for their custom
components). Design language: translucent "glass" cards
(`backdrop-filter: blur()` over a soft gradient background), pill-shaped nav
links/buttons/badges, the system font stack (`-apple-system` etc.), soft
diffused shadows, and rounded corners throughout.

- **Desktop/tablet**: `main` caps at 1040px so text/tables stay readable; a
  `@media (max-width: 720px)` block shrinks header/nav/card padding for
  smaller screens.
- **Projector**: `leaderboard.html` overrides `main` to 1400px to use more of
  a large screen's width, and uses larger font sizes throughout (its podium
  cards, finisher rows, and school ranking rows are all sized for
  from-a-distance readability).
- **Verified visually** via headless Chrome (CDP-driven, with accurate device
  metric emulation) at 375px/768px/1400px widths — zero horizontal overflow
  on any of the 9 pages, zero console errors, zero failed network requests.

## FAQ

**Do I need to install anything besides Node.js?** No. Zero npm dependencies
— clone the repo and run `node server.js`.

**I forgot my password / an account is locked out.** There is no
self-service password reset by design (to keep login simple) — the
Administrator creates/fixes accounts via the API (`POST /api/auth/users`).
See `docs/Admin Guide.md`.

**Can several devices use the system at the same time?** Yes — see **Access
from Other Devices (Same WiFi)** above. A typical race-day layout is one
device each for registration, check-in, race control, and finish recording,
plus a projector running the public leaderboard.

**What happens if the server crashes or the computer restarts mid-race?**
Nothing is lost — see `docs/Backup & Recovery.md`. Restart the server and
reopen the browser; all data and your login session are exactly as they were.

**How do I start a completely new event without losing this one's data?**
Use the lifecycle flow: **Close → Archive → Create New** (see **Full Race
Flow** above and `docs/Admin Guide.md`). Never manually delete files in
`data/` for this — the lifecycle flow archives the outgoing event first.

**Why CSV import/export instead of Excel or PDF?** To keep the project at
zero npm dependencies — real `.xlsx`/PDF generation needs a library; CSV does
not. See **Import / Export (CSV)** above.

**Is this suitable for a large multi-day event or a database-backed
deployment?** No — see **Notes / Limitations** below. It's built for a single
race day on a local network, with JSON files as the only storage.

## Notes / Limitations (MVP scope)

- Session-based authentication with four roles (Administrator, School
  Manager, Race Official, public read-only leaderboard) — see **Login &
  Roles** above. This is a simple, self-hosted login system (no OAuth, no
  cloud identity provider) intended for trusted local/LAN use during the
  event, not a general-purpose multi-tenant deployment.
- No RFID/chip-timing integration — finish time is derived from the category's
  server-recorded start time and the moment an official presses Finish, not
  from a physical sensor at the finish line.
- A student can only have one recorded finish time (Finish Recording is
  idempotent; correcting a mistake requires deleting the result first via the
  "Batal" button, then finishing again).
- Storage is flat JSON files with a per-file write queue, not a database —
  appropriate at this system's scale (one race day, a handful of concurrent
  devices on one LAN), not for high-volume or multi-region deployment.
