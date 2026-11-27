// node --test (run from api/). Which subtype /v1/process tells the node, and what it says about it.
// Until 2026-11-27 only a "subtype" beside the block holding one of the five names was passed on; one inside the block
// object, or any other value, was dropped without a word (PiBrain, Subnano comment a438472f: calls that named send and
// receive were answered "work first", and "foo" was taken without complaint; its nine calls are in the request log with
// subtype null). Now a subtype inside the block is passed on, an unknown value and two that differ are refused before
// the node is asked, and every answer from the node step carries subtype_used and subtype_from.
// Mocked node; data/ writes dropped (guard-data).
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
let nodeError = null;
globalThis.fetch = (url, opts, ...a) => {
  if (String(url) !== process.env.NANO_RPC) return realFetch(url, opts, ...a);
  const b = JSON.parse(opts.body); asked.push(b);
  const out = b.action === 'process' ? (nodeError ? { error: nodeError } : { hash: HASH }) : {};
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
const sentToNode = () => asked.filter(b => b.action === 'process');

test('the subtype the node is told: beside the block, inside it, or none; and the answer says which', async () => {
  const port = await new Promise(resolve => { const s = server.listen(0, '127.0.0.1', () => resolve(s.address().port)); });
  try {
    // [name, body, the subtype the node must be told (undefined = none), subtype_from in the answer]
    const passed = [
      ['beside the block', { block: BLOCK, subtype: 'send' }, 'send', 'body'],
      ['inside the block', { block: { ...BLOCK, subtype: 'receive' } }, 'receive', 'block'],
      ['inside the JSON text of the block', { block: JSON.stringify({ ...BLOCK, subtype: 'open' }) }, 'open', 'block'],
      ['both places, the same name', { block: { ...BLOCK, subtype: 'change' }, subtype: 'change' }, 'change', 'body'],
      ['flat body with a subtype', { ...BLOCK, subtype: 'send' }, 'send', 'body'],
      ['node request shape', { action: 'process', json_block: 'true', subtype: 'epoch', block: BLOCK }, 'epoch', 'body'],
      ['no subtype', { block: BLOCK }, undefined, null],
      ['flat body, no subtype', BLOCK, undefined, null],
      ['empty string beside the block', { block: BLOCK, subtype: '' }, undefined, null],
      ['null beside the block', { block: BLOCK, subtype: null }, undefined, null],
      ['null beside, a name inside', { block: { ...BLOCK, subtype: 'send' }, subtype: null }, 'send', 'block'],
      ['empty string inside the block', { block: { ...BLOCK, subtype: '' } }, undefined, null],
    ];
    for (const refusedByNode of [false, true]) {
      nodeError = refusedByNode ? 'Block work is less than threshold' : null;
      for (const [name, body, want, from] of passed) {
        asked.length = 0;
        const r = await post(port, '/v1/process', body);
        const tag = name + (refusedByNode ? ' (node refuses)' : ' (node accepts)') + ': ' + JSON.stringify(r.body);
        assert.equal(r.status, refusedByNode ? 400 : 200, tag);
        assert.equal(sentToNode().length, 1, tag);
        assert.equal(sentToNode()[0].subtype, want, tag);
        assert.equal('subtype' in sentToNode()[0], want !== undefined, 'no subtype key at all when none is named: ' + tag);
        assert.equal(r.body.subtype_used, want === undefined ? null : want, tag);
        assert.equal(r.body.subtype_from, from, tag);
        if (refusedByNode) { assert.equal(r.body.code, 'node_work_low', tag); assert.equal(r.body.error, 'node: Block work is less than threshold', tag); }
        else { assert.equal(r.body.hash, HASH, tag); assert.equal(r.body.subtype, want, 'the field clients already read is unchanged: ' + tag); }
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});

test('an unknown subtype and two that differ are refused before the node is asked', async () => {
  const port = await new Promise(resolve => { const s = server.listen(0, '127.0.0.1', () => resolve(s.address().port)); });
  try {
    nodeError = null;
    const refused = [
      ['unknown beside the block', { block: BLOCK, subtype: 'foo' }, 'subtype_unknown', 'foo'],
      ['capital letter', { block: BLOCK, subtype: 'Send' }, 'subtype_unknown', 'Send'],
      ['upper case', { block: BLOCK, subtype: 'SEND' }, 'subtype_unknown', 'SEND'],
      ['the block type in place of a subtype', { block: BLOCK, subtype: 'state' }, 'subtype_unknown', 'state'],
      ['a number', { block: BLOCK, subtype: 7 }, 'subtype_unknown', 'number'],
      ['zero', { block: BLOCK, subtype: 0 }, 'subtype_unknown', 'number'],
      ['an object', { block: BLOCK, subtype: { a: 1 } }, 'subtype_unknown', 'object'],
      ['a list', { block: BLOCK, subtype: ['send'] }, 'subtype_unknown', 'object'],
      ['a long string is cut', { block: BLOCK, subtype: 'x'.repeat(500) }, 'subtype_unknown', 'x'.repeat(16)],
      ['unknown inside the block', { block: { ...BLOCK, subtype: 'foo' } }, 'subtype_unknown', 'foo'],
      ['unknown inside the JSON text', { block: JSON.stringify({ ...BLOCK, subtype: 'foo' }) }, 'subtype_unknown', 'foo'],
      ['unknown in a flat body', { ...BLOCK, subtype: 'foo' }, 'subtype_unknown', 'foo'],
      ['two that differ', { block: { ...BLOCK, subtype: 'receive' }, subtype: 'send' }, 'subtype_conflict', 'send'],
      ['a known name beside, an unknown one inside', { block: { ...BLOCK, subtype: 'foo' }, subtype: 'send' }, 'subtype_conflict', 'send'],
    ];
    for (const [name, body, code, given] of refused) {
      asked.length = 0;
      const r = await post(port, '/v1/process', body);
      const tag = name + ': ' + JSON.stringify(r.body);
      assert.equal(r.status, 400, tag);
      assert.equal(r.body.code, code, tag);
      assert.equal(r.body.subtype_given, given, tag);
      assert.deepEqual(r.body.subtypes, ['send', 'receive', 'open', 'change', 'epoch'], tag);
      assert.match(r.body.error, /nothing was sent to the node/, tag);
      assert.equal(sentToNode().length, 0, 'the node is not asked: ' + tag);
      assert.ok(JSON.stringify(r.body).length < 700, 'the refusal stays short: ' + tag);
    }
    const c = await post(port, '/v1/process', { block: { ...BLOCK, subtype: 'receive' }, subtype: 'send' });
    assert.equal(c.body.subtype_in_block, 'receive');
    const u = await post(port, '/v1/process', { block: { ...BLOCK, subtype: 'foo' } });
    assert.equal(u.body.subtype_from, 'block');

    // The earlier refusals still come first: a block with fields missing is named as that, whatever its subtype.
    asked.length = 0;
    const { signature, work, ...unsigned } = BLOCK;
    const m = await post(port, '/v1/process', { block: unsigned, subtype: 'foo' });
    assert.equal(m.body.code, 'block_fields_missing');
    assert.equal(sentToNode().length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
