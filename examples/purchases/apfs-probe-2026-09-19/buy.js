#!/usr/bin/env node
// One paid x402 call (POST, JSON body) to the Mac APFS Probe (Luke Finigan's Codex agent), then one identical
// retry with the same PAYMENT-SIGNATURE to check the seller's "identical successful retries return the saved
// result" claim without paying twice. Same flow as api/examples/client-x402.js; every step is written under
// purchases/apfs-probe/<tag>-N.json.
'use strict';
const N = require('/var/lib/gambit/workspace/api/node_modules/nanocurrency');
const fs = require('fs');
const url = process.argv[2]; const tag = process.argv[3] || 'call';
const bodyText = fs.readFileSync(`${__dirname}/request.json`, 'utf8').trim();
const out = (n, d) => fs.writeFileSync(`${__dirname}/${tag}-${n}`, typeof d === 'string' ? d : JSON.stringify(d, null, 2));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = s => JSON.parse(Buffer.from(s, 'base64').toString());
const rpc = async (u, body) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
const RPC = process.env.NANO_RPC || 'http://127.0.0.1:7076';
const UA = 'pursekeeper-x402-client/1.0 (+https://pursekeeper.dev)';
const post = (headers) => fetch(url, { method: 'POST', body: bodyText, headers: { 'content-type': 'application/json', 'user-agent': UA, ...headers } });
(async () => {
  const sk = N.deriveSecretKey(process.env.NANO_SEED, Number(process.env.NANO_INDEX || 0));
  const account = N.deriveAddress(N.derivePublicKey(sk), { useNanoPrefix: true });
  const t0 = Date.now();
  const first = await post({});
  const firstBody = await first.text(); out('1-402.json', { at: new Date(t0).toISOString(), status: first.status, headers: Object.fromEntries(first.headers), body: firstBody });
  if (first.status !== 402) { console.log('not 402:', first.status, firstBody.slice(0, 300)); return; }
  const pr = unb64(first.headers.get('payment-required'));
  const accepted = pr.accepts.find(a => a.scheme === 'exact' && a.network === 'nano:mainnet');
  console.error(`seller wants ${Number(accepted.amount) / 1e30} NANO to ${accepted.payTo}; extra=${JSON.stringify(accepted.extra)} maxTimeoutSeconds=${accepted.maxTimeoutSeconds}`);
  const info = await rpc(RPC, { action: 'account_info', account, representative: 'true' });
  const balance = (BigInt(info.balance) - BigInt(accepted.amount)).toString();
  const tw = Date.now();
  const w = (await rpc(process.env.WORK_URL || RPC, { action: 'work_generate', hash: info.frontier, difficulty: accepted.extra?.workThreshold || 'fffffff800000000' })).work;
  console.error('work in', Date.now() - tw, 'ms');
  const { block, hash } = N.createBlock(sk, { work: w, previous: info.frontier, representative: info.representative, balance, link: accepted.payTo });
  block.account = block.account.replace(/^xrb_/, 'nano_');
  const sig = b64({ x402Version: 2, resource: pr.resource, accepted, payload: { block } });
  out('2-block.json', { hash, block, paymentSignatureSha256: require('crypto').createHash('sha256').update(sig).digest('hex') });
  const t1 = Date.now();
  const r = await post({ 'PAYMENT-SIGNATURE': sig });
  const body = await r.text(); const settle = r.headers.get('payment-response');
  out('3-paid.json', { at: new Date(t1).toISOString(), status: r.status, ms: Date.now() - t1, totalMs: Date.now() - t0, headers: Object.fromEntries(r.headers), settlement: settle ? unb64(settle) : null, body });
  console.log('PAID', r.status, 'in', Date.now() - t1, 'ms; hash', hash); console.log(body.slice(0, 1500));
  const t2 = Date.now();
  const r2 = await post({ 'PAYMENT-SIGNATURE': sig }); const b2 = await r2.text();
  out('4-retry-same.json', { at: new Date(t2).toISOString(), status: r2.status, ms: Date.now() - t2, headers: Object.fromEntries(r2.headers), body: b2 });
  console.log('RETRY identical:', r2.status, 'in', Date.now() - t2, 'ms;', b2.slice(0, 300));
})().catch(e => { console.error('error:', e.message); process.exit(1); });
