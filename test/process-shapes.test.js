// node --test (run from api/). /v1/process takes a body written for a node's own RPC as it is. Five shapes reach the
// node with the same block and json_block:"true": {block:{...},subtype}; the node's request with "action" and
// "json_block"; the same without "json_block"; the bare block as the body; and "block" as the JSON text of the block,
// which is the node RPC's default form. Until 2026-11-22 the text form was answered "block is missing type, account,
// previous, ..." and never reached the node (measured against the live route with an old block of my own that day).
// A string that is not the JSON text of a block is refused with a sentence that says so. Mocked node; data/ writes
// dropped (guard-data).
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NANO_RPC = 'http://node.test/rpc';
require('./guard-data');
const { server } = require('../server');

const HASH = 'C0FFEE'.padEnd(64, '0');
const BLOCK = { type: 'state', account: 'nano_1testtesttesttesttesttesttesttesttesttesttesttesttesttest', previous: 'AB'.repeat(32),
  representative: 'nano_1testtesttesttesttesttesttesttesttesttesttesttesttesttest', balance: '1', link: '0'.repeat(64),
  signature: 'A'.repeat(128), work: '0000000000000000' };

const realFetch = globalThis.fetch;
const asked = [];
globalThis.fetch = (url, opts, ...a) => {
  if (String(url) !== process.env.NANO_RPC) return realFetch(url, opts, ...a);
  const b = JSON.parse(opts.body); asked.push(b);
  const out = b.action === 'process' ? { hash: HASH } : {};
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

test('five request shapes reach the node with the same block; a string that is no block is refused in words', async () => {
  const port = await new Promise(resolve => { const s = server.listen(0, '127.0.0.1', () => resolve(s.address().port)); });
  try {
    const shapes = {
      'block object with subtype': { block: BLOCK, subtype: 'send' },
      'node request with action and json_block': { action: 'process', json_block: 'true', subtype: 'send', block: BLOCK },
      'node request without json_block': { action: 'process', subtype: 'send', block: BLOCK },
      'bare block as the body': BLOCK,
      'block as JSON text (node RPC default form)': { action: 'process', subtype: 'send', block: JSON.stringify(BLOCK) },
    };
    for (const [name, body] of Object.entries(shapes)) {
      asked.length = 0;
      const r = await post(port, '/v1/process', body);
      assert.equal(r.status, 200, name + ': ' + JSON.stringify(r.body));
      assert.equal(r.body.ok, true, name);
      assert.equal(r.body.hash, HASH, name);
      const sent = asked.filter(b => b.action === 'process');
      assert.equal(sent.length, 1, name + ': the node was asked once');
      assert.equal(sent[0].json_block, 'true', name + ': the node is told the block is an object');
      assert.deepEqual(sent[0].block, BLOCK, name + ': the node got the block as an object, field for field');
      if (name !== 'bare block as the body') assert.equal(sent[0].subtype, 'send', name + ': subtype passed on');
    }

    for (const bad of ['not json', '"a string"', '[1,2]', 'null', '']) {
      asked.length = 0;
      const r = await post(port, '/v1/process', { block: bad, subtype: 'send' });
      assert.equal(r.status, 400, JSON.stringify(bad) + ': ' + JSON.stringify(r.body));
      assert.equal(asked.filter(b => b.action === 'process').length, 0, 'nothing is sent to the node');
      if (bad !== '') assert.match(r.body.error, /JSON text of a state block/, JSON.stringify(bad));
    }

    // The text of a block that lacks fields is named as before, field by field.
    asked.length = 0;
    const { signature, work, ...unsigned } = BLOCK;
    const r = await post(port, '/v1/process', { block: JSON.stringify(unsigned) });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /missing signature, work/);
    assert.equal(asked.filter(b => b.action === 'process').length, 0);

    // A legacy block is refused by its type, not as a state block with a field missing (pibrain, 2026-11-22).
    asked.length = 0;
    const legacy = { type: 'send', previous: 'AB'.repeat(32), destination: BLOCK.account, balance: '0000000000000000000000000000000A', signature: 'A'.repeat(128), work: '0000000000000000' };
    for (const body of [{ block: legacy }, { action: 'process', block: JSON.stringify(legacy) }, legacy]) {
      const lr = await post(port, '/v1/process', body);
      assert.equal(lr.status, 400);
      assert.match(lr.body.error, /^only state blocks: this block has type "send"/);
      assert.doesNotMatch(lr.body.error, /missing/);
    }
    assert.equal(asked.filter(b => b.action === 'process').length, 0, 'a legacy block is not sent to the node');
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
