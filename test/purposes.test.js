'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { build, REASONS, load } = require('../purposes');

test('ladder stakes from entries and surplus, own/cold accounts, donors and manual entries are all registered', () => {
  const reg = build({
    ladderEntries: { rounds: { 2: { entries: [{ address: 'nano_1aaa', stake_hash: '301dccda118e04a2a8ad5ec04505b7da7fdf7be5371dd2a05a8f22e843372724' }] } } },
    ladderSurplus: { note: 'x', 2: [{ address: 'nano_1bbb', stake_hash: 'F49EA1FC0CC41CCEB5C421D82C6618487BC7119925CF01AAF65803D1EECDA220' }] },
    own: { addresses: [{ address: 'nano_1own', note: 'mine' }] },
    cold: { funding: 'nano_1cold' },
    inflowLabels: { _comment: 'c', nano_1donor: { name: 'd', kind: 'donation' }, nano_1other: { kind: 'sale' } },
    manual: { hashes: { ['abcd'.repeat(16)]: 'claims bond' }, accounts: { nano_1man: 'manual' } },
  });
  assert.strictEqual(reg.hashes.get('301DCCDA118E04A2A8AD5EC04505B7DA7FDF7BE5371DD2A05A8F22E843372724'), REASONS['ladder stake']);
  assert.strictEqual(reg.hashes.get('F49EA1FC0CC41CCEB5C421D82C6618487BC7119925CF01AAF65803D1EECDA220'), REASONS['ladder stake']);
  assert.strictEqual(reg.hashes.get('ABCD'.repeat(16)), 'claims bond');
  assert.strictEqual(reg.accounts.get('nano_1own'), REASONS['own account']);
  assert.strictEqual(reg.accounts.get('nano_1cold'), REASONS['funding account']);
  assert.strictEqual(reg.accounts.get('nano_1donor'), REASONS['donation']);
  assert.strictEqual(reg.accounts.get('nano_1other'), undefined);
  assert.strictEqual(reg.accounts.get('nano_1man'), 'manual');
});

test('missing or malformed sources yield an empty registry, not a crash', () => {
  const reg = build({ ladderEntries: null, ladderSurplus: 'junk', own: null, cold: null, inflowLabels: null, manual: null });
  assert.strictEqual(reg.hashes.size, 0); assert.strictEqual(reg.accounts.size, 0);
});

test('the live registry on this box lists the two round-2 stakes named in api#74', { skip: !require('fs').existsSync(require('../purposes').SOURCES.ladderEntries) }, () => {
  const reg = load();
  assert.ok(reg.hashes.has('301DCCDA118E04A2A8AD5EC04505B7DA7FDF7BE5371DD2A05A8F22E843372724'));
  assert.ok(reg.hashes.has('F49EA1FC0CC41CCEB5C421D82C6618487BC7119925CF01AAF65803D1EECDA220'));
  assert.ok(reg.accounts.has('nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf'));
});

test('a donation label that names hashes is hash-scoped; one without hashes covers the whole address (Ops Control HQ, 2026-09-28)', () => {
  const h = 'c665a9289d909c59c44ee00f0dcd6e606b46447ba615fb8f37492ea7fbe0ecc0';
  const reg = build({ ladderEntries: null, ladderSurplus: null, own: null, cold: null, manual: null,
    inflowLabels: { nano_1named: { name: 'n', kind: 'donation', hashes: [h] }, nano_1whole: { name: 'w', kind: 'donation' }, nano_1bad: { kind: 'donation', hashes: ['nothex'] } } });
  assert.strictEqual(reg.hashes.get(h.toUpperCase()), REASONS['donation']);
  assert.strictEqual(reg.accounts.get('nano_1named'), undefined);   // a later send from the donor is ordinary credit
  assert.strictEqual(reg.accounts.get('nano_1whole'), REASONS['donation']);
  assert.strictEqual(reg.accounts.get('nano_1bad'), REASONS['donation']);   // no usable hash: falls back to the address
});
