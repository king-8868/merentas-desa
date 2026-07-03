# School Manager Guide

For **School Manager** accounts (default username is your school code — `TK`, `SL`, `HU`, `YC`, `CU`, `NS`, `KK`, `NK`, `SM`, or `NP`). A School Manager can only see and manage their **own school's** participants — this is enforced by the server itself, not just hidden in the menu, so there is no way to view or edit another school's data even by guessing a bib number.

Read `User Guide.md` first for login basics.

## What you can do

| Action | Page |
|---|---|
| Register a participant | **Pendaftaran Peserta** |
| Batch-register via CSV import | **Pendaftaran Peserta** (CSV upload) |
| View your school's participant list | **Pendaftaran Peserta** |
| Delete a participant you registered | **Pendaftaran Peserta** |
| View rankings and the live leaderboard | **Kedudukan & Markah Sekolah**, **Papan Markah Langsung** |

## What you cannot do

- Check in participants, control race timers, or record finish times — that's the Race Official's job.
- View or touch another school's participants.
- View the audit log, manage other schools, or change scoring configuration.

## Registering participants

1. Go to **Pendaftaran Peserta**.
2. Fill in the participant's **name** and **category** (Tahap 2 Lelaki / Tahap 2 Perempuan / Tahap 1). Your school is filled in automatically — you cannot register into another school, even if you try to type a different school code.
3. Press register. The **Bib Number** is generated automatically (e.g. `TK-T2L-101`) — you never type it yourself, and it never changes once assigned.

## Batch registration via CSV

For registering many participants at once:

1. Prepare a CSV file with at least these three columns (any order, case-insensitive): `name`, `schoolCode`, `categoryCode`.
2. Upload it on the **Pendaftaran Peserta** page.
3. The system processes each row independently — one bad row (e.g. a typo'd category) does **not** block the rest of the file. After import, you'll see exactly which rows succeeded (with their new bib numbers) and which failed (with a reason), so you can fix and re-upload just the failed ones.
4. If your CSV has rows for a school other than your own, those specific rows are rejected with a clear reason — they will not be silently corrected into your school.

## A note on the Event Lifecycle

Only the Administrator can Close/Archive/Create New the event. If you try to register a participant and get an error saying the event is closed or archived, this means the Administrator has moved the event into that state (usually after race day is over) — this is expected, not a bug. Registration will work again once a new event is opened.
