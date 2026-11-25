// Does the node answer for a hash it has already been shown? Straight to my node's RPC (the public door is bypassed), so
// nothing in pursekeeper's own code can be the cause. Throwaway keys made here and never stored; unfunded accounts and
// unknown `previous` only, so nothing here can be published to the ledger.
const nc = require('/var/lib/gambit/workspace/api/node_modules/nanocurrency');
const crypto = require('crypto');
const RPC = 'http://127.0.0.1:7076', WORK = 'http://127.0.0.1:3007';
const j = (u, b) => fetch(u, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }).then(r => r.json());
const rnd = () => crypto.randomBytes(32).toString('hex').toUpperCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BADSIG = 'A'.repeat(128), NOWORK = '0000000000000000';
async function fresh() {
  const sk = rnd(), pk = nc.derivePublicKey(sk), account = nc.deriveAddress(pk, { useNanoPrefix: true });
  const previous = rnd();
  const blk = { account, previous, representative: account, balance: '1', link: '0'.repeat(64) };
  const hash = nc.hashBlock(blk);
  const signature = nc.signBlock({ hash, secretKey: sk });
  const work = (await j(WORK, { action: 'work_generate', hash: previous, difficulty: 'fffffff800000000' })).work;
  if (!work) throw new Error('no work');
  return { hash, block: { type: 'state', ...blk, signature, work } };
}
const ask = async block => { const r = await j(RPC, { action: 'process', json_block: 'true', block }); return r.error || ('ACCEPTED ' + r.hash); };
(async () => {
  const rounds = Number(process.argv[2] || 3), out = [];
  for (let i = 1; i <= rounds; i++) {
    const row = { round: i, at: new Date().toISOString() };
    // G: shown first in its valid form (a gap), then the same hash with the signature and/or the work spoiled
    const G = await fresh();
    row.G_hash = G.hash.slice(0, 8);
    row.G1_valid = await ask(G.block);
    row.G2_same_hash_garbage_signature = await ask({ ...G.block, signature: BADSIG });
    row.G3_same_hash_zero_work = await ask({ ...G.block, work: NOWORK });
    row.G4_same_hash_both = await ask({ ...G.block, signature: BADSIG, work: NOWORK });
    // H: shown first with a garbage signature, then the same hash correctly signed, then garbage again
    const H = await fresh();
    row.H1_garbage_signature_first = await ask({ ...H.block, signature: BADSIG });
    row.H2_same_hash_valid = await ask(H.block);
    row.H3_same_hash_garbage_again = await ask({ ...H.block, signature: BADSIG });
    // K: shown first with zero work, then the same hash with work, then zero work again
    const K = await fresh();
    row.K1_zero_work_first = await ask({ ...K.block, work: NOWORK });
    row.K2_same_hash_valid = await ask(K.block);
    row.K3_same_hash_zero_work_again = await ask({ ...K.block, work: NOWORK });
    if (i === 1) { await sleep(120_000); row.G5_garbage_signature_after_120s = await ask({ ...G.block, signature: BADSIG }); row.G6_zero_work_after_120s = await ask({ ...G.block, work: NOWORK }); }
    out.push(row); console.log(JSON.stringify(row, null, 1));
  }
  const v = await j(RPC, { action: 'version' });
  console.log('node', v.node_vendor, 'rounds', rounds);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
