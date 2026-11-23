#!/usr/bin/env python3
"""Where does Nano go after it reaches a holder? (2026-11-23, wake 658)
Sources = accounts through which Nano reaches holders: labelled exchange hot wallets that are active, Nanswap's hot
wallet, unMineable's payout account. For every account a source paid in the window, read what that account sent
afterwards and resolve each destination to a sink: a known label, or (one hop on) the labelled account a pass-through
address forwards to. Read-only on the local node. Writes census.json (private: full accounts) and prints aggregates.
usage: python3 census.py [days]"""
import json, sys, time, sqlite3, collections, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import rpc, history
W = os.environ.get('PK_WORKSPACE', '/var/lib/gambit/workspace/')   # optional private label files; every one may be missing
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 30
NOW = int(time.time()); SINCE = NOW - DAYS * 86400
SOURCES = {
 'Binance': ['nano_3kef5c3ahkwf3qcyw61qcnma668z8ez4ocnm55gkiaqeure3ghcfqunfynug'],
 'Binance US': ['nano_3yej4c6s5ddwk8bq1o3945jgzx7axh94p813dmnq1aywh8ekufhfsgw68cbg'],
 'KuCoin': ['nano_3iypqe87d399qnsgejk6jx11u334ep77ipgsrtg9zi31onpz9a4yfypjxnau', 'nano_3kc4zij11m87u6rs1kx3c4xrajufrw45b9nawruxu3t7yfcxcaui9r9gpqqg'],
 'HitBTC': ['nano_1td9t7i3dj6xayhzf9t6xndqfj34crunefmig1fbxf9wna56eincgwm1tzi7'],
 'OKX': ['nano_1o5rr464r8bgu4h3jnt5yn4a6tbd5shbbpwk6aj6sunf8dzdpmke6q4tgtkj'],
 'Nanswap': ['nano_115hp31z6kh5d66pggb15s4mxchqx1aah9jtqbeuhjdwaoqxoxo7o1yzpodk'],
 'unMineable': ['nano_13egkbp8mi7ff5s5eafx6yoiatr5w6fmn3mpbpbm9gsobxxeput1tq5pyfzm'],
}
EXTRA = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extra-sources.json'))) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extra-sources.json')) else {}
for k, v in EXTRA.items(): SOURCES.setdefault(k, []); SOURCES[k] += [a for a in v if a not in SOURCES[k]]
# ---- labels
LAB = {}
def add(a, n):
    if a and a.startswith('nano_') and a not in LAB: LAB[a] = n
HERE = os.path.dirname(os.path.abspath(__file__))
# public label files beside this script, then optional private ones from the workspace
for f, kn, ka in [('nanolooker-exchanges.json', 'name', 'account'), ('nanolooker-knownAccounts.json', 'alias', 'account'), ('labels-own.json', 'name', 'account')]:
    try:
        for x in json.load(open(os.path.join(HERE, f))): add(x[ka], x[kn])
    except Exception as e: print('label file not read', f)
for f, kn, ka in [('trace/merchants.json', 'name', 'account'), ('trace/known-local.json', 'alias', 'account'), ('trace/exchanges-local.json', 'name', 'account')]:
    try:
        for x in json.load(open(W + f)): add(x[ka], x[kn])
    except Exception as e: pass
try:
    for a, n in json.load(open(W + 'trace/names.json')).items(): add(a, n)
except Exception as e: pass
try:
    v = json.load(open(W + 'trace/venue-labels.json'))
    it = v.items() if isinstance(v, dict) else [(x.get('account'), x.get('name') or x.get('label')) for x in v]
    for a, n in it:
        if isinstance(n, dict): n = n.get('name') or n.get('label')
        add(a, str(n))
except Exception as e: pass
OWN = set(LAB)
if os.path.exists(os.path.join(HERE, 'labels-blocklattice.json')):      # blocklattice.io/api/known-accounts, fetched 2026-11-23
    for a, n in json.load(open(os.path.join(HERE, 'labels-blocklattice.json'))).items():
        if a not in OWN or 'Hot Wallet' in n or n == 'Nanswap': LAB[a] = n
try:
    db = sqlite3.connect('file:/var/lib/gambit/gambit.db?mode=ro', uri=True)
    cols = [r[1] for r in db.execute('pragma table_info(contacts)')]
    namecol = 'handle' if 'handle' in cols else ('label' if 'label' in cols else cols[1])
    for a, n in db.execute(f'select address, {namecol} from contacts where address like "nano_%"'): add(a, f'contact: {n}')
except Exception as e: pass
for g, accts in SOURCES.items():
    for a in accts: LAB[a] = f'{g} (source wallet)'
ALLSRC = {a for v in SOURCES.values() for a in v}
EXCH_WORDS = ('binance', 'kucoin', 'kraken', 'huobi', 'okex', 'okx', 'hitbtc', 'coinex', 'bitvavo', 'crypto.com', 'mercatox', 'wirex', 'changenow', 'nanswap', 'mexc', 'bybit', 'bitget', 'exchange', 'pagcripto', 'nanex', 'atomic wallet')
def is_exch(label): return any(w in label.lower() for w in EXCH_WORDS)
# ---- caches
INFO = {}; HIST = {}
def info(a):
    if a not in INFO: INFO[a] = rpc(action='account_info', account=a)
    return INFO[a]
def hist(a, since, cap):
    k = (a, since, cap)
    if k not in HIST: HIST[k] = list(history(a, since, cap=cap))
    return HIST[k]
