const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const store = require('./store');
const { BACKUP_DIR, BACKUP_SCOPED_FILES } = require('./config');
const { logAudit } = require('./audit');
const { EVENT_SCOPE_LOCK } = require('./lifecycle');

// Disaster-recovery safety net, distinct from data/archive/ (the permanent,
// admin-triggered end-of-event record - see routes/lifecycle.js). Backups
// here are short-lived and routinely pruned; nothing about them is meant to
// be kept forever. Runs on an interval rather than per-write: a per-write
// trigger would mean a 50-row CSV import fires 50 full backups back to
// back, for no real safety benefit over one backup a few minutes later -
// and would be the more likely of the two to actually cause the
// performance impact this phase explicitly rules out.
const MAX_BACKUPS = 50;

function timestampDirName() {
  return String(Date.now());
}

// fs.promises.copyFile defers the actual I/O to libuv's thread pool rather
// than blocking Node's single JS thread - the "must not block system
// performance" requirement is why this file uses the promise-based fs API
// throughout instead of the *Sync variants lib/lifecycle.js's archive uses
// (that one runs rarely, only on an explicit admin action, so blocking
// briefly there was an acceptable tradeoff; a periodic timer firing every
// few minutes on a live race-day server is not the same situation).
async function runBackup(reason) {
  const timestamp = timestampDirName();
  const backupPath = path.join(BACKUP_DIR, timestamp);
  await fsp.mkdir(backupPath, { recursive: true });

  const copied = [];
  for (const [name, filePath] of Object.entries(BACKUP_SCOPED_FILES)) {
    try {
      await fsp.copyFile(filePath, path.join(backupPath, `${name}.json`));
      copied.push(name);
    } catch (err) {
      // A file that doesn't exist yet (fresh install, feature not used yet)
      // is not a backup failure - just skip it. Anything else is worth
      // knowing about, but must not stop the rest of the backup.
      if (err.code !== 'ENOENT') {
        console.error(`Backup: failed to copy ${name}:`, err.message);
      }
    }
  }

  await fsp.writeFile(
    path.join(backupPath, 'meta.json'),
    JSON.stringify({ timestamp: Number(timestamp), reason: reason || 'unknown', files: copied }, null, 2)
  );

  await pruneOldBackups();
  return { timestamp: Number(timestamp), path: backupPath, files: copied };
}

async function pruneOldBackups() {
  let entries;
  try {
    entries = await fsp.readdir(BACKUP_DIR, { withFileTypes: true });
  } catch (err) {
    return; // BACKUP_DIR doesn't exist yet - nothing to prune.
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const excess = dirs.length - MAX_BACKUPS;
  if (excess <= 0) return;
  const toRemove = dirs.slice(0, excess);
  for (const name of toRemove) {
    await fsp.rm(path.join(BACKUP_DIR, name), { recursive: true, force: true });
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const dirs = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  return dirs
    .map((name) => {
      const metaPath = path.join(BACKUP_DIR, name, 'meta.json');
      if (!fs.existsSync(metaPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);
}

function getLastBackup() {
  const backups = listBackups();
  return backups.length ? backups[0] : null;
}

// Restores every file present in the chosen backup back into data/. Takes
// one more safety snapshot of the CURRENT (about-to-be-overwritten) state
// first, specifically so a restore that turns out to be a mistake can
// itself be undone the same way. Shares lib/lifecycle.js's EVENT_SCOPE_LOCK
// so this can never interleave with an in-flight event-scoped write or an
// archive/create-new transition - the same protection those already get.
async function restoreBackup(timestamp, actor) {
  const backupPath = path.join(BACKUP_DIR, String(timestamp));
  if (!fs.existsSync(backupPath)) {
    return { ok: false, error: 'Sandaran tidak wujud' };
  }

  const preRestoreSnapshot = await runBackup('pre-restore');

  const restored = await store.withLock(EVENT_SCOPE_LOCK, async () => {
    const done = [];
    for (const [name, filePath] of Object.entries(BACKUP_SCOPED_FILES)) {
      const src = path.join(backupPath, `${name}.json`);
      if (!fs.existsSync(src)) continue; // this backup predates that file - leave the live one as-is
      await fsp.copyFile(src, filePath);
      done.push(name);
    }
    return done;
  });

  logAudit({
    actor: actor.username,
    actorRole: actor.role,
    action: 'backup.restore',
    target: String(timestamp),
    result: 'success',
    detail: `restored: ${restored.join(', ')}; safety snapshot taken first at ${preRestoreSnapshot.timestamp}`,
  });

  return { ok: true, restoredFiles: restored, preRestoreSnapshotTimestamp: preRestoreSnapshot.timestamp };
}

let schedulerHandle = null;

function startBackupScheduler(intervalMinutes) {
  if (schedulerHandle) return; // never double-schedule (e.g. accidental double call)
  runBackup('startup').catch((err) => console.error('Startup backup failed:', err));
  schedulerHandle = setInterval(() => {
    runBackup('interval').catch((err) => console.error('Scheduled backup failed:', err));
  }, intervalMinutes * 60 * 1000);
  if (schedulerHandle.unref) schedulerHandle.unref(); // don't keep the process alive just for this timer
}

module.exports = { runBackup, listBackups, getLastBackup, restoreBackup, startBackupScheduler, MAX_BACKUPS };
