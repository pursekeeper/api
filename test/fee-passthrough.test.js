// node --test  (run from api/). A send that arrived through a fee-taking checkout wallet (Subnano
// post purchases and tips) paid for that, not for API calls, so it must never become X-Nano-Payment
// credit, whoever presents the hash. feePassthrough decides from the payer's account_history.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { feePassthrough, FEE_COLLECTORS } = require('../server');

const ME = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';
const FEE = [...FEE_COLLECTORS][0];
const BUYER = 'nano_35wwkw7eg3aa4r4gubhhj3mmrg37oabnohokip51iunmi68bwjftm9t8tfai';
const subnano = [   // newest first, as account_history returns it
  { type: 'send', account: FEE, amount: '15000000000000000000000000000' },
  { type: 'send', account: ME, amount: '185000000000000000000000000000' },
  { type: 'receive', account: BUYER, amount: '200000000000000000000000000000' }];

test('a Subnano checkout wallet (receive, our share, fee to the collector) is a fee pass-through', () => {
  assert.equal(feePassthrough(subnano, FEE_COLLECTORS, ME), true);
});
test('a throwaway payer that sends everything to us is not: no fee send, so its hash stays valid credit', () => {
  assert.equal(feePassthrough(subnano.filter(x => x.account !== FEE), FEE_COLLECTORS, ME), false);
});
test('a wallet that paid the collector but not us is not', () => {
  assert.equal(feePassthrough(subnano.filter(x => x.account !== ME), FEE_COLLECTORS, ME), false);
});
test('an account with a longer history is never a checkout wallet, even if it once paid the collector', () => {
  const long = [...subnano, { type: 'receive', account: BUYER, amount: '1' }, { type: 'send', account: BUYER, amount: '1' }];
  assert.equal(feePassthrough(long, FEE_COLLECTORS, ME), false);
});
test('empty or missing history is not', () => {
  assert.equal(feePassthrough([], FEE_COLLECTORS, ME), false);
  assert.equal(feePassthrough(undefined, FEE_COLLECTORS, ME), false);
});
