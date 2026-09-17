// node --test  (run from api/). The counterparty threshold: dust senders are listed
// in inflow but not counted as counterparties until they have sent COUNTERPARTY_MIN
// in total; addresses we paid count regardless.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { counterpartyNumbers, reclassifyCold, redact, passthroughSources, COLD, nanoToRaw, COUNTERPARTY_MIN_RAW, COUNTERPARTY_MIN_NANO, ADDRESS } = require('../site');

const A = 'nano_1oatxz8ha1j55m4wzkkgmpoyyn4gr9bgu9snnfyqc6toawb5ht5e8w4x6s9o';
const B = 'nano_3gmd94aey5nxrntgjrznnbssh3s7htyubeq91x8qgjpbe8qk59xiarf1homu';
const C = 'nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf';
const D = 'nano_1coldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcd11';
const row = (kind, counterparty, nano) => ({ kind, counterparty, amount_raw: nanoToRaw(nano).toString() });

test('nanoToRaw is exact', () => {
  assert.equal(nanoToRaw('0.01'), 10n ** 28n);
  assert.equal(nanoToRaw('1'), 10n ** 30n);
  assert.equal(nanoToRaw('0.000000000000000000000000000001'), 1n);
  assert.throws(() => nanoToRaw('1e3'));
  assert.equal(COUNTERPARTY_MIN_RAW, nanoToRaw(COUNTERPARTY_MIN_NANO));
});

test('dust below the threshold is inflow but not a counterparty', () => {
  const n = counterpartyNumbers([row('payment_in', A, '0.001'), row('payment_in', A, '0.002')], new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.nano, nanoToRaw('0.003'));            // every raw counts
  assert.equal(n.external.counterparties, 0);
  assert.equal(n.external.below_threshold, 1);
  assert.deepEqual([n.counterparties.in, n.counterparties.out, n.counterparties.both, n.counterparties.in_below_threshold], [0, 0, 0, 1]);
});

test('an address counts once its total reaches the threshold, across several payments', () => {
  const n = counterpartyNumbers([row('payment_in', A, '0.004'), row('payment_in', A, '0.006'), row('payment_in', B, '0.5')], new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 2);
  assert.equal(n.external.below_threshold, 0);
  assert.equal(n.counterparties.both, 2);
});

test('addresses we paid count regardless of what they sent back, and are never external', () => {
  const n = counterpartyNumbers([row('payment_out', A, '0.2'), row('payment_in', A, '0.0003'), row('payment_in', B, '0.02')], new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 1);
  assert.equal(n.external.nano, nanoToRaw('0.02'));
  assert.deepEqual([n.counterparties.out, n.counterparties.in, n.counterparties.both, n.counterparties.in_below_threshold], [1, 1, 2, 0]);
});

test('our own addresses are excluded entirely', () => {
  const n = counterpartyNumbers([row('payment_out', C, '0.01'), row('payment_in', D, '1')], new Set([C, D]), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 0);
  assert.equal(n.external.nano, 0n);
  assert.equal(n.counterparties.both, 0);
});

test('a receipt from the cold-storage sender is a tranche, not inflow, and its address is scrubbed', () => {
  const C = 'nano_1coldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcoldcd11';
  const B = 'nano_3njeurfz9c1gs3gu3ihsezjtbfwnbjdbf9rn3wbkq7o1t6t8ai7xhdmh4nhn';
  const led = reclassifyCold([row('tranche', 'cold', '300'), row('payment_in', C, '250'), row('payment_in', B, '0.02')], new Set([C]));
  assert.equal(led[1].kind, 'tranche'); assert.equal(led[1].counterparty, 'cold'); assert.match(led[1].reason, /cold storage/);
  assert.equal(led[2].kind, 'payment_in');
  const n = counterpartyNumbers(led, new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 1); assert.equal(n.external.nano, nanoToRaw('0.02'));
  COLD.add(C);
  assert.equal(redact('top-up from ' + C + ' arrived'), 'top-up from [cold storage] arrived');
  // the worker records the tranche sender in meta_json; every string field is redacted
  assert.equal(redact('{"corrected_from":"payment_in","from":"' + C + '"}'), '{"corrected_from":"payment_in","from":"[cold storage]"}');
  COLD.delete(C);
});

