'use strict';
// Purpose registry for sends that reach the shared hot wallet for something other than API credit.
// The X-Nano-Payment path is a bearer-hash design: any confirmed send to the address, presented by
// anyone, is credit, unless this server knows the send paid for something else. Subnano receipts are
// caught by the checkout-wallet heuristic in server.js; everything else this box knows about is listed
// here: forecast-ladder stakes (from the ladder's own entry and surplus files), my own accounts, the
// funding accounts, and donors. Loaded at startup and every ten-minute round, so a stake booked by the
// ladder is refused within ten minutes of being recorded there. Reported by JoanAbad82 (pursekeeper/api#74,
// 2026-09-28): two public round-2 stakes passed every generic check and would have been credited.
const fs = require('fs');
const path = require('path');
const WS = process.env.WORKSPACE || path.join(__dirname, '..');
const SOURCES = {
  ladderEntries: process.env.LADDER_ENTRIES || path.join(WS, 'ladder', 'data', 'entries.json'),
  ladderSurplus: process.env.LADDER_SURPLUS || path.join(WS, 'ladder', 'data', 'surplus.json'),
  own: path.join(__dirname, 'data', 'own-addresses.json'),
  cold: path.join(__dirname, 'data', 'cold-addresses.json'),
  inflowLabels: path.join(__dirname, 'data', 'inflow-labels.json'),
  manual: path.join(__dirname, 'data', 'purposes.json'),   // {"hashes": {HASH: "reason"}, "accounts": {nano_...: "reason"}}
};
const REASONS = {
  'ladder stake': 'this send is a forecast-ladder stake (ladder.pursekeeper.dev); it is committed to that round and is not API credit, whoever presents it',
  'own account': 'this send came from one of pursekeeper\'s own accounts; internal moves are not API credit',
  'funding account': 'this send is booked on the public log as something other than a payment for calls; it is not API credit',
  'donation': 'this send is labelled a donation on the public log; it is not API credit',
};
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const walk = (v, f) => { if (Array.isArray(v)) v.forEach(x => walk(x, f)); else if (v && typeof v === 'object') { f(v); Object.values(v).forEach(x => walk(x, f)); } };
// Pure: build {hashes: Map<HASH, reason>, accounts: Map<account, reason>} from already-parsed sources.
function build(src) {
  const hashes = new Map(), accounts = new Map();
  for (const doc of [src.ladderEntries, src.ladderSurplus]) walk(doc, o => { if (typeof o.stake_hash === 'string' && /^[0-9A-F]{64}$/i.test(o.stake_hash)) hashes.set(o.stake_hash.toUpperCase(), REASONS['ladder stake']); });
  walk(src.own, o => { if (typeof o.address === 'string' && o.address.startsWith('nano_')) accounts.set(o.address, REASONS['own account']); });
  walk(src.cold, o => { for (const v of Object.values(o)) if (typeof v === 'string' && v.startsWith('nano_')) accounts.set(v, REASONS['funding account']); });
  if (Array.isArray(src.cold)) for (const v of src.cold) if (typeof v === 'string' && v.startsWith('nano_')) accounts.set(v, REASONS['funding account']);
  if (src.inflowLabels && typeof src.inflowLabels === 'object') for (const [k, v] of Object.entries(src.inflowLabels)) if (k.startsWith('nano_') && v && v.kind === 'donation') accounts.set(k, REASONS['donation']);
  if (src.manual && typeof src.manual === 'object') {
    for (const [h, r] of Object.entries(src.manual.hashes || {})) if (/^[0-9A-F]{64}$/i.test(h)) hashes.set(h.toUpperCase(), String(r));
    for (const [a, r] of Object.entries(src.manual.accounts || {})) if (a.startsWith('nano_')) accounts.set(a, String(r));
  }
  return { hashes, accounts };
}
function load() {
  const src = {}; for (const [k, p] of Object.entries(SOURCES)) src[k] = readJson(p);
  return build(src);
}
module.exports = { build, load, REASONS, SOURCES };
