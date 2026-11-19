// node --test (run from api/). /v1/work answers what a client written for a node's work_generate needs: beside the
// work, "difficulty" (the value the work reaches over the hash) and "multiplier". The @x402nano/exact 1.0.0 client
// posts {action:"work_generate", hash, block, json_block:true} to its workGenerationUrl and checks the returned work
// against the returned difficulty; with only "threshold" in the answer it failed with "Invalid work threshold"
// (measured against the live route, 2026-11-19). Mocked node; data/ writes dropped (guard-data).
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NANO_RPC = 'http://node.test/rpc';
process.env.WORK_URLS = ''; process.env.PAID_WORK_URLS = '';   // the node is the only work source, and it is the mock below
require('./guard-data');
const N = require('nanocurrency');
const { server } = require('../server');

// A real pair: the node's own work_validate answers difficulty fffffffcbfe0fb40, multiplier 2.461180033769000 for it.
const HASH = '85EF39B2E45021A457FAAF7E7BEC5A0D87236F6CC00ABF640C71A3F5965294D5';
const WORK = '826f1b2e3841dabe';

const realFetch = globalThis.fetch;
const asked = [];
globalThis.fetch = (url, opts, ...a) => {
  if (String(url) !== process.env.NANO_RPC) return realFetch(url, opts, ...a);
  const b = JSON.parse(opts.body); asked.push(b);
  const out = b.action === 'work_generate' ? { work: WORK } : b.action === 'account_info' ? { error: 'Account not found' } : {};
  return Promise.resolve({ ok: true, status: 200, json: async () => out, text: async () => JSON.stringify(out) });
};
after(() => { globalThis.fetch = realFetch; });

const http = require('node:http');
const post = (port, path, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, path, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } },
    res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null })); });
  r.on('error', reject); r.end(data);
});

test('a node-style work_generate request gets work, difficulty and multiplier; the block sent along is not used', async () => {
  assert.ok(N.validateWork({ blockHash: HASH, work: WORK, threshold: 'fffffff800000000' }), 'the fixture work is valid at the send threshold');
  const port = await new Promise(resolve => { const s = server.listen(0, '127.0.0.1', () => resolve(s.address().port)); });
  try {
    const block = { type: 'state', account: 'nano_1testtesttesttesttesttesttesttesttesttesttesttesttesttest', previous: HASH,
      balance: '1', link: '0'.repeat(64), signature: 'A'.repeat(128), work: '0000000000000000' };
    const r = await post(port, '/v1/work', { action: 'work_generate', hash: HASH, block, json_block: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.work, WORK);
    assert.equal(r.body.hash, HASH);
    assert.equal(r.body.threshold, 'fffffff800000000', 'the field older callers read is still there');
    assert.equal(r.body.difficulty, 'fffffffcbfe0fb40', 'the value this work reaches, as the node reports it');
    assert.match(r.body.multiplier, /^2\.4611800337/);
    assert.ok(BigInt('0x' + r.body.difficulty) >= BigInt('0x' + r.body.threshold));
    // What the 1.0.0 client does with the answer: verify the work against the difficulty it was given.
    assert.ok(N.validateWork({ blockHash: HASH, work: r.body.work, threshold: r.body.difficulty }));
    const sent = asked.filter(b => b.action === 'work_generate');
    assert.ok(sent.length >= 1, 'the work source was asked');
    for (const b of sent) assert.equal(JSON.stringify(b).includes('signature'), false, 'the block is not passed on to the work source');
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
