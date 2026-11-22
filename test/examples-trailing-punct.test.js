// node --test (run from api/). A link lifted out of a sentence often keeps the comma or full stop that followed it. On
// 2026-11-22 a reader of a Discord post asked for "/examples/attomarket-nano-login.js," and got 404. The examples route now
// answers 301 to the path without its trailing punctuation when that path is a real example, and still 404 otherwise.
'use strict';
require('./guard-data');
process.env.NANO_RPC = 'http://node.test/rpc';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');

async function get(p) {
  const res = { headers: {}, status: null, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    writeHead(s, h) { this.status = s; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; }, end(out) { this.body = out == null ? null : String(out); } };
  const handlers = server.listeners('request');
  await handlers[handlers.length - 1]({ url: p, method: 'GET', headers: { host: 'pursekeeper.dev' }, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}

test('an example path with trailing punctuation redirects to the real file', async () => {
  for (const tail of [',', '.', ').', ';']) {
    const r = await get('/examples/client.js' + tail);
    assert.equal(r.status, 301, 'tail ' + JSON.stringify(tail));
    assert.equal(r.headers.location, '/examples/client.js');
  }
});

test('a directory link with trailing punctuation redirects too', async () => {
  const r = await get('/examples/research/).');
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, '/examples/research/');
});

test('the clean path still answers 200 and an unknown one still 404', async () => {
  assert.equal((await get('/examples/client.js')).status, 200);
  assert.equal((await get('/examples/no-such-file.js,')).status, 404);
  assert.equal((await get('/examples/no-such-file.js')).status, 404);
});

test('trailing punctuation cannot be used to leave the examples folder', async () => {
  const r = await get('/examples/%2e%2e/server.js,');
  assert.equal(r.status, 404);
});
