// node --test  (run from api/). A bare unpaid request to a listed paid resource answers the 402 challenge, not a 400.
// SealKeeper (sealkeeper.run) listed this door from /.well-known/x402 on 2026-10-22 and checks each resource exactly as
// listed, without paying: "/v1/fetch?url=" with nothing after it and "/v1/work" with no body got 400 and counted as a
// broken payment challenge (12 of 23 checks valid, by mail 2026-10-28). Unpaid and unusable now gets the 402 with the
// parameter rule in `note`; a paid call with a bad parameter is still refused with 400 before the charge, nothing taken.
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
process.env.NANO_RPC = 'http://node.test/rpc';
process.env.WORK_URLS = ''; process.env.PAID_WORK_URLS = '';
// Every write under data/ is dropped: the live credits, x402 log, payers, checks and request log are untouched.
const DATA_DIR = path.join(__dirname, '..', 'data') + path.sep;
const inData = (p) => String(p).startsWith(DATA_DIR);
const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync;
const realOpen = fs.openSync, realRename = fs.renameSync, realCopy = fs.copyFileSync, realUnlink = fs.unlinkSync;
const SCRATCH = path.join(require('node:os').tmpdir(), 'bare-unpaid-402-scratch-' + process.pid);
fs.writeFileSync = (p, ...a) => { if (inData(p)) return; return realWrite(p, ...a); };
fs.appendFileSync = (p, ...a) => { if (inData(p)) return; return realAppend(p, ...a); };
fs.openSync = (p, ...a) => (inData(p) ? realOpen(SCRATCH, 'w') : realOpen(p, ...a));
fs.renameSync = (p, ...a) => { if (inData(p)) return; return realRename(p, ...a); };
fs.copyFileSync = (p, ...a) => { if (inData(p)) return; return realCopy(p, ...a); };
fs.unlinkSync = (p) => { if (inData(p)) return; return realUnlink(p); };
const { server } = require('../server');
after(() => {
  fs.writeFileSync = realWrite; fs.appendFileSync = realAppend;
  fs.openSync = realOpen; fs.renameSync = realRename; fs.copyFileSync = realCopy; fs.unlinkSync = realUnlink;
  try { realUnlink(SCRATCH); } catch {}
});

const response = () => ({ headers: {}, status: null, body: null,
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader(k) { return this.headers[String(k).toLowerCase()]; },
  writeHead(s) { this.status = s; }, end(out) { this.body = out ? JSON.parse(String(out)) : null; } });
const request = (method, url, headers, rawBody) => {
  const req = Readable.from(rawBody === undefined ? [] : [Buffer.from(rawBody)]);
  return Object.assign(req, { url, method, headers: { host: 'pursekeeper.dev', ...headers }, socket: { remoteAddress: '127.0.0.1' } });
};
const handle = async (req) => { const res = response(); await server.listeners('request')[0](req, res); return res; };
const FAKE_HASH = 'A'.repeat(64);   // a bearer header that names no real block; the parameter check runs before it is read

test('GET /v1/fetch?url= with no payment answers 402 with the challenge and the url rule', async () => {
  const res = await handle(request('GET', '/v1/fetch?url=', {}));
  assert.equal(res.status, 402);
  assert.ok(res.headers['payment-required'], 'PAYMENT-REQUIRED header present');
  assert.equal(res.body.error, 'payment required');
  assert.match(res.body.url_error, /url/i);
  assert.match(res.body.note, /absolute http\(s\) URL/);
  assert.equal(res.body.pay_to, 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue');
});

test('GET /v1/fetch?url= with a payment presented is refused with 400 before any charge', async () => {
  const res = await handle(request('GET', '/v1/fetch?url=', { 'x-nano-payment': FAKE_HASH }));
  assert.equal(res.status, 400);
  assert.equal(res.headers['payment-required'], undefined);
  assert.match(res.body.note, /before any payment is taken/);
  const res2 = await handle(request('GET', '/v1/fetch?url=', { 'payment-signature': 'not-a-payment' }));
  assert.equal(res2.status, 400);
});

test('POST /v1/work with no body and no payment answers 402 with the challenge and the body rule', async () => {
  const res = await handle(request('POST', '/v1/work', {}));
  assert.equal(res.status, 402);
  assert.ok(res.headers['payment-required'], 'PAYMENT-REQUIRED header present');
  assert.equal(res.body.error, 'payment required');
  assert.match(res.body.body_error, /hash must be 64 hex/);
  assert.match(res.body.note, /JSON body \{"hash": H\}/);
  assert.match(res.body.note, /free/);
  const res2 = await handle(request('POST', '/v1/work', { 'content-type': 'application/json' }, 'not json'));
  assert.equal(res2.status, 402);
  assert.match(res2.body.body_error, /must be JSON/);
});

test('POST /v1/work with a bad body and a payment presented is refused with 400 before any charge', async () => {
  const res = await handle(request('POST', '/v1/work', { 'x-nano-payment': FAKE_HASH, 'content-type': 'application/json' }, '{"hash":"short"}'));
  assert.equal(res.status, 400);
  assert.equal(res.headers['payment-required'], undefined);
  assert.match(res.body.error, /nothing charged/);
  const res2 = await handle(request('POST', '/v1/work', { 'payment-signature': 'not-a-payment' }));
  assert.equal(res2.status, 400);
});

test('/.well-known/x402 and /v1/x402 say what an unpaid bare call gets', async () => {
  const wk = await handle(request('GET', '/.well-known/x402', { accept: 'application/json' }));
  assert.equal(wk.status, 200);
  const fetchRes = wk.body.resources.find(r => r.url.endsWith('/v1/fetch?url='));
  assert.match(fetchRes.description, /unpaid one answers the 402 challenge/);
  const x = await handle(request('GET', '/v1/x402', {}));
  assert.equal(x.status, 200);
  assert.match(x.body.paid_routes.find(r => r.url.endsWith('/v1/fetch?url=')).input, /402 challenge/);
  assert.match(x.body.paid_routes.find(r => r.url.endsWith('/v1/work')).input, /402 challenge/);
});