SINK = {}
def sink(d, after_ts):
    """Resolve a destination to (label, kind). kind: label | via (pass-through to a labelled account) | unknown."""
    if d in LAB: return LAB[d], 'label'
    if d in SINK: return SINK[d]
    i = info(d)
    if 'error' in i: r = ('never opened (unpocketed)', 'unknown')
    else:
        bc = int(i['block_count']); res = None
        if bc <= 4000:
            sends = [e for e in hist(d, after_ts - 5, 400) if e.get('subtype') == 'send']
            fee = [e for e in sends if e.get('account') == 'nano_1gip4yjax4jzyqfpa3f3pzt1fefbbh4w1wt67wgw75wij34qy7yyio9jeuj4']
            if fee and bc <= 4: res = ('Subnano checkout (post sale or tip)', 'via')
            else:
                tot = collections.Counter()
                for e in sends: tot[e.get('account')] += int(e.get('amount') or 0)
                for s, _ in tot.most_common(3):
                    if s in LAB: res = (LAB[s] + ' [via its deposit/pass-through address]', 'via'); break
        r = res or (f'unlabelled {d}', 'unknown')
    SINK[d] = r
    return r
# ---- walk
out = {'days': DAYS, 'now': NOW, 'groups': {}}
for g, accts in SOURCES.items():
    wd = {}
    for a in accts:
        for e in history(a, SINCE, cap=80000):
            if e.get('subtype') != 'send': continue
            d = e.get('account'); amt = int(e.get('amount') or 0); ts = int(e['local_timestamp'])
            if d in ALLSRC or (d in LAB and is_exch(LAB[d])): continue          # internal / exchange-to-exchange
            x = wd.setdefault(d, {'amt': 0, 'n': 0, 'first': ts}); x['amt'] += amt; x['n'] += 1; x['first'] = min(x['first'], ts)
    rows = []
    for d, x in wd.items():
        i = info(d)
        row = {'account': d, 'got': x['amt'] / 1e30, 'payouts': x['n'], 'first': x['first'], 'label': LAB.get(d)}
        if 'error' in i:
            row.update(state='never opened', blocks=0, balance=0, sends=[])
        else:
            bc = int(i['block_count']); row.update(blocks=bc, balance=int(i['balance']) / 1e30)
            sends = [e for e in hist(d, x['first'], 3000) if e.get('subtype') == 'send']
            row['sends'] = []
            for e in sends:
                lab, kind = sink(e.get('account'), int(e['local_timestamp']))
                row['sends'].append({'to': e.get('account'), 'amt': int(e.get('amount') or 0) / 1e30, 'ts': int(e['local_timestamp']), 'sink': lab, 'kind': kind})
            row['state'] = 'sent on' if sends else 'kept'
        rows.append(row)
    out['groups'][g] = rows
    n = len(rows); tot = sum(r['got'] for r in rows)
    kept = [r for r in rows if r['state'] == 'kept']; nev = [r for r in rows if r['state'] == 'never opened']; on = [r for r in rows if r['state'] == 'sent on']
    print(f"\n== {g}: {n} accounts paid Ӿ{tot:,.2f} in {DAYS} d | sent nothing since {len(kept)} (Ӿ{sum(r['got'] for r in kept):,.2f}) | never pocketed {len(nev)} | sent something {len(on)} (got Ӿ{sum(r['got'] for r in on):,.2f}, sent Ӿ{sum(s['amt'] for r in on for s in r['sends']):,.2f})", flush=True)
    by = collections.defaultdict(lambda: [set(), 0.0, 0])
    for r in on:
        for s in r['sends']:
            key = s['sink'] if s['kind'] != 'unknown' else ('never opened (unpocketed)' if s['sink'].startswith('never') else 'UNLABELLED')
            by[key][0].add(r['account']); by[key][1] += s['amt']; by[key][2] += 1
    for k, (accs, amt, cnt) in sorted(by.items(), key=lambda kv: -len(kv[1][0]))[:25]:
        print(f"   {len(accs):>4} accts  {cnt:>5} sends  Ӿ{amt:>12,.2f}  -> {k[:110]}", flush=True)
    json.dump(out, open('census.json', 'w'))
json.dump(out, open('census.json', 'w'))
# unlabelled sinks across all groups
u = collections.defaultdict(lambda: [set(), 0.0, 0, set()])
for g, rows in out['groups'].items():
    for r in rows:
        for s in r.get('sends', []):
            if s['kind'] == 'unknown' and s['sink'].startswith('unlabelled'):
                x = u[s['to']]; x[0].add(r['account']); x[1] += s['amt']; x[2] += 1; x[3].add(g)
top = sorted(u.items(), key=lambda kv: (-len(kv[1][0]), -kv[1][1]))
json.dump([{'account': a, 'senders': len(x[0]), 'amt': x[1], 'sends': x[2], 'groups': sorted(x[3])} for a, x in top], open('unlabelled-sinks.json', 'w'), indent=0)
print(f"\nunlabelled sinks: {len(top)} accounts; with >=2 distinct senders: {sum(1 for a, x in top if len(x[0]) >= 2)}")
for a, x in top[:40]:
    i = info(a); bc = i.get('block_count', '0'); bal = int(i.get('balance', 0)) / 1e30
    print(f"   {len(x[0]):>3} senders {x[2]:>5} sends Ӿ{x[1]:>11,.2f} {sorted(x[3])} | {a} blocks {bc} bal {bal:,.2f}")
