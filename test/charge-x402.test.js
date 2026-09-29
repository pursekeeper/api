// node --test  (run from api/). chargeX402 with a mocked node and no data writes. Two concurrent requests carrying the
// same PAYMENT-SIGNATURE for a block that is already the payer's frontier (a resend after a lost settle reply) must
// yield one served call and one "already used" refusal: before the per-hash lock both passed verify's seen() check
// (the alreadyLanded branch never entered `settling`, the normal branch only after verify returned), and the second
// one's "Old block" rejection became a settled success through the landed() fallback (Ops Control HQ, 2026-09-28
// 22:34 UTC; llmrt, 2026-09-29 00:17 UTC). There is no server-level harness in test/: the handler is exported and
// driven with fake req/res objects, global fetch is a node that knows one account, and every write under data/ is
// dropped so the live credits, x402 log, payers and checks files are untouched.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('nanocurrency');
const { encodePaymentSignatureHeader, decodePaymentResponseHeader } = require('@x402/core/http');

process.env.NANO_RPC = 'http://node.test/rpc';
const DATA_DIR = path.join(__dirname, '..', 'data') + path.sep;
const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync;
fs.writeFileSync = (p, ...a) => { if (String(p).startsWith(DATA_DIR)) return; return realWrite(p, ...a); };
fs.appendFileSync = (p, ...a) => { if (String(p).startsWith(DATA_DIR)) return; return realAppend(p, ...a); };
const { chargeX402 } = require('../server');
const x402 = require('../x402');

const PAY_TO = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';   // ADDRESS in server.js
const AMOUNT = 10n ** 27n;                                                              // PRICE_RAW in server.js
const REQ = x402.requirements({ payTo: PAY_TO, amountRaw: AMOUNT, maxTimeoutSeconds: 60, workOptional: true });
const FRONTIER = '4DA37CC62F040730D14E9D57A83D3810C54CBFF1C7A389E477F5A290B28A688F';
const BALANCE = 5n * 10n ** 27n;

let payer, block, hash, header;
const calls = [];
before(async () => {
  const sk = N.deriveSecretKey(await N.generateSeed(), 0);
  payer = N.deriveAddress(N.derivePublicKey(sk), { useNanoPrefix: true });
  block = N.createBlock(sk, { work: '0', previous: FRONTIER, representative: payer, balance: (BALANCE - AMOUNT).toString(), link: PAY_TO }).block;
  block.account = block.account.replace(/^xrb_/, 'nano_');
  hash = x402.blockHash(block);
  header = encodePaymentSignatureHeader({ x402Version: 2, accepted: REQ, payload: { block } });
  // The node: the block is already the payer's confirmed frontier, so verify takes the alreadyLanded branch and process
  // must never be called; anything else the handler asks for is an error.
  globalThis.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body); calls.push(b.action);
    let answer;
    if (b.action === 'account_info') answer = { frontier: hash, confirmed_frontier: hash, balance: (BALANCE - AMOUNT).toString(), representative: payer, block_count: '2' };
    else if (b.action === 'block_info') answer = b.hash === hash ? { block_account: payer, subtype: 'send', amount: AMOUNT.toString(), confirmed: 'true', contents: block } : { error: 'Block not found' };
    else answer = { error: 'unexpected rpc ' + b.action };
    return { ok: true, json: async () => answer };
  };
});
after(() => { fs.writeFileSync = realWrite; fs.appendFileSync = realAppend; });

const request = () => ({ url: '/v1/echo?msg=hi', headers: { host: 'pursekeeper.dev', 'payment-signature': header }, socket: { remoteAddress: '127.0.0.1' } });
const response = () => ({ headers: {}, status: null, body: null,
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader(k) { return this.headers[String(k).toLowerCase()]; },
  writeHead(s) { this.status = s; }, end(out) { this.body = out ? JSON.parse(String(out)) : null; } });

test('two concurrent charges with the same landed payment: one served, one refused as already used, nothing broadcast', async () => {
  const r1 = response(), r2 = response();
  const [ok1, ok2] = await Promise.all([chargeX402(request(), r1, header), chargeX402(request(), r2, header)]);
  assert.deepEqual([ok1, ok2].filter(Boolean).length, 1, JSON.stringify([ok1, ok2, r1.body, r2.body]));
  const served = ok1 ? r1 : r2, refused = ok1 ? r2 : r1;
  assert.equal(served.getHeader('x-nano-payment-hash'), hash);
  assert.equal(decodePaymentResponseHeader(served.getHeader(x402.RESPONSE_HEADER)).transaction, hash);
  assert.equal(refused.status, 402);
  assert.match(refused.body.error, /already used/);
  assert.equal(calls.includes('process'), false, 'a block that already landed is never broadcast again');
  // A later presentation of the same block is refused the same way.
  const r3 = response();
  assert.equal(await chargeX402(request(), r3, header), false);
  assert.equal(r3.status, 402); assert.match(r3.body.error, /already used/);
});

test('a block that does not hash runs unlocked and is refused by verify with its reason', async () => {
  const r = response();
  const bad = encodePaymentSignatureHeader({ x402Version: 2, accepted: REQ, payload: { block: { type: 'state' } } });
  assert.equal(await chargeX402(request(), r, bad), false);
  assert.equal(r.status, 402); assert.match(r.body.error, /x402: /);
});
