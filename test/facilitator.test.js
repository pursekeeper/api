// node --test  (run from api/). Facilitator request handlers with a mocked node.
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const N = require('nanocurrency');
const f = require('../facilitator');

const PAY_TO = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';
const AMOUNT = 10n ** 27n;
const REQ = { scheme: 'exact', network: 'nano:mainnet', asset: 'XNO', payTo: PAY_TO, amount: AMOUNT.toString(), maxTimeoutSeconds: 5 };
const THRESHOLD = 'ff00000000000000';
const FRONTIER = '4DA37CC62F040730D14E9D57A83D3810C54CBFF1C7A389E477F5A290B28A688F';
const BALANCE = 5n * 10n ** 27n;

let sk, payer, work;
before(async () => {
  const seed = await N.generateSeed();
  sk = N.deriveSecretKey(seed, 0);
  payer = N.deriveAddress(N.derivePublicKey(sk), { useNanoPrefix: true });
  work = await N.computeWork(FRONTIER, { workThreshold: THRESHOLD });
});
function makeBlock(over = {}) {
  const { block } = N.createBlock(sk, { work, previous: FRONTIER, representative: payer, balance: (BALANCE - AMOUNT).toString(), link: PAY_TO, ...over });
  block.account = block.account.replace(/^xrb_/, 'nano_');
  return block;
}
const body = (block, req = REQ) => ({ x402Version: 2, paymentPayload: { x402Version: 2, accepted: req, payload: { block } }, paymentRequirements: req });
const info = (over = {}) => ({ frontier: FRONTIER, balance: BALANCE.toString(), representative: payer, confirmation_height_frontier: FRONTIER, ...over });

// A node that knows one account, has no blocks yet, and confirms whatever it processes.
function node(over = {}) {
  const chain = new Map();
  const rpc = async b => {
    if (b.action === 'account_info') return over.info ? over.info() : info();
    if (b.action === 'block_info') { const x = chain.get(b.hash); return x ? { block_account: payer, confirmed: over.confirm === false ? 'false' : 'true', contents: x } : { error: 'Block not found' }; }
    if (b.action === 'process') { if (over.processError) return { error: over.processError }; const h = N.hashBlock({ account: b.block.account, previous: b.block.previous, representative: b.block.representative, balance: b.block.balance, link: b.block.link }); chain.set(h, b.block); return { hash: h }; }
    throw new Error('unexpected rpc ' + b.action);
  };
  rpc.chain = chain;
  return rpc;
}
const deps = (rpc, over = {}) => ({ rpc, workThreshold: THRESHOLD, sleep: async () => {}, ...over });

test('/supported lists exact on nano:mainnet, v2, work required', () => {
  assert.deepEqual(f.SUPPORTED.kinds.map(k => [k.x402Version, k.scheme, k.network, k.extra.work]), [[2, 'exact', 'nano:mainnet', 'required']]);
});

test('verify: a valid block is valid and names the payer', async () => {
  const r = await f.verifyRequest(body(makeBlock()), deps(node()));
  assert.equal(r.isValid, true, r.detail); assert.equal(r.payer, payer);
});

test('verify: frontier moved -> frontier_moved', async () => {
  const r = await f.verifyRequest(body(makeBlock()), deps(node({ info: () => info({ frontier: 'AA'.repeat(32), confirmation_height_frontier: 'AA'.repeat(32) }) })));
  assert.equal(r.isValid, false); assert.equal(r.invalidReason, 'frontier_moved');
});

test('verify: underpayment -> amount_mismatch', async () => {
  const r = await f.verifyRequest(body(makeBlock({ balance: (BALANCE - AMOUNT + 1n).toString() })), deps(node()));
  assert.equal(r.invalidReason, 'amount_mismatch');
});

test('verify: bad work -> invalid_work', async () => {
  const r = await f.verifyRequest(body(makeBlock({ work: '0000000000000000' })), deps(node()));
  assert.equal(r.invalidReason, 'invalid_work');
});

test('verify: block already on the chain -> block_already_exists (check 9)', async () => {
  const n = node();
  const b = makeBlock();
  await n({ action: 'process', block: b });
  const r = await f.verifyRequest(body(b), deps(n));
  assert.equal(r.invalidReason, 'block_already_exists');
});

