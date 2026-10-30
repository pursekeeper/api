// node --test  (run from api/). charge() with a mocked node and no data writes. A request carrying both PAYMENT-SIGNATURE
// and X-Nano-Payment for the same block must take the x402 path: until 2026-10-30 the bearer header won, the payload was
// never opened and the block never broadcast, so a client that set both (dextermos-dev's LangChain client, api#132 R2,
// 2026-10-29) looped on "block not found on this node yet". A bearer hash naming a different block keeps the bearer path,
// and a payload that does not decode beside a bearer hash is ignored rather than fatal. Same harness as
// charge-x402.test.js: fake req/res, global fetch is a node that knows one account, every write under data/ is dropped.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('nanocurrency');
const { encodePaymentSignatureHeader, decodePaymentResponseHeader } = require('@x402/core/http');

process.env.NANO_RPC = 'http://node.test/rpc';
const DATA_DIR = path.join(__dirname, '..', 'data') + path.sep;
const inData = (p) => String(p).startsWith(DATA_DIR);
const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync;
const realOpen = fs.openSync, realRename = fs.renameSync, realCopy = fs.copyFileSync, realUnlink = fs.unlinkSync;
const SCRATCH = path.join(require('node:os').tmpdir(), 'both-headers-scratch-' + process.pid);
fs.writeFileSync = (p, ...a) => { if (inData(p)) return; return realWrite(p, ...a); };
fs.appendFileSync = (p, ...a) => { if (inData(p)) return; return realAppend(p, ...a); };
fs.openSync = (p, ...a) => (inData(p) ? realOpen(SCRATCH, 'w') : realOpen(p, ...a));
fs.renameSync = (p, ...a) => { if (inData(p)) return; return realRename(p, ...a); };
fs.copyFileSync = (p, ...a) => { if (inData(p)) return; return realCopy(p, ...a); };
fs.unlinkSync = (p) => { if (inData(p)) return; return realUnlink(p); };
const { charge } = require('../server');
const x402 = require('../x402');

const PAY_TO = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';   // ADDRESS in server.js
const AMOUNT = 10n ** 27n;                                                              // PRICE_RAW in server.js
const REQ = x402.requirements({ payTo: PAY_TO, amountRaw: AMOUNT, maxTimeoutSeconds: 60, workOptional: true });
const FRONTIER = '4DA37CC62F040730D14E9D57A83D3810C54CBFF1C7A389E477F5A290B28A688F';
const OTHER = 'A'.repeat(64);                                                            // a hash the node has never seen
const BALANCE = 5n * 10n ** 27n;

let payer, block, hash, header;
const calls = [];
before(async () => {
  const sk = N.deriveSecretKey(await N.generateSeed(), 0);
  payer = N.deriveAddress(N.derivePublicKey(sk), { useNanoPrefix: true });
  block = N.createBlock(sk, { work: '0', previous: FRONTIER, representative: payer, balance: (BALANCE - AMOUNT).toString(), link: PAY_TO }).block;
  block.account = block.account.replace(/^xrb_/, 'nano_');
  hash = x402.blockHash(block);
  header = encodePaymentSignatureHeader({ x402Version: 2, accepted: { ...REQ, extra: { ...REQ.extra, session: 'c'.repeat(32) } }, payload: { block } });
  // The node: the block is already the payer's confirmed frontier (verify's alreadyLanded branch, no process call); any
  // other hash is unknown.
  globalThis.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body); calls.push(b.action);
    let answer;
    if (b.action === 'account_info') answer = { frontier: hash, confirmed_frontier: hash, balance: (BALANCE - AMOUNT).toString(), representative: payer, block_count: '2' };
    else if (b.action === 'block_info') answer = b.hash === hash ? { block_account: payer, subtype: 'send', amount: AMOUNT.toString(), confirmed: 'true', contents: block } : { error: 'Block not found' };
    else answer = { error: 'unexpected rpc ' + b.action };
    return { ok: true, json: async () => answer };
  };
});
after(() => {
  fs.writeFileSync = realWrite; fs.appendFileSync = realAppend;
  fs.openSync = realOpen; fs.renameSync = realRename; fs.copyFileSync = realCopy; fs.unlinkSync = realUnlink;
  try { realUnlink(SCRATCH); } catch {}
});

const request = (headers) => ({ method: 'GET', url: '/v1/echo?msg=both', headers: { host: 'pursekeeper.dev', ...headers }, socket: { remoteAddress: '127.0.0.1' } });
const response = () => ({ headers: {}, status: null, body: null,
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader(k) { return this.headers[String(k).toLowerCase()]; },
  writeHead(s) { this.status = s; }, end(out) { this.body = out ? JSON.parse(String(out)) : null; } });

test('bearer hash naming another block beside a payload: the bearer path runs and the payload is not spent', async () => {
  const res = response();
  const ok = await charge(request({ 'payment-signature': header, 'x-nano-payment': OTHER }), res);
  assert.equal(ok, false, JSON.stringify(res.body));
  assert.equal(res.status, 402);
  assert.equal(res.getHeader(x402.RESPONSE_HEADER), undefined, 'a bearer refusal must carry no PAYMENT-RESPONSE');
  assert.ok(!calls.includes('process'), 'nothing broadcast: ' + calls.join(','));
});

test('a payload that does not decode beside a bearer hash is ignored, not fatal', async () => {
  const res = response();
  const ok = await charge(request({ 'payment-signature': 'not-base64-json!!', 'x-nano-payment': OTHER }), res);
  assert.equal(ok, false, JSON.stringify(res.body));
  assert.equal(res.status, 402);
  assert.ok(!calls.includes('process'), 'nothing broadcast: ' + calls.join(','));
});

test('both headers for the same block: the x402 path serves it (hash echoed, PAYMENT-RESPONSE set)', async () => {
  const res = response();
  const ok = await charge(request({ 'payment-signature': header, 'x-nano-payment': hash.toLowerCase() }), res);
  assert.equal(ok, true, JSON.stringify(res.body));
  assert.equal(res.getHeader('x-nano-payment-hash'), hash);
  assert.equal(decodePaymentResponseHeader(res.getHeader(x402.RESPONSE_HEADER)).transaction, hash);
  assert.ok(!calls.includes('process'), 'landed block, nothing to broadcast: ' + calls.join(','));
});
