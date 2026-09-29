// One promise chain per key: fn runs after every earlier fn queued under the same key has settled, whoever queued it.
// Shared by the seller path in server.js (chargeX402, charge, the /v1/work and /v1/fetch hand-backs) and by the
// facilitator's /settle, so one block hash is serialised across both routes: two /settle calls carrying the same block,
// or a /settle racing chargeX402 for the same block, run one after the other and the second sees what the first did
// (block on the chain, or the hash still reserved). Before this module the facilitator had no per-hash lock and entered
// `settling` only after verify's node reads had returned, so both passed seen() and both broadcast (2026-09-29).
'use strict';
const hashLocks = new Map();
function withHashLock(key, fn) {
  const prev = hashLocks.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  hashLocks.set(key, tail);
  tail.then(() => { if (hashLocks.get(key) === tail) hashLocks.delete(key); });
  return run;
}
module.exports = { withHashLock, hashLocks };