// The JSON alternate in <head> must point at the page's own dataset (Dalton Carlton, 2026-09-11:
// /sellers advertised /log.json, so a crawler following it got the log, not the sellers).
// Since 2026-09-14 (ShaXiaozhu's Codex agent: /bounty advertised /log.json) a page with no JSON form
// advertises nothing at all.
test('a pass-through wallet is counted as the account that funded it', () => {
  const P1 = 'nano_1passthru1111111111111111111111111111111111111111111111111111';
  const P2 = 'nano_1passthru2222222222222222222222222222222222222222222222222222';
  const via = new Map([[P1, B], [P2, B]]);
  // two Subnano-style purchases by the same buyer B through two one-time wallets: one counterparty, both amounts count
  let n = counterpartyNumbers([row('payment_in', P1, '0.185'), row('payment_in', P2, '0.95')], new Set(), nanoToRaw('0.01'), via);
  assert.equal(n.external.counterparties, 1);
  assert.equal(n.external.nano, nanoToRaw('1.135'));
  assert.equal(n.external.passthrough_wallets, 2);
  assert.equal(n.counterparties.in, 1);
  // a pass-through funded by an address we paid is exchange, not inflow (one hop back)
  n = counterpartyNumbers([row('payment_out', B, '0.2'), row('payment_in', P1, '0.185')], new Set(), nanoToRaw('0.01'), via);
  assert.equal(n.external.counterparties, 0);
  assert.equal(n.external.nano, 0n);
  assert.equal(n.counterparties.both, 1);
  // without a via map nothing changes
  n = counterpartyNumbers([row('payment_in', P1, '0.185'), row('payment_in', P2, '0.95')], new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 2);
  assert.equal(n.external.passthrough_wallets, 0);
});

test('a small non-match is re-checked after the wallet empties', async () => {
  const P = 'nano_1lateremptied111111111111111111111111111111111111111111111111';
  const FEE = 'nano_1fee1111111111111111111111111111111111111111111111111111111';
  const histories = [
    [
      { type: 'send', account: ADDRESS, amount: '90', local_timestamp: '100' },
      { type: 'receive', account: B, amount: '100', local_timestamp: '90' },
    ],
    [
      { type: 'send', account: FEE, amount: '10', local_timestamp: '110' },
      { type: 'send', account: ADDRESS, amount: '90', local_timestamp: '100' },
      { type: 'receive', account: B, amount: '100', local_timestamp: '90' },
    ],
  ];
  let calls = 0;
  const rpc = async () => ({ history: histories[calls++] });
  const ledger = [row('payment_in', P, '0.09')];

  assert.equal((await passthroughSources(ledger, rpc)).has(P), false);
  assert.equal((await passthroughSources(ledger, rpc)).get(P), B);
  assert.equal(calls, 2);
});

test('a history beyond the pass-through limit remains negatively cached', async () => {
  const P = 'nano_1terminal1111111111111111111111111111111111111111111111111111';
  let calls = 0;
  const rpc = async () => {
    calls++;
    return { history: Array.from({ length: 5 }, () => ({ type: 'send', account: ADDRESS, amount: '1', local_timestamp: '100' })) };
  };
  const ledger = [row('payment_in', P, '0.09')];

  assert.equal((await passthroughSources(ledger, rpc)).has(P), false);
  assert.equal((await passthroughSources(ledger, rpc)).has(P), false);
  assert.equal(calls, 1);
});

test('page() advertises only the alternate it is given, none by default', () => {
  const { page } = require('../site');
  assert.doesNotMatch(page('t', '<p>b</p>'), /<link rel="alternate"/);
  assert.match(page('t', '<p>b</p>', undefined, '/sellers.json'), /<link rel="alternate" type="application\/json" href="\/sellers.json">/);
});
