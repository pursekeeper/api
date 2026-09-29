// node --test  (run from api/). /v1/verify answers ok:false with the reason when min_raw and min_nano are both missing, since
// 2026-09-29 (pyfile-toolkit, item 5): before that the amount was never checked and ok:true read as "paid". Not a 400: a
// caller that reads only `found` keeps working. any=1 asks only whether the block is a confirmed send to the address and
// the answer says so. Driven through the exported request listener with a mocked node; data/ writes dropped.
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.NANO_RPC = 'http://node.test/rpc';
const DATA_DIR = path.join(__dirname, '..', 'data') + path.sep;
const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync;
fs.writeFileSync = (p, ...a) => { if (String(p).startsWith(DATA_DIR)) return; return realWrite(p, ...a); };
fs.appendFileSync = (p, ...a) => { if (String(p).startsWith(DATA_DIR)) return; return realAppend(p, ...a); };
const { server } = require('../server');
after(() => { fs.writeFileSync = realWrite; fs.appendFileSync = realAppend; });

const TO = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';
const FROM = 'nano_3njeurfzgpwpnqjxoytfnqa7ezbgkordga8e8jg74ey77kww5d5emjjyzrhp';
const HASH = 'AB'.repeat(32);
globalThis.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body);
  const a = b.action === 'block_info' && b.hash === HASH
    ? { block_account: FROM, subtype: 'send', amount: '5000', confirmed: 'true', height: '3', local_timestamp: '1758000000', contents: { link_as_account: TO } }
    : { error: 'unexpected rpc ' + b.action };
  return { ok: true, json: async () => a };
};
async function verify(qs) {
  const res = { headers: {}, status: null, body: null, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    writeHead(s) { this.status = s; }, end(out) { this.body = out ? JSON.parse(String(out)) : null; } };
  await server.listeners('request')[0]({ url: '/v1/verify?' + qs, method: 'GET', headers: { host: 'pursekeeper.dev' }, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}

test('without min_raw or min_nano -> 200, found, ok:false with a reason that names any=1', async () => {
  const r = await verify('hash=' + HASH + '&to=' + TO);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.found, true); assert.equal(r.body.confirmed, true); assert.equal(r.body.ok, false);
  assert.match(r.body.reason, /no minimum given, so the amount was not checked: pass min_raw or min_nano, or any=1/);
  assert.equal(r.body.min_raw, null); assert.equal(r.body.any_amount, false);
});

test('any=1 together with a minimum: the minimum wins, any_amount false', async () => {
  const r = await verify('hash=' + HASH + '&to=' + TO + '&min_raw=5001&any=1');
  assert.equal(r.status, 200); assert.equal(r.body.ok, false); assert.match(r.body.reason, /below min 5001 raw/); assert.equal(r.body.any_amount, false);
});

test('any=1 -> the old answer plus min_raw: null and any_amount: true', async () => {
  const r = await verify('hash=' + HASH + '&to=' + TO + '&any=1');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true); assert.equal(r.body.found, true); assert.equal(r.body.confirmed, true);
  assert.equal(r.body.to, TO); assert.equal(r.body.from, FROM); assert.equal(r.body.amount_raw, '5000');
  assert.equal(r.body.min_raw, null); assert.equal(r.body.any_amount, true);
});

test('with a minimum: checked, echoed, any_amount false', async () => {
  const ok = await verify('hash=' + HASH + '&to=' + TO + '&min_raw=5000');
  assert.equal(ok.status, 200); assert.equal(ok.body.ok, true); assert.equal(ok.body.min_raw, '5000'); assert.equal(ok.body.any_amount, false);
  const low = await verify('hash=' + HASH + '&to=' + TO + '&min_raw=5001');
  assert.equal(low.status, 200); assert.equal(low.body.ok, false); assert.match(low.body.reason, /below min 5001 raw/);
  const nanoMin = await verify('hash=' + HASH + '&min_nano=0.000000000000000000000000001');   // 1000 raw
  assert.equal(nanoMin.status, 200); assert.equal(nanoMin.body.ok, true); assert.equal(nanoMin.body.min_raw, '1000');
});
