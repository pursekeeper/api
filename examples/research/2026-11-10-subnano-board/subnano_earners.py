#!/usr/bin/env python3
"""What the accounts that earn at Subnano do with the Nano, from the chain alone.

    python3 subnano_venue.py 30 --dump events.json
    python3 subnano_earners.py events.json [days] [--until 2026-11-12T08:13] [--labels labels.json] [--exclude nano_a,nano_b]

Takes the checkouts listed by subnano_venue.py, and for every payout account paid inside the window
reads that account's own sends inside the same window and sorts each destination into one of:

  venue      one of the venue's one-time checkout accounts: the earner bought or tipped at the venue
  exchange   an account on nanolooker's public exchange list, or named 'exchange' in --labels
  exchange-like  heuristic, labelled as such: an account with 10,000 or more blocks, or a short
             forwarding account (20 blocks or fewer) whose every onward send goes to an exchange or
             exchange-like account
  merchant   named 'merchant' in --labels (a service that sells something for Nano)
  seller     another payout account of the venue, paid directly and not through a checkout
  other      anything else; listed at the end so it can be looked at by hand

Accounts are split before any total is printed. A payout account is 'venue-fed' when at least 90% of
everything it has ever received came from the venue's checkouts: those are accounts kept for
selling, and what leaves them is venue earnings. The rest are 'mixed wallets' with other income (a
holder's own wallet that also sold a post); their sends are listed but say nothing about what
happened to venue earnings. Accounts that were paid and have never published a receive block are
counted on their own line: the Nano is theirs and still waiting.

Sends under 0.0001 XNO are counted as dust and left out (the venue's Nano login is a 0.000001 XNO
payment, and accounts are often opened with one raw). --labels is a JSON list of
{"account": "nano_...", "name": "...", "kind": "exchange" | "merchant" | "founder"}; accounts of
kind 'founder' are reported on their own line and left out of the earners' totals, as are --exclude
accounts. Read-only: account_history and account_info on a Nano node (NANO_RPC).

Limits. An account is a wallet, not a seller: one seller may be paid on several, and a seller that
moves earnings to another wallet of its own shows up under 'other'. A send inside the window may
spend Nano that arrived before it or from outside the venue. 'exchange-like' is a guess from the
shape of an account, not a name.
"""
import collections, datetime, json, os, sys, time, urllib.request

RPC = os.environ.get('NANO_RPC', 'http://127.0.0.1:7076')
RAW = 10 ** 30
DUST = 0.0001
PASS = 20      # a forwarding account has at most this many blocks
FED = 0.9      # an account is 'venue-fed' when this share of what it received in the window came from the venue
args = sys.argv[1:]
EVENTS = json.load(open(args[0]))
DAYS = next((int(a) for a in args[1:] if a.isdigit()), 30)
opt = lambda k: args[args.index(k) + 1] if k in args else None
UNTIL = opt('--until')
end = int(datetime.datetime.fromisoformat(UNTIL).replace(tzinfo=datetime.timezone.utc).timestamp()) if UNTIL else int(time.time())
cut = end - DAYS * 86400
LABELS = {x['account']: x for x in (json.load(open(opt('--labels'))) if opt('--labels') else [])}
EXCLUDE = set((opt('--exclude') or '').split(',')) - {''}
HERE = os.path.dirname(os.path.abspath(__file__))
try:
    EXCH = {x['account']: x['name'] for x in json.load(open(os.path.join(HERE, 'nanolooker-exchanges.json')))}
except Exception:
    EXCH = {}
EXCH.update({a: x['name'] for a, x in LABELS.items() if x.get('kind') == 'exchange'})
MERCH = {a: x['name'] for a, x in LABELS.items() if x.get('kind') == 'merchant'}
FOUNDER = {a for a, x in LABELS.items() if x.get('kind') == 'founder'}


