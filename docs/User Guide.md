# User Guide

General guide for anyone using the Merentas Desa 2026 system on race day. If you're an Administrator, School Manager, or Race Official, also read your role-specific guide (`Admin Guide.md`, `School Manager Guide.md`, `Race Official Guide.md`) — this page only covers what's common to everyone.

## Logging in

1. Open the system's address in your browser (ask the organizer for the exact link — it looks like `http://192.168.x.x:3000` on race day, or `http://localhost:3000` if you're on the same computer as the server).
2. You'll land on the **Log Masuk** (login) page.
3. Enter your username and password (given to you by the Administrator) and press **Log Masuk**.

## First login: you must change your password

Every account starts with a default password and is **forced** to change it on first login — there is no way to skip this. After logging in for the first time, you'll be redirected to **Tukar Kata Laluan** (Change Password) automatically. Nothing else in the system is usable until you do this.

- New password must be at least 6 characters.
- After changing it, use the **new** password from then on — the default password stops working immediately.

## Navigation

The pages you see in the top navigation bar depend on your role — the system only shows you pages you're allowed to use. **Papan Markah Langsung** (Live Leaderboard) is always visible and never requires login — it's meant to be left open on a projector or shared screen all day.

## Logging out

Click **Log Keluar** (Logout) in the navigation bar. Your session also expires automatically after 12 hours.

## The Live Leaderboard (public, no login needed)

Anyone — participants, teachers, parents, spectators — can open **Papan Markah Langsung** without logging in. It shows:
- Latest finishers
- Top rankings per category
- Overall school standings

It refreshes automatically. Nothing needs to be clicked.

## Common questions

**I forgot my password.** Ask an Administrator to reset it — there is no self-service password reset (by design, to keep the login system simple).

**The page looks broken / a button doesn't do anything.** Try refreshing. If it persists, tell the Administrator — check the browser's network connection to the server (see `Backup & Recovery.md` for what to check).

**Can I use this on my phone?** Yes — the server is reachable from any device on the same WiFi network (see the README's "Access from Other Devices" section for the exact address to type).
