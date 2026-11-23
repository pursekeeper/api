// node --test (run from api/). Every refusal of /v1/process carries a machine-readable "code" beside its sentence
// (since 2026-11-23, after pibrain's re-probe: a schema failure, a work failure and a signature failure were all a 400
// told apart only by the wording). The node sentences below are the ones this server's own node gave that day for
// blocks that cannot be accepted (runs: bad work; good work with a garbage signature; a wrong subtype; an old block; a
// malformed account). A node sentence this list does not know answers node_refused. Mocked node; data/ writes dropped.
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NANO_RPC = 'http://node.test/rpc';
require('./guard-data');
const { server } = require('../server');

const BLOCK = { type: 'state', account: 'nano_1testtesttesttesttesttesttesttesttesttesttesttesttesttest', previous: 'AB'.repeat(32),
  representative: 'nano_1testtesttesttesttesttesttesttesttesttesttesttesttesttest', balance: '1', link: '0'.repeat(64),
  signature: 'A'.repeat(128), work: '0000000000000000' };

const realFetch = globalThis.fetch;
let nodeSays = null, asked = 0;
globalThis.fetch = (url, opts, ...a) => {
  if (String(url) !== process.env.NANO_RPC) return realFetch(url, opts, ...a);
  const b = JSON.parse(opts.body);
  let out = {};
  if (b.action === 'process') { asked++; out = { error: nodeSays }; }
  return Promise.resolve({ ok: true, status: 200, json: async () => out, text: async () => JSON.stringify(out) });
};
after(() => { globalThis.fetch = realFetch; });

const http = require('node:http');
const post = (port, path, data) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } },
    res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null })); });
  r.on('error', reject); r.end(data);
});

test('every refusal of /v1/process has a code; the node sentence is kept word for word', async () => {
  const port = await new Promise(resolve => { const s = server.listen(0, '127.0.0.1', () => resolve(s.address().port)); });
  try {
    // Refused before the node is asked.
    const { signature, work, ...unsigned } = BLOCK;
    const legacy = { type: 'send', previous: 'AB'.repeat(32), destination: BLOCK.account, balance: '0000000000000000000000000000000A', signature: 'A'.repeat(128), work: '0000000000000000' };
    const early = [
      ['{not json', 'body_not_json'],
      [JSON.stringify({ block: 'not json' }), 'block_not_json_text'],
      [JSON.stringify({ block: legacy }), 'block_type_not_state'],
      [JSON.stringify({ block: unsigned }), 'block_fields_missing'],
      [JSON.stringify({ block: { ...BLOCK, type: 7 } }), 'block_type_not_state'],
    ];
    for (const [data, code] of early) {
      asked = 0;
      const r = await post(port, '/v1/process', data);
      assert.equal(r.status, 400, data.slice(0, 60));
      assert.equal(r.body.code, code, data.slice(0, 60) + ': ' + JSON.stringify(r.body));
      assert.equal(typeof r.body.error, 'string');
      assert.equal(asked, 0, 'the node is not asked: ' + code);
    }
    const lr = await post(port, '/v1/process', JSON.stringify({ block: legacy }));
    assert.equal(lr.body.block_type, 'send');
    const mr = await post(port, '/v1/process', JSON.stringify({ block: unsigned }));
    assert.deepEqual(mr.body.missing, ['signature', 'work']);

    // Refused by the node: its sentence, as read from the live node on 2026-11-23, and the class.
    const node = [
      ['Block work is less than threshold', 'node_work_low'],
      ['Bad signature', 'node_bad_signature'],
      ['Old block', 'node_old_block'],
      ['Fork', 'node_fork'],
      ['Gap previous block', 'node_gap_previous'],
      ['Gap source block', 'node_gap_source'],
      ['Invalid block balance for given subtype', 'node_subtype_mismatch'],
      ['Invalid previous block for given subtype', 'node_subtype_mismatch'],
      ['Balance and amount delta do not match', 'node_balance_mismatch'],
      ['Unreceivable', 'node_unreceivable'],
      ['Negative spend', 'node_negative_spend'],
      ['This block cannot follow the previous block', 'node_block_position'],
      ['Block is invalid', 'node_block_invalid'],
      ['Some sentence a later node version invents', 'node_refused'],
      ['Unable to reach the network', 'node_refused'],
    ];
    for (const [sentence, code] of node) {
      nodeSays = sentence; asked = 0;
      const r = await post(port, '/v1/process', JSON.stringify({ block: BLOCK, subtype: 'send' }));
      assert.equal(r.status, 400, sentence);
      assert.equal(asked, 1, sentence);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.code, code, sentence + ': ' + JSON.stringify(r.body));
      assert.equal(r.body.node_error, sentence);
      assert.equal(r.body.error, 'node: ' + sentence, 'the sentence clients already read is unchanged');
      assert.match(r.body.hint, /common causes/);
    }
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
