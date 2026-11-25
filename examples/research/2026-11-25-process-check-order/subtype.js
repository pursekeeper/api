// Is it the `subtype` parameter, and not a remembered hash, that made wake 670's first run answer "Gap previous block"
// four times? One FRESH block per call (a hash the node has never been shown), straight to the node and through the door.
// Throwaway keys, unfunded accounts, unknown `previous`: nothing here can be published to the ledger.
const nc = require('/var/lib/gambit/workspace/api/node_modules/nanocurrency');
const crypto = require('crypto');
const RPC = 'http://127.0.0.1:7076', WORK = 'http://127.0.0.1:3007', DOOR = 'https://pursekeeper.dev/v1/process';
const j = (u, b) => fetch(u, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }).then(r => r.json());
const rnd = () => crypto.randomBytes(32).toString('hex').toUpperCase();
const BADSIG = 'A'.repeat(128), NOWORK = '0000000000000000';
async function fresh({ goodSig, goodWork, zeroPrevious }) {
  const sk = rnd(), pk = nc.derivePublicKey(sk), account = nc.deriveAddress(pk, { useNanoPrefix: true });
  const previous = zeroPrevious ? '0'.repeat(64) : rnd();
  const blk = { account, previous, representative: account, balance: '1', link: zeroPrevious ? rnd() : '0'.repeat(64) };
  const signature = goodSig ? nc.signBlock({ hash: nc.hashBlock(blk), secretKey: sk }) : BADSIG;
  const work = goodWork ? (await j(WORK, { action: 'work_generate', hash: zeroPrevious ? pk : previous, difficulty: 'fffffff800000000' })).work : NOWORK;
  return { type: 'state', ...blk, signature, work };
}
(async () => {
  const kinds = [
    ['garbage signature, zero work', { goodSig: false, goodWork: false }],
    ['garbage signature, valid work', { goodSig: false, goodWork: true }],
    ['valid signature, zero work', { goodSig: true, goodWork: false }],
    ['valid signature, valid work', { goodSig: true, goodWork: true }],
  ];
  for (const sub of [null, 'change', 'send', 'receive', 'open', 'epoch']) {
    for (const [name, o] of kinds) {
      if (sub !== null && sub !== 'change' && o.goodWork) continue;        // work is slow here; the two no-work kinds settle the order for the other subtypes
      const n = await j(RPC, { action: 'process', json_block: 'true', ...(sub ? { subtype: sub } : {}), block: await fresh(o) });
      const d = await j(DOOR, { action: 'process', json_block: 'true', ...(sub ? { subtype: sub } : {}), block: await fresh(o) });
      console.log(`subtype ${sub || '(none)'} | ${name} | node -> ${n.error || 'ACCEPTED ' + n.hash} | door -> ${d.code} (${d.node_error || d.error})`);
    }
  }
  // An open-shaped block (previous all zero, link = an unknown source) with subtype open: is there a gap answer there too?
  for (const [name, o] of kinds.slice(0, 1)) {
    const n = await j(RPC, { action: 'process', json_block: 'true', subtype: 'open', block: await fresh({ ...o, zeroPrevious: true }) });
    const n2 = await j(RPC, { action: 'process', json_block: 'true', block: await fresh({ ...o, zeroPrevious: true }) });
    console.log(`open-shaped (previous 0) | ${name} | node with subtype open -> ${n.error || 'ACCEPTED'} | node, no subtype -> ${n2.error || 'ACCEPTED'}`);
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