test('verify: requirements for another network or scheme are refused before any rpc', async () => {
  const r = await f.verifyRequest(body(makeBlock(), { ...REQ, network: 'base' }), deps(async () => { throw new Error('rpc must not be called'); }));
  assert.equal(r.invalidReason, 'requirements_unsupported');
  const r2 = await f.verifyRequest(body(makeBlock(), { ...REQ, scheme: 'upto' }), deps(async () => { throw new Error('rpc must not be called'); }));
  assert.equal(r2.invalidReason, 'requirements_unsupported');
});

test('verify: payload accepted != requirements -> requirements_mismatch', async () => {
  const b = body(makeBlock());
  b.paymentPayload.accepted = { ...REQ, amount: '1' };
  const r = await f.verifyRequest(b, deps(node()));
  assert.equal(r.invalidReason, 'requirements_mismatch');
});

test('verify: node down -> node_unavailable', async () => {
  const r = await f.verifyRequest(body(makeBlock()), deps(async b => { if (b.action === 'block_info') return { error: 'Block not found' }; throw new Error('ECONNREFUSED'); }));
  assert.equal(r.invalidReason, 'node_unavailable');
});

test('settle: processes, polls, returns the confirmed hash', async () => {
  const n = node();
  const r = await f.settleRequest(body(makeBlock()), deps(n));
  assert.equal(r.success, true, r.detail);
  assert.equal(r.network, 'nano:mainnet'); assert.equal(r.payer, payer);
  assert.ok(n.chain.has(r.transaction));
});

test('settle: process error -> process_failed with the node text', async () => {
  const r = await f.settleRequest(body(makeBlock()), deps(node({ processError: 'Gap previous block' })));
  assert.equal(r.success, false); assert.equal(r.errorReason, 'process_failed'); assert.match(r.detail, /Gap previous/);
});

test('settle: processed but never confirmed -> confirmation_timeout with the hash', async () => {
  const n = node({ confirm: false });
  let t = 0;
  const r = await f.settleRequest(body(makeBlock(), { ...REQ, maxTimeoutSeconds: 1 }), deps(n, { sleep: async ms => { t += ms; } }));
  assert.equal(r.success, false); assert.equal(r.errorReason, 'confirmation_timeout'); assert.ok(n.chain.has(r.transaction));
});

test('settle: a second settle of the same block is refused', async () => {
  const n = node();
  const b = makeBlock();
  const r1 = await f.settleRequest(body(b), deps(n));
  assert.equal(r1.success, true);
  const r2 = await f.settleRequest(body(b), deps(n));
  assert.equal(r2.success, false); assert.equal(r2.errorReason, 'block_already_exists');
});

test('settle: an in-flight hash is refused while settling', async () => {
  const settling = new Set();
  const b = makeBlock();
  const h = N.hashBlock({ account: payer, previous: FRONTIER, representative: payer, balance: b.balance, link: PAY_TO });
  settling.add(h);
  const r = await f.verifyRequest(body(b), deps(node(), { settling }));
  assert.equal(r.invalidReason, 'block_already_exists');
});

// Dalton's docs QA, 2026-09-10: C1 and C2 (research/2026-09-10-dalton-nanogpt-guide-and-facilitator-docs-qa.md)
test('verify: a v1 envelope -> unsupported_x402_version, not invalid_block (C1)', async () => {
  const b = body(makeBlock()); b.paymentPayload.x402Version = 1;
  const r = await f.verifyRequest(b, deps(node()));
  assert.equal(r.isValid, false); assert.equal(r.invalidReason, 'unsupported_x402_version'); assert.equal(r.payer, '');
});

test('verify: accepted.payTo differs from requirements.payTo -> invalid_payto (C2, documented as such)', async () => {
  const other = { ...REQ, payTo: 'nano_3njeurfzgpwpnqjxoytfnqa7ezbgkordga8e8jg74ey77kww5d5emjjyzrhp' };
  const b = body(makeBlock()); b.paymentPayload.accepted = other;
  const r = await f.verifyRequest(b, deps(node()));
  assert.equal(r.isValid, false); assert.equal(r.invalidReason, 'invalid_payto');
});

