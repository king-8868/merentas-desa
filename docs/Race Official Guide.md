# Race Official Guide

For **Race Official** accounts (default username `official`). This is the role used on race day itself: check-in, starting/finishing races, and recording results. The system supports more than one Race Official account (e.g. one per check-in table) — ask the Administrator to create additional accounts if needed.

Read `User Guide.md` first for login basics.

## What you can do

| Action | Page |
|---|---|
| Check in a participant | **Daftar Masuk** |
| Start / finish / reset a category's race timer | **Kawalan Perlumbaan** |
| Record a participant's finish | **Rekod Tamat** |
| View the participant list (read-only) | **Pendaftaran Peserta** |
| View rankings and the live leaderboard | **Kedudukan & Markah Sekolah**, **Papan Markah Langsung** |

## What you cannot do

- Register or delete participants.
- Manage schools or scoring configuration.
- Open/Close/Archive the event.

## Check-in

Search by **Bib Number** or **participant name**, then press **Daftar Masuk**. This is safe to press more than once for the same participant — pressing it again just confirms the existing check-in time, it never creates a duplicate or errors out. Only checked-in participants can appear in Finish Recording.

## Race Control

Each category (Tahap 2 Lelaki / Tahap 2 Perempuan / Tahap 1) has its own independent timer.

- **Start [Category]** begins that category's clock. Pressing Start again on an already-started category does nothing (it will not reset the clock) — this protects against accidentally wiping the real start time with a second click.
- **Finish [Category]** locks that category: after this, no result for that category can be created, changed, or deleted by anyone (including Admin's manual override). Only do this once every participant in that category has been recorded.
- **Reset [Category]** clears a category's start time — use this only to correct a mistake (e.g. the wrong category was started). It's blocked if any result already exists for that category (to avoid orphaning a recorded time against a deleted clock) and blocked once the category is Finished.

## Finish Recording — the most important screen

This is deliberately a **one-action** flow, per the system's race-day design principle: you never calculate or type a time.

1. Search for the participant (by bib or name) on **Rekod Tamat**.
2. Press **Finish**.
3. The system automatically: records the exact finish time from that category's race clock, calculates their race time, updates category rankings, updates school points, and updates the live leaderboard. All instantly, with no further action from you.

Requirements enforced automatically — you'll get a clear error if any of these aren't met yet:
- The participant must exist.
- They must already be checked in.
- Their category's race must be **running** (started, not yet finished).

Pressing Finish again for someone already recorded is safe — it shows their original result, it does not overwrite it with a new (meaningless) time.

## If something goes wrong mid-race

- Wrong category started by mistake → use **Reset** (only works if no results are recorded yet for that category).
- Wrong finish recorded → ask the Administrator to delete that specific result (only possible before that category is marked Finished), then record it again correctly.
- Server or browser restarts mid-race → see `Backup & Recovery.md`. Nothing is lost — every check-in, race start, and finish time is saved to disk the instant it happens, not just kept in the browser.
