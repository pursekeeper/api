#!/usr/bin/env node
// One paid x402 call to a Vend API Merchant endpoint (paypercall.dev), then two replays of the same
// PAYMENT-SIGNATURE (identical request, then a changed query) to see whether the seller refuses reuse.
// Same flow as api/examples/client-x402.js; records every step under purchases/vend/.
'use strict';
const N = require('/var/lib/gambit/workspace/api/node_modules/nanocurrency');
const fs = require('fs');
const url = process.argv[2]; const replayUrl = process.argv[3]; const tag = process.argv[4] || 'call';
const out = (n, d) => fs.writeFileSync(`${__dirname}/${tag}-${n}`, typeof d === 'string' ? d : JSON.stringify(d, null, 2));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = s => JSON.parse(Buffer.from(s, 'base64').toString());
const rpc = async (u, body) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
(async () => {
  const sk = N.deriveSecretKey(process.env.NANO_SEED, Number(process.env.NANO_INDEX || 0));
  const account = N.deriveAddress(N.derivePublicKey(sk), { useNanoPrefix: true });
  const t0 = Date.now();
  const first = await fetch(url, { headers: { 'user-agent': 'pursekeeper-x402-client/1.0 (+https://pursekeeper.dev)' } });
  const firstBody = await first.text(); out('1-402.json', { status: first.status, headers: Object.fromEntries(first.headers), body: firstBody });
  if (first.status !== 402) { console.log('not 402:', first.status, firstBody.slice(0, 300)); return; }
  const pr = unb64(first.headers.get('payment-required'));
  const accepted = pr.accepts.find(a => a.scheme === 'exact' && a.network === 'nano:mainnet');
  console.error(`seller wants ${Number(accepted.amount) / 1e30} NANO to ${accepted.payTo}; extra=${JSON.stringify(accepted.extra)} maxTimeoutSeconds=${accepted.maxTimeoutSeconds}`);
  const info = await (await fetch(`https://pursekeeper.dev/v1/account_info?account=${account}`)).json();
  const balance = (BigInt(info.balance_raw) - BigInt(accepted.amount)).toString();
  const tw = Date.now();
  const w = (await rpc(process.env.WORK_URL, { action: 'work_generate', hash: info.frontier, difficulty: 'fffffff800000000' })).work;
  console.error('work in', Date.now() - tw, 'ms');
  const { block, hash } = N.createBlock(sk, { work: w, previous: info.frontier, representative: info.representative, balance, link: accepted.payTo });
  block.account = block.account.replace(/^xrb_/, 'nano_');
  const sig = b64({ x402Version: 2, resource: pr.resource, accepted, payload: { block } });
  out('2-block.json', { hash, block, paymentSignatureSha256: require('crypto').createHash('sha256').update(sig).digest('hex') });
  const t1 = Date.now();
  const r = await fetch(url, { headers: { 'PAYMENT-SIGNATURE': sig, 'user-agent': 'pursekeeper-x402-client/1.0 (+https://pursekeeper.dev)' } });
  const body = await r.text(); const settle = r.headers.get('payment-response');
  out('3-paid.json', { status: r.status, ms: Date.now() - t1, totalMs: Date.now() - t0, headers: Object.fromEntries(r.headers), settlement: settle ? unb64(settle) : null, body });
  console.log('PAID', r.status, 'in', Date.now() - t1, 'ms; hash', hash); console.log(body.slice(0, 600));
  // replay 1: identical request, same signature
  const r2 = await fetch(url, { headers: { 'PAYMENT-SIGNATURE': sig } }); const b2 = await r2.text();
  out('4-replay-same.json', { status: r2.status, headers: Object.fromEntries(r2.headers), body: b2 });
  console.log('REPLAY same request:', r2.status, b2.slice(0, 200));
  // replay 2: changed query, same signature
  const r3 = await fetch(replayUrl, { headers: { 'PAYMENT-SIGNATURE': sig } }); const b3 = await r3.text();
  out('5-replay-changed.json', { status: r3.status, headers: Object.fromEntries(r3.headers), body: b3 });
  console.log('REPLAY changed query:', r3.status, b3.slice(0, 200));
})().catch(e => { console.error('error:', e.message); process.exit(1); });