// Oversized bodies (pyfile-toolkit, 2026-09-11): until then readBody destroyed the socket at the
// limit, so the documented 400 never reached the client (dropped connection, or 502 via the proxy).
test('a body over 32,000 bytes is answered 400 "body too large" with Connection: close, not a dropped socket', async () => {
  const { PassThrough } = require('node:stream');
  const req = new PassThrough(); req.headers = { host: f.HOST }; req.method = 'POST'; req.socket = { remoteAddress: '203.0.113.9' };
  let destroyed = false; req.destroy = () => { destroyed = true; };
  const headers = {}; let out;
  const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; } };
  const send = (_res, status, body) => { out = { status, body }; };
  const p = f.handle(req, res, { pathname: '/verify' }, send, deps(node()));
  req.write(Buffer.from('{"paymentPayload":"' + 'x'.repeat(40_000) + '"}')); req.end();
  assert.equal(await p, true);
  assert.equal(out.status, 400);
  assert.match(out.body.error, /body too large: over 32,000 bytes/);
  assert.equal(headers.connection, 'close');
  assert.equal(destroyed, false, 'the socket must stay open until the answer is written');
});
test('a body under the limit is parsed as before', async () => {
  const { PassThrough } = require('node:stream');
  const req = new PassThrough(); req.headers = { host: f.HOST }; req.method = 'POST'; req.socket = { remoteAddress: '203.0.113.10' };
  let out; const send = (_res, status, body) => { out = { status, body }; };
  const p = f.handle(req, { setHeader() {} }, { pathname: '/verify' }, send, deps(node()));
  req.write(Buffer.from(JSON.stringify({ paymentPayload: 'x'.repeat(30_000), paymentRequirements: {} }))); req.end();
  await p;
  assert.equal(out.status, 200);
  assert.equal(out.body.invalidReason, 'requirements_unsupported');
});

test('rollup: totals, one row per payTo, per-payer counts, verify-only payTos included', () => {
  const A = 'nano_1zqdw3qf1z8k3jx8jintaiwpo3yz7zqh1me4ph5j439ts8hsppx8dzy4xcsz', B = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';
  const P1 = 'nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf', P2 = 'nano_3uojbn47b5xqcbs4yibbasamn8aeyqxgyi1z8peogwtdn6z3kagjanjpz4ss';
  const s = { since: 't0', verify: 5, verify_ok: 3, settle: 4, settle_ok: 3, ips: { a: 1, b: 2 },
    settled: [{ hash: 'H1', payer: P1, pay_to: A, amount_raw: '1000', at: '2026-09-11T00:00:00Z' }, { hash: 'H2', payer: P2, pay_to: A, amount_raw: '2000', at: '2026-09-12T00:00:00Z' }, { hash: 'H3', payer: P1, pay_to: B, amount_raw: '5', at: '2026-09-13T00:00:00Z' }],
    pay_to: { [A]: { verify: 2, verify_ok: 2, settle: 1, settle_ok: 1, first: 'x', last: 'y' }, nano_3untmgdrmee8dbghrk88pdij8kpuiqpfyben6gwgzerjwc44fbj4g847qhe4: { verify: 1, verify_ok: 0, settle: 0, settle_ok: 0, first: 'v', last: 'v' } }, pay_to_since: 'ts' };
  const r = f.rollup(s);
  assert.equal(r.settled_count, 3); assert.equal(r.settled_amount_raw, '3005');
  assert.equal(r.distinct_pay_to, 3); assert.equal(r.distinct_pay_to_settled, 2); assert.equal(r.distinct_payers, 2); assert.equal(r.distinct_ips, 2);
  assert.deepEqual(r.sellers.map(x => [x.pay_to, x.settled, x.amount_raw, x.payers, x.verify]), [[A, 2, '3000', 2, 2], [B, 1, '5', 1, 0], ['nano_3untmgdrmee8dbghrk88pdij8kpuiqpfyben6gwgzerjwc44fbj4g847qhe4', 0, '0', 0, 1]]);
  assert.deepEqual(r.payers, [{ payer: P1, settled: 2, amount_raw: '1005' }, { payer: P2, settled: 1, amount_raw: '2000' }]);
  assert.equal(r.pay_to_counters_since, 'ts');
  assert.ok(!('ips' in r), 'hashed ips never leave');
});
