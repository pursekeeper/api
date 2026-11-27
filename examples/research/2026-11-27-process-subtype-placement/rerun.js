// Re-run of the process check order after PiBrain's report (Subnano comment a438472f, 2026-11-27 19:02Z): where must
// `subtype` sit for the node to act on it? One FRESH block per call, unknown `previous`, throwaway keys, unfunded
// accounts: nothing here can enter the ledger. Each case goes straight to the node's RPC and through the door.
const nc = require('/var/lib/gambit/workspace/api/node_modules/nanocurrency');
const crypto = require('crypto');
const RPC = 'http://127.0.0.1:7076', WORK = 'http://127.0.0.1:3007', DOOR = process.env.DOOR || 'https://pursekeeper.dev/v1/process';
const j = (u, b) => fetch(u, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }).then(async r => ({ status: r.status, ...(await r.json()) }));
const rnd = () => crypto.randomBytes(32).toString('hex').toUpperCase();
const BADSIG = 'A'.repeat(128), NOWORK = '0000000000000000';
async function fresh({ goodSig = true, goodWork = false }) {
  const sk = rnd(), pk = nc.derivePublicKey(sk), account = nc.deriveAddress(pk, { useNanoPrefix: true });
  const previous = rnd();
  const blk = { account, previous, representative: account, balance: '1', link: '0'.repeat(64) };
  const signature = goodSig ? nc.signBlock({ hash: nc.hashBlock(blk), secretKey: sk }) : BADSIG;
  const work = goodWork ? (await j(WORK, { action: 'work_generate', hash: previous, difficulty: 'fffffff800000000' })).work : NOWORK;
  return { type: 'state', ...blk, signature, work };
}
// shape(block) -> the JSON body sent. `top` = subtype beside block; `inside` = subtype inside the block object; `flat` = block fields at the top level.
const cases = [
  ['A1 no subtype | zero work, good signature', { }, b => ({ block: b })],
  ['A2 no subtype | good work, garbage signature', { goodSig: false, goodWork: true }, b => ({ block: b })],
  ['A3 no subtype | good work, good signature', { goodWork: true }, b => ({ block: b })],
  ['B1 subtype "send" beside block | zero work, good signature', { }, b => ({ subtype: 'send', block: b })],
  ['B2 subtype "receive" beside block | zero work, good signature', { }, b => ({ subtype: 'receive', block: b })],
  ['B3 subtype "send" beside block | zero work, garbage signature', { goodSig: false }, b => ({ subtype: 'send', block: b })],
  ['C1 subtype "send" INSIDE block | zero work, good signature', { }, b => ({ block: { ...b, subtype: 'send' } })],
  ['C2 subtype "receive" INSIDE block | zero work, good signature', { }, b => ({ block: { ...b, subtype: 'receive' } })],
  ['C3 subtype "send" INSIDE block | good work, good signature', { goodWork: true }, b => ({ block: { ...b, subtype: 'send' } })],
  ['D1 subtype "foo" beside block | zero work, good signature', { }, b => ({ subtype: 'foo', block: b })],
  ['D2 subtype "foo" beside block | good work, good signature', { goodWork: true }, b => ({ subtype: 'foo', block: b })],
  ['D3 subtype "Send" (capital) beside block | zero work, good signature', { }, b => ({ subtype: 'Send', block: b })],
  ['E1 flat body, subtype "send" at the top | zero work, good signature', { }, b => ({ ...b, subtype: 'send' })],
  ['F1 block as JSON text, subtype "send" beside it | zero work, good signature', { }, b => ({ subtype: 'send', block: JSON.stringify(b) })],
  ['F2 block as JSON text with subtype "send" inside the text | zero work, good signature', { }, b => ({ block: JSON.stringify({ ...b, subtype: 'send' }) })],
];
(async () => {
  console.log('door', DOOR, '| started', new Date().toISOString());
  for (const [name, o, shape] of cases) {
    const nb = shape(await fresh(o)), db = shape(await fresh(o));
    // The node's RPC wants json_block for an object block; a flat body has no meaning there, so E1 is door-only.
    let n = { error: '(door only)' };
    if (!name.startsWith('E1')) n = await j(RPC, { action: 'process', ...(typeof nb.block === 'string' ? {} : { json_block: 'true' }), ...nb });
    const d = await j(DOOR, db);
    console.log(`${name}\n    node -> ${n.error || 'ACCEPTED ' + n.hash}\n    door -> ${d.status} ${d.code || ''} (${d.node_error || d.error || 'ACCEPTED'})${d.subtype_used !== undefined ? ' subtype_used=' + JSON.stringify(d.subtype_used) + ' subtype_from=' + JSON.stringify(d.subtype_from) : ''}${d.subtype_given !== undefined ? ' subtype_given=' + JSON.stringify(d.subtype_given) : ''}`);
  }
  console.log('finished', new Date().toISOString());
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