def rpc(**kw):
    req = urllib.request.Request(RPC, data=json.dumps(kw).encode(), headers={'content-type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=60))


def hist(account, cap=3000):
    out, off = [], 0
    while off < cap:
        h = rpc(action='account_history', account=account, count='500', offset=str(off)).get('history') or []
        if not isinstance(h, list) or not h:
            break
        out += h
        off += len(h)
        if len(h) < 500:
            break
    return out


_info = {}
def blocks(a):
    if a not in _info:
        i = rpc(action='account_info', account=a)
        _info[a] = int(i.get('block_count', 0)) if 'error' not in i else 0
    return _info[a]


CHECKOUTS = {e['checkout'] for e in EVENTS}
PAYOUT_ALL = {a for e in EVENTS for a, _ in e['payees']}
_cls = {}
def classify(dest, depth=0):
    if dest in _cls:
        return _cls[dest]
    if dest in CHECKOUTS: r = ('venue', '')
    elif dest in EXCH: r = ('exchange', EXCH[dest])
    elif dest in MERCH: r = ('merchant', MERCH[dest])
    elif blocks(dest) >= 10000: r = ('exchange-like', f'{blocks(dest)} blocks')
    elif dest in PAYOUT_ALL: r = ('seller', '')
    else:
        r = ('other', f'{blocks(dest)} blocks')
        if depth == 0 and 0 < blocks(dest) <= PASS:
            snd = [h for h in hist(dest, PASS) if h['type'] == 'send']
            if snd:
                kinds = [classify(s['account'], 1) for s in snd]
                if all(k[0] in ('exchange', 'exchange-like') for k in kinds):
                    r = ('exchange-like', 'pass-through to ' + (kinds[0][1] or kinds[0][0]))
                elif all(k[0] == 'merchant' for k in kinds):
                    r = ('merchant', 'via a fresh account to ' + kinds[0][1])
    if depth == 0:
        _cls[dest] = r
    return r


earned, earned_all = collections.defaultdict(float), collections.defaultdict(float)
for e in EVENTS:
    for a, v in e['payees']:
        if e['t'] <= end:
            earned_all[a] += v
        if cut <= e['t'] <= end:
            earned[a] += v
KINDS = ('venue', 'exchange', 'exchange-like', 'merchant', 'seller', 'other')
rows, others, merch = [], [], []
for a in sorted(earned, key=lambda a: -earned[a]):
    out = collections.defaultdict(float)
    n = collections.Counter()
    got = 0.0       # everything the account has ever received, up to the end of the window
    for h in hist(a):
        if h['type'] == 'receive' and int(h['local_timestamp']) <= end:
            got += int(h['amount']) / RAW
        if h['type'] != 'send' or not (cut <= int(h['local_timestamp']) <= end):
            continue
        v = int(h['amount']) / RAW
        if v < DUST:
            n['dust'] += 1
            continue
        k, why = classify(h['account'])
        out[k] += v
        n[k] += 1
        if k == 'other': others.append((v, a, h['account'], why, int(h['local_timestamp'])))
        if k == 'merchant': merch.append((v, a, h['account'], why, int(h['local_timestamp'])))
    bal = int(rpc(action='account_info', account=a).get('balance', 0)) / RAW
    share = min(1.0, earned_all[a] / got) if got else 0.0
    rows.append({'account': a, 'earned': earned[a], 'out': dict(out), 'n': dict(n), 'balance': bal, 'got': got, 'share': share,
                 'group': 'founder' if a in FOUNDER else 'excluded' if a in EXCLUDE else 'waiting' if not got else 'fed' if share >= FED else 'mixed'})

iso = lambda t: datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime('%Y-%m-%d %H:%M')
print(f"payout accounts paid at the venue between {iso(cut)} and {iso(end)} UTC: {len(rows)}; "
      f"their own sends inside the same window, by destination. Read at {iso(int(time.time()))} UTC")


def block(title, R):
    print(f"\n== {title}: {len(R)} accounts, earned {sum(r['earned'] for r in R):.4f} XNO net at the venue in the window")
    for k in KINDS:
        acc = [r for r in R if r['out'].get(k)]
        print(f"   sent to {k:14s} {sum(r['out'].get(k, 0) for r in R):9.4f} XNO in {sum(r['n'].get(k, 0) for r in R):4d} sends by {len(acc):3d} accounts")
    none = [r for r in R if not any(r['out'].values())]
    print(f"   accounts with no send above dust in the window: {len(none)} (earned {sum(r['earned'] for r in none):.4f}, hold {sum(r['balance'] for r in none):.4f} now)")
    print(f"   balance now, all {len(R)} accounts: {sum(r['balance'] for r in R):.4f} XNO")


E = [r for r in rows if r['group'] == 'fed']
M = [r for r in rows if r['group'] == 'mixed']
W = [r for r in rows if r['group'] == 'waiting']
block(f"VENUE-FED ACCOUNTS ({int(FED * 100)}% or more of everything they ever received came from the venue)", E)
block('MIXED WALLETS (other income; their sends cannot be tied to venue earnings)', M)
print(f"\n== NEVER COLLECTED: {len(W)} accounts were paid {sum(r['earned'] for r in W):.4f} XNO in the window and have never published a receive block;"
      f" the Nano waits at their address")
for title, g in (("FOUNDER'S ACCOUNTS", 'founder'), ('EXCLUDED ACCOUNTS', 'excluded')):
    R = [r for r in rows if r['group'] == g]
    if R:  # one line each: they are buyers first, and their other sends are not venue earnings
        print(f"\n== {title}, not in any total above: {len(R)} accounts, earned {sum(r['earned'] for r in R):.4f} XNO net at the venue in the window, "
              f"sent {sum(r['out'].get('venue', 0) for r in R):.4f} XNO to the venue's checkouts")
for title, R in (('VENUE-FED', E), ('MIXED', M)):
    print(f'\n== PER ACCOUNT, {title} (earned in window | venue share of all receipts ever | venue | exchange + exchange-like | merchant | seller | other | balance now)')
    for r in R:
        o = r['out']
        print(f"   {r['account']} {r['earned']:8.4f} | {100 * r['share']:3.0f}% | {o.get('venue', 0):8.4f} | {o.get('exchange', 0) + o.get('exchange-like', 0):8.4f} | "
              f"{o.get('merchant', 0):7.4f} | {o.get('seller', 0):7.4f} | {o.get('other', 0):8.4f} | {r['balance']:9.4f}")
grp = {r['account']: r['group'] for r in rows}
if merch:
    print('\n== SENDS TO MERCHANTS')
    for v, a, d, why, t in sorted(merch, reverse=True):
        print(f"   {v:.6f} XNO {iso(t)} {a} -> {d} {why} [{grp[a]}]")
print('\n== SENDS TO OTHER DESTINATIONS, venue-fed accounts only, largest first (look by hand)')
for v, a, d, why, t in sorted(others, reverse=True)[:40]:
    if grp[a] == 'fed':
        print(f"   {v:9.4f} XNO {iso(t)} {a[:20]}… -> {d} ({why})")
