const fs = require('fs');

const locks = new Map();

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Serializes read-modify-write cycles per file so concurrent race-day requests
// (multiple teachers checking in / finishing runners at the same moment) can
// never interleave and clobber each other's changes, even across `await`
// boundaries inside `mutator`. `mutator(current)` must return `{ data, result }`
// - `data` is written to disk, `result` is returned to the caller. Throwing
// inside `mutator` aborts the write and rejects the returned promise.
function update(file, fallback, mutator) {
  const prev = locks.get(file) || Promise.resolve();
  const settled = prev.then(() => {}, () => {});
  const task = settled.then(async () => {
    const current = readJSON(file, fallback);
    const { data, result } = await mutator(current);
    writeJSON(file, data);
    return result;
  });
  locks.set(file, task);
  return task;
}

// Same serialization primitive as update(), generalized to an arbitrary key
// instead of always a file path - lets unrelated pieces of code (e.g. an
// event-scoped mutation route and lib/lifecycle.js's archive/create-new)
// share one mutex covering several files at once, not just one. `fn` runs
// once it's this key's turn; whatever it returns/throws becomes the
// returned promise's resolution/rejection, same contract as update().
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const settled = prev.then(() => {}, () => {});
  const task = settled.then(fn);
  locks.set(key, task);
  return task;
}

module.exports = { readJSON, writeJSON, update, withLock };
