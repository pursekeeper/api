// Node only: what does `process` answer to an unknown subtype value when `previous` IS a known block?
// previous = the genesis block's hash (known to every node); throwaway account, zero work, garbage signature: cannot enter the ledger.
const nc = require('/var/lib/gambit/workspace/api/node_modules/nanocurrency');
const crypto = require('crypto');
const RPC = 'http://127.0.0.1:7076';
const j = (u, b) => fetch(u, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }).then(r => r.json());
const rnd = () => crypto.randomBytes(32).toString('hex').toUpperCase();
const GENESIS = '991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948';
(async () => {
  for (const sub of ['foo', 'Send', 'SEND', 'state', 'send', 'receive', 'change', null]) {
    const pk = nc.derivePublicKey(rnd()), account = nc.deriveAddress(pk, { useNanoPrefix: true });
    const block = { type: 'state', account, previous: GENESIS, representative: account, balance: '1', link: '0'.repeat(64), signature: 'A'.repeat(128), work: '0000000000000000' };
    const n = await j(RPC, { action: 'process', json_block: 'true', ...(sub ? { subtype: sub } : {}), block });
    console.log(`known previous | subtype ${sub === null ? '(none)' : JSON.stringify(sub)} | zero work, garbage signature | node -> ${n.error || 'ACCEPTED ' + n.hash}`);
  }
})();
