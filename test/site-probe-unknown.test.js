// node --test  (run from api/). The seller probe has two answers in its doc and needs three. A request that got no HTTP
// answer at all (timeout, DNS failure, connection refused or reset) was written as reachable:false, exactly like a door that
// answered the wrong status, and probeHistory() counted it in the seven-day reachability fraction a buyer reads to judge a
// seller. A network error is not evidence about the seller's door (llmrt, 2026-10-23).
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'site-probe-unknown-'));
// The module probes on a timer; nothing may land in the site's own data/ while a test runs.
const DATA_DIR = path.join(__dirname, '..', 'data') + path.sep;
const inData = (p) => String(p).startsWith(DATA_DIR);
const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync, realOpen = fs.openSync;
fs.writeFileSync = (p, ...a) => (inData(p) ? undefined : realWrite(p, ...a));
fs.appendFileSync = (p, ...a) => (inData(p) ? undefined : realAppend(p, ...a));
fs.openSync = (p, ...a) => (inData(p) ? realOpen(path.join(SCRATCH, 'sink'), 'w') : realOpen(p, ...a));
const site = require('../site');
after(() => {
  fs.writeFileSync = realWrite; fs.appendFileSync = realAppend; fs.openSync = realOpen;
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}
});

const SELLER = { id: 'probe-subject', name: 'x', operator: 'y', endpoint: 'https://seller.test/paid', probe: { expect: 402 } };
const now = () => new Date().toISOString();
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });

test('a probe that got no answer is unknown, not unreachable', async () => {
  for (const err of [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
                     Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
                     Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })]) {
    globalThis.fetch = async () => { throw err; };
    const p = await site.probeForTest(SELLER);
    assert.equal(p.reachable, null, `${err.message}: reachable must be null, not false`);
    assert.equal(p.unknown, true);
    assert.equal(p.status, null);
  }
});

test('a door that answered the wrong status is still unreachable', async () => {
  globalThis.fetch = async () => ({ status: 500, json: async () => ({}) });
  const p = await site.probeForTest(SELLER);
  assert.equal(p.reachable, false);
  assert.equal(p.unknown, undefined);
  assert.equal(p.status, 500);
});

test('a door that answered the expected status with payment terms is reachable', async () => {
  // terms in a header only (copperglass-shaped), in the body only (pururin-shaped: a Nano address), and as an accepts list
  const ADDR = 'nano_1' + '1'.repeat(59);
  for (const res of [
    { status: 402, headers: new Headers({ 'payment-required': 'e30=' }), text: async () => '{"error":"payment_required"}' },
    { status: 402, headers: new Headers({ 'x-payment-address': ADDR }), text: async () => '' },
    { status: 402, headers: new Headers(), text: async () => JSON.stringify({ error: 'payment_required', pay_to: ADDR }) },
    { status: 402, headers: new Headers(), text: async () => '{"x402Version":1,"accepts":[{"scheme":"exact"}]}' },
  ]) {
    globalThis.fetch = async () => res;
    const p = await site.probeForTest(SELLER);
    assert.equal(p.reachable, true);
    assert.equal(p.no_terms, undefined);
  }
});

test('a 402 with no payment terms is the host talking, not the seller: unreachable, flagged no_terms', async () => {
  // What Vercel answers for a disabled deployment (sur-courier, 2026-11-15): status 402, a text body, its own error header.
  globalThis.fetch = async () => ({ status: 402, headers: new Headers({ 'x-vercel-error': 'DEPLOYMENT_DISABLED', 'content-type': 'text/plain' }), text: async () => 'Payment required\n\nDEPLOYMENT_DISABLED\n\narn1::abcde-1-f' });
  const p = await site.probeForTest(SELLER);
  assert.equal(p.reachable, false);
  assert.equal(p.no_terms, true);
  assert.equal(p.platform_error, 'DEPLOYMENT_DISABLED');
  assert.equal(p.status, 402);
  assert.equal(p.unknown, undefined, 'the host answered; this is not an unanswered probe');
  // a bare 402 with nothing readable at all is the same case
  globalThis.fetch = async () => ({ status: 402, json: async () => ({}) });
  const q = await site.probeForTest(SELLER);
  assert.equal(q.reachable, false);
  assert.equal(q.no_terms, true);
});

test('a seller that declares another status is not asked for payment terms', async () => {
  globalThis.fetch = async () => ({ status: 200, headers: new Headers(), text: async () => '{"ok":true}', json: async () => ({ ok: true }) });
  const p = await site.probeForTest({ ...SELLER, probe: { expect: 200 } });
  assert.equal(p.reachable, true);
  assert.equal(p.no_terms, undefined);
});

test('an unanswered probe is left out of the seven-day fraction and counted beside it', () => {
  const log = path.join(SCRATCH, 'probes.jsonl');
  fs.writeFileSync(log, [
    { t: now(), id: 'a', ok: true, status: 402, ms: 12 },
    { t: now(), id: 'a', ok: false, status: 503, ms: 12 },
    { t: now(), id: 'a', ok: null, status: null, ms: 8000, unknown: true },
    { t: now(), id: 'b', ok: null, status: null, ms: 8000, unknown: true },
  ].map(r => JSON.stringify(r)).join('\n') + '\n');
  const h = site.probeHistoryForTest(log);
  assert.equal(h.a.probes, 3);
  assert.equal(h.a.unknown, 1);
  assert.equal(h.a.reachable, 1);
  assert.equal(h.a.fraction, 0.5, 'one of two answered probes, not one of three');
  assert.equal(h.b.unknown, 1);
  assert.equal(h.b.fraction, null, 'no answer at all is not a 0% door');
});
