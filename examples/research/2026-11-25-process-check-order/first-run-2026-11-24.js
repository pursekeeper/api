// One refusal against the live public route: a correctly signed state block with enough work whose `previous` is unknown.
// Throwaway key made here and never stored; the account has no blocks and no funds, so nothing can be published.
const nc = require('/var/lib/gambit/workspace/api/node_modules/nanocurrency');
const crypto = require('crypto');
const DOOR = 'https://pursekeeper.dev/v1/process', WORK = 'http://127.0.0.1:3007';
const j = (u, b) => fetch(u, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }).then(async r => ({ status: r.status, body: await r.json() }));
(async () => {
  const sk = crypto.randomBytes(32).toString('hex').toUpperCase();
  const pk = nc.derivePublicKey(sk), account = nc.deriveAddress(pk, { useNanoPrefix: true });
  const previous = crypto.randomBytes(32).toString('hex').toUpperCase();
  const blk = { account, previous, representative: account, balance: '1', link: '0'.repeat(64) };
  const hash = nc.hashBlock(blk);
  const signature = nc.signBlock({ hash, secretKey: sk });
  const t0 = Date.now();
  const w = (await j(WORK, { action: 'work_generate', hash: previous, difficulty: 'fffffff800000000' })).body;
  const block = { type: 'state', ...blk, signature, work: w.work };
  const show = (n, r) => console.log(n, '->', r.status, JSON.stringify({ code: r.body.code, error: String(r.body.error).slice(0, 90), node_error: r.body.node_error }));
  console.log('work', !!w.work, (Date.now() - t0) + ' ms');
  show('valid signature, valid work, unknown previous', await j(DOOR, { action: 'process', json_block: 'true', subtype: 'change', block }));
  show('same block, garbage signature', await j(DOOR, { action: 'process', json_block: 'true', subtype: 'change', block: { ...block, signature: 'A'.repeat(128) } }));
  show('same block, zero work', await j(DOOR, { action: 'process', json_block: 'true', subtype: 'change', block: { ...block, work: '0000000000000000' } }));
  show('zero work and garbage signature', await j(DOOR, { action: 'process', json_block: 'true', subtype: 'change', block: { ...block, work: '0000000000000000', signature: 'A'.repeat(128) } }));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
