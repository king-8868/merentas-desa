# Windows Update Acceptance Checklist (v1.9.1 first local update)

This checklist is for the first real run of `Update_System.bat` on an actual
Windows machine. Everything on it requires a real Windows 10/11 PC — none of
it was (or could be) executed from the Mac development environment; see
`docs/PROJECT_STATUS.md`-adjacent audit notes / the v1.9.1 Windows update
report for what *was* verified on Mac (static review, simulated directory
tests, and `prepare-windows-update.sh` end-to-end).

Use a **test copy** of the school's folder first if at all possible — copy
the whole `merentas-desa` folder somewhere else, seed it with a few test
students, and run the update against that copy before ever running it
against the real production folder.

## Checklist

- [ ] 1. Old version starts normally (`node server.js` or however it's
      currently run) before the update begins.
- [ ] 2. `data\` has real (or test) data in it beforehand — schools, users,
      at least a couple of students — so "did data survive" is actually
      checkable, not vacuously true.
- [ ] 3. Run the update (`Update_System.bat`) end-to-end.
- [ ] 4. Automatic backup succeeds — a new
      `backup_before_update\update-YYYYMMDD-HHMMSS\` folder appears, and it
      contains both a `data\` subfolder and a `code\` subfolder with
      plausible contents (not empty).
- [ ] 5. v1.9.1 files actually land in the live folder — spot check
      `public\manual-school.html`, `routes\documents.js`,
      `lib\consent-form.js` exist and are non-empty after the update.
- [ ] 6. `pdf-lib` installs successfully — `node_modules\pdf-lib\` exists
      after the update, and the console output showed `npm ci` (or the
      `npm install` fallback) exit without an error.
- [ ] 7. `templates\borang-pengakuan.pdf` exists after the update.
- [ ] 8. Server starts automatically in its own minimized window without
      manual intervention.
- [ ] 9. `http://localhost:3000` (and specifically `/login.html`) loads
      normally in a browser.
- [ ] 10. Old data is still there — the same schools/users/students from
      step 2 are still visible after logging in.
- [ ] 11. Login works normally with an existing account.
- [ ] 12. Announcement (Pengumuman) still works — School Manager still sees
      the popup, Admin can still edit it.
- [ ] 13. `/manual-school.html` (Panduan Pengurus Sekolah) loads, poster
      image displays, language switcher works.
- [ ] 14. Document Generator still works — download a real Borang Kebenaran
      PDF and confirm it opens and has the right page count.
- [ ] 15. `RESTORE_LAST_BACKUP.bat` actually works — deliberately run it once
      against a **test copy** (never the real production folder unless you
      genuinely need to roll back) and confirm it lists backups, restores
      correctly, and the server comes back up.

## Also worth confirming while you're there

- [ ] Folder path with a space in it (e.g. `C:\Merentas Desa\`) doesn't break
      anything — if the school's real folder path has a space, this isn't
      optional.
- [ ] A path on `D:` (or any non-`C:` drive) works the same way, if that's
      where the school keeps it.
- [ ] Chinese characters in the live folder's own path (if any) don't break
      `robocopy`/PowerShell calls.
- [ ] No administrator elevation prompt appears (it shouldn't be needed
      unless the folder lives somewhere like `C:\Program Files\`, which is
      not the recommended install location — see `更新说明.txt`).
- [ ] Deliberately fail an update once (e.g. rename `new_version\server.js`
      to something else before running) and confirm the tool refuses to
      proceed, says so clearly, and leaves the live folder untouched.

## What was already verified on Mac (do not re-verify from scratch, but spot check)

- `prepare-windows-update.sh` produces a package containing exactly
  `public/`, `routes/`, `lib/`, `templates/`, `server.js`, `package.json`,
  `package-lock.json`, `CHANGELOG.md` — no `data/`, `backup/`, `node_modules/`,
  `.git/`, `.env`, or stray PDFs (script has a built-in safety check for this
  and was run end-to-end against the real v1.9.1 tree).
- `templates/borang-pengakuan.pdf`'s MD5 hash is identical before and after
  packaging.
- Both `.bat` files were reviewed line-by-line for the classic Windows batch
  pitfalls (unescaped parentheses inside `if` blocks, delayed-expansion
  correctness, quoting for paths with spaces, `for /f` quoting conventions)
  — but **never executed**, since there is no Windows/`cmd.exe`/`robocopy`
  available in this environment. Treat every checklist item above as
  unverified until it's actually run once on a real machine.
