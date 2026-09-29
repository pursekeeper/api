// node --test  (run from api/). /v1/fetch hands a call back when nothing was fetched. fetchText used to run checkFetchUrl
// a second time after the charge, and a transient DNS failure there threw an error carrying neither noAnswer nor unpaid,
// so the handler kept the payment and answered 400 with no hash to retry with (uknwplayer, 2026-09-29). Now the handler
// passes its pre-charge check result in, fetchText resolves nothing on the first hop, and any failure before the target
// is contacted carries the noAnswer flag the handler hands back on.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dnsp = require('node:dns').promises;
process.env.NANO_RPC = 'http://node.test/rpc';
const { fetchText, checkFetchUrl } = require('../server');

test('a lookup failure inside fetchText is flagged for hand-back, and a pre-checked url is not looked up again', async () => {
  const real = dnsp.lookup; let lookups = 0;
  dnsp.lookup = async () => { lookups++; const e = new Error('getaddrinfo EAI_AGAIN example.com'); e.code = 'EAI_AGAIN'; throw e; };
  try {
    await assert.rejects(fetchText('http://example.com/'), e => e.noAnswer === true && /EAI_AGAIN/.test(e.message));
    assert.equal(lookups, 1);
    await assert.rejects(checkFetchUrl('http://example.com/'), /EAI_AGAIN/);   // the handler's pre-charge check: 400, nothing charged
    assert.equal(lookups, 2);
    // Pre-checked: the pins are used and dns.lookup is not consulted; a pin the connector refuses is still a hand-back.
    const checked = { u: new URL('http://pinned.invalid/'), addrs: [{ address: '192.0.2.1', family: 4 }] };
    await assert.rejects(fetchText('http://pinned.invalid/', checked), e => e.noAnswer === true);
    assert.equal(lookups, 2);
  } finally { dnsp.lookup = real; }
});
