"""Combine census.json: one row per account paid by an exchange source in the window; classes by named destination."""
import json, collections, time
c = json.load(open('census.json'))
EXG = ['Binance', 'Binance US', 'KuCoin', 'HitBTC', 'OKX', 'Kraken', 'Crypto.com']
OVERRIDE = {  # named after the run: both only ever send on to the labelled Crypto.com hot wallet (one directly, one through the other)
 'nano_3hw1diskrtcpi75yhqwzunutnioeo3ajrxwttecxo6n33tujop3ooq6asnmd': 'Crypto.com (deposit wallet, my match)',
 'nano_1rha4pzoj9mwgbzwuohku3yids3516exnty7wr93z73qf7xpzfpsw4synq53': 'Crypto.com (deposit wallet, my match)',
}
BIGSHAPE = {'nano_15crbb8dqzetb3wfi7kj74cgeparwo9tw6yz98mhca9wk57gndxiy37csa3d'}  # 758 sends to 21 accounts in 30 d, unnamed
def cls(s):
    if s.get('to') in OVERRIDE: return 'listed exchange'
    if s.get('to') in BIGSHAPE: return 'unnamed, exchange-like by shape'
    l = s['sink'].lower()
    if s['kind'] == 'unknown': return 'unnamed account' if l.startswith('unlabelled') else 'not pocketed by the receiver'
    if any(w in l for w in ('nanogames', 'luckynano', 'pasino', 'bc.game', 'luckygames', 'betnano', 'nano.bet', 'poker')): return 'gambling site'
    if 'nanogpt' in l: return 'NanoGPT (model calls)'
    if 'nanswap' in l or 'nano.trade' in l: return 'swap service'
    if any(w in l for w in ('binance', 'kucoin', 'kraken', 'hitbtc', 'okex', 'okx', 'crypto.com', 'huobi', 'coinex', 'bitvavo', 'mercatox', 'wirex', 'changenow')): return 'listed exchange'
    if any(w in l for w in ('playnano', 'tipnano', 'nanobot', 'cwallet', 'faucet', 'natrium', 'twister32')): return 'faucet / tip / wallet service'
    if any(w in l for w in ('subnano', 'silex', 'contact:')): return 'Subnano or a project I track'
    if 'deposit address' in l and 'kucoin' in l: return 'listed exchange'
    return 'other named: ' + s['sink'][:40]
def table(groups, title):
    acc = {}
    for g in groups:
        for r in c['groups'][g]:
            a = acc.setdefault(r['account'], {'got': 0.0, 'state': r['state'], 'sends': r.get('sends', []), 'src': set()})
            a['got'] += r['got']; a['src'].add(g)
            if r['state'] == 'sent on': a['state'] = 'sent on'; a['sends'] = r['sends']
    n = len(acc); tot = sum(a['got'] for a in acc.values())
    print(f"\n{title}: {n} accounts received Ӿ{tot:,.0f} from {', '.join(groups)} in {c['days']} days to {time.strftime('%Y-%m-%d %H:%MZ', time.gmtime(c['now']))}")
    st = collections.Counter(a['state'] for a in acc.values())
    for k in ('sent on', 'kept', 'never opened'): print(f"   {k:14} {st[k]:>5} accounts  Ӿ{sum(a['got'] for a in acc.values() if a['state'] == k):>14,.0f} received")
    mem = collections.defaultdict(lambda: [0, 0.0, 0]); excl = collections.Counter(); exclv = collections.Counter()
    for a in acc.values():
        if a['state'] != 'sent on': continue
        per = collections.Counter()
        for s in a['sends']: per[cls(s)] += s['amt']; mem[cls(s)][2] += 1
        for k, v in per.items(): mem[k][0] += 1; mem[k][1] += v
        top = per.most_common(1)[0][0]; excl[top] += 1; exclv[top] += a['got']
    print('   destination class                    accounts sending there (an account can be in several) | sends | XNO sent || accounts for which it is the largest destination | XNO those accounts received')
    for k, (na, v, ns) in sorted(mem.items(), key=lambda kv: -kv[1][0]):
        print(f"   {k[:38]:38} {na:>5} | {ns:>5} | {v:>13,.2f} || {excl[k]:>5} | {exclv[k]:>13,.0f}")
    return acc
ex = table(EXG, 'EXCHANGE WITHDRAWALS')
table(['Nanswap'], 'SWAP SERVICE PAYOUTS (Nanswap hot wallet)')
table(['unMineable'], 'MINING PAYOUTS (unMineable)')
# named gambling / NanoGPT detail across exchanges
det = collections.defaultdict(lambda: [set(), 0.0, 0])
for a, r in ex.items():
    for s in r['sends']:
        if cls(s) in ('gambling site', 'NanoGPT (model calls)', 'swap service', 'faucet / tip / wallet service', 'Subnano or a project I track') or cls(s).startswith('other named'):
            k = s['sink'].split(' [via')[0][:60]
            if cls(s) == 'Subnano or a project I track': k = 'Subnano checkout, a Subnano reader or the With Silex paywall'
            if k.startswith('PlayNANO'): k = 'PlayNANO hot wallets (39 labelled)'
            if 'NanoGPT' in k: k = 'NanoGPT collection wallet (my match)'
            det[k][0].add(a); det[k][1] += s['amt']; det[k][2] += 1
print('\nnamed non-exchange destinations of exchange-withdrawal accounts (accounts | sends | XNO)')
for k, (aa, v, ns) in sorted(det.items(), key=lambda kv: -len(kv[1][0])): print(f"   {len(aa):>4} | {ns:>4} | {v:>11,.2f} | {k}")
# size distribution of exchange withdrawals
import statistics
g = sorted(r['got'] for r in ex.values())
print(f"\nexchange-withdrawal accounts by XNO received: median {statistics.median(g):,.1f}; <10: {sum(1 for x in g if x<10)}; 10-100: {sum(1 for x in g if 10<=x<100)}; 100-1000: {sum(1 for x in g if 100<=x<1000)}; 1000-10000: {sum(1 for x in g if 1000<=x<10000)}; >=10000: {sum(1 for x in g if x>=10000)}")
multi = sum(1 for r in ex.values() if len(r['src']) > 1); print('accounts paid by more than one exchange group:', multi)
