#!/usr/bin/env python3
"""Every Nano checkout at Subnano, counted from the chain alone.

Each sale or tip on the Nano rail passes a one-time checkout account that receives the buyer's
payment and sends two things: the seller's share to the seller's payout account, and the venue's
fee to one fee account (7.5% of a sale, 5% of a tip). So the fee account's receives list every
checkout, and one hop behind each checkout account is the account that funded it.

    python3 subnano_venue.py [days] [--exclude nano_a,nano_b] [--accounts] [--until 2026-11-12T08:13]

Needs a Nano node RPC (NANO_RPC, default http://127.0.0.1:7076); read-only: account_history and
receivable. Prints all-time and last-[days] counts: checkouts, Nano moved, distinct funding
accounts, distinct payout accounts, how concentrated each side is, how many funding accounts are
new in the window. --exclude drops funding accounts (your own, for instance) from a second
summary line. --accounts also prints the funding accounts of the window, largest first. --until
ends the window at a UTC time instead of now, so a published figure can be re-run later.
Each summary also splits sales from tips: how many funding accounts bought at least once, how
many only tipped, and how many payout accounts were paid by tips alone.

Limits. An account is a wallet, not a person: one buyer with two wallets counts twice, and several
buyers withdrawing from one shared account count once. Purchases on the USDC rail and free unlocks
are not on this chain and are not counted. The fee account collects in batches, so its waiting
(receivable) fee sends are walked as well; without them the newest days are missing.
"""
import collections, datetime, json, os, sys, time, urllib.request

RPC = os.environ.get('NANO_RPC', 'http://127.0.0.1:7076')
FEE = 'nano_1gip4yjax4jzyqfpa3f3pzt1fefbbh4w1wt67wgw75wij34qy7yyio9jeuj4'
RAW = 10 ** 30
args = [a for a in sys.argv[1:]]
SHOW = '--accounts' in args
EXCLUDE = set()
if '--exclude' in args:
    EXCLUDE = set(args[args.index('--exclude') + 1].split(','))
DAYS = next((int(a) for a in args if a.isdigit()), 30)
UNTIL = None
if '--until' in args:
    UNTIL = int(datetime.datetime.fromisoformat(args[args.index('--until') + 1]).replace(tzinfo=datetime.timezone.utc).timestamp())


def rpc(**kw):
    req = urllib.request.Request(RPC, data=json.dumps(kw).encode(), headers={'content-type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=60))


def hist(account, cap=4000):
    out, off = [], 0
    while off < cap:
        h = rpc(action='account_history', account=account, count='500', offset=str(off)).get('history') or []
        if not isinstance(h, list) or not h:  # the node answers "" when there is nothing
            break
        out += h
        off += len(h)
        if len(h) < 500:
            break
    return out


waiting = rpc(action='receivable', account=FEE, count='5000', source='true', include_only_confirmed='true').get('blocks') or {}
waiting = [{'type': 'receive', 'account': v['source']} for v in waiting.values()] if isinstance(waiting, dict) else []
events, skipped = [], collections.Counter()
for b in waiting + hist(FEE):
    if b['type'] != 'receive':
        continue
    checkout = b['account']
    h = hist(checkout, cap=20)
    if len(h) > 6:  # a checkout account is used once; anything longer is some other sender to the fee account
        skipped['not a one-time account'] += 1
        continue
    rec = [x for x in h if x['type'] == 'receive']
    snd = [x for x in h if x['type'] == 'send']
    fee = sum(int(x['amount']) for x in snd if x['account'] == FEE)
    pay = [x for x in snd if x['account'] != FEE]
    if not rec or not pay or not fee:
        skipped['not the checkout shape'] += 1
        continue
    gross = sum(int(x['amount']) for x in rec)
    ratio = fee / gross if gross else 0
    kind = 'sale' if abs(ratio - 0.075) < 0.004 else 'tip' if abs(ratio - 0.05) < 0.004 else 'other'
    events.append({'t': int(pay[0]['local_timestamp']), 'funder': rec[0]['account'], 'kind': kind, 'gross': gross / RAW,
                   'payees': [(x['account'], int(x['amount']) / RAW) for x in pay]})

now = int(time.time())
end = UNTIL or now
events = [e for e in events if e['t'] <= end]
cut = end - DAYS * 86400
iso = lambda t: datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime('%Y-%m-%d %H:%M')


def summary(E, title):
    F, V, P = collections.Counter(), collections.defaultdict(float), collections.defaultdict(float)
    S = collections.defaultdict(set)
    for e in E:
        F[e['funder']] += 1
        V[e['funder']] += e['gross']
        for a, v in e['payees']:
            P[a] += v
            S[e['funder']].add(a)
    tot = sum(V.values()) or 1
    k = lambda kind: [e for e in E if e['kind'] == kind]
    print(f"\n== {title}")
    print(f"   {len(E)} checkouts, {sum(V.values()):.4f} XNO: {len(k('sale'))} sales ({sum(e['gross'] for e in k('sale')):.4f}), "
          f"{len(k('tip'))} tips ({sum(e['gross'] for e in k('tip')):.4f}), {len(k('other'))} other")
    print(f"   {len(F)} funding accounts, {len(P)} payout accounts")
    top = sorted(F, key=lambda a: -V[a])
    for n in (1, 2, 3, 5, 10):
        print(f"   largest {n:2d} funding accounts: {sum(V[a] for a in top[:n]):9.4f} XNO ({100 * sum(V[a] for a in top[:n]) / tot:.0f}%), "
              f"{sum(F[a] for a in top[:n])} checkouts")
    print(f"   funding accounts that paid 2 or more payout accounts: {sum(1 for a in F if len(S[a]) >= 2)}; 5 or more: "
          f"{sum(1 for a in F if len(S[a]) >= 5)}; with a single checkout: {sum(1 for a in F if F[a] == 1)}")
    pv = sorted(P.values(), reverse=True)
    if pv:
        print(f"   payout side: net {sum(pv):.4f} XNO; largest 5 accounts {100 * sum(pv[:5]) / sum(pv):.0f}%; "
              f"accounts under 1 XNO: {sum(1 for v in pv if v < 1)} of {len(pv)}; median {pv[len(pv) // 2]:.4f}")
    # sales and tips apart: a sale is a purchase of a priced post, a tip is a gift on a post or comment
    buy = {e['funder'] for e in E if e['kind'] == 'sale'}
    tipf = {e['funder'] for e in E if e['kind'] == 'tip'}
    sv = collections.defaultdict(float)
    for e in k('sale'):
        sv[e['funder']] += e['gross']
    stot = sum(sv.values()) or 1
    stop = sorted(sv.values(), reverse=True)
    print(f"   funding accounts with 1 or more sales: {len(buy)}; tips only: {len(tipf - buy)}; sales only: {len(buy - tipf)}; both: {len(buy & tipf)}")
    print(f"   sales alone: {sum(sv.values()):.4f} XNO from {len(buy)} funding accounts; largest 2 {100 * sum(stop[:2]) / stot:.0f}%, largest 5 {100 * sum(stop[:5]) / stot:.0f}%")
    psale, ptip = collections.defaultdict(float), collections.defaultdict(float)
    for e in E:
        for a, v in e['payees']:
            (psale if e['kind'] == 'sale' else ptip if e['kind'] == 'tip' else collections.defaultdict(float))[a] += v
    only_tip = [a for a in ptip if a not in psale]
    print(f"   payout accounts with 1 or more sales: {len(psale)}; paid by tips only: {len(only_tip)} (net {sum(ptip[a] for a in only_tip):.4f} XNO)")
    return F, V


print(f"fee account receives walked: {len(events)} checkouts (skipped {dict(skipped)}); first {iso(min(e['t'] for e in events))}, "
      f"last {iso(max(e['t'] for e in events))} UTC; fee sends still waiting at the fee account: {len(waiting)}; read at {iso(now)} UTC"
      + (f"; window ends {iso(end)} UTC" if UNTIL else ''))
summary(events, 'ALL TIME')
E30 = [e for e in events if e['t'] >= cut]
F30, V30 = summary(E30, f'LAST {DAYS} DAYS (from {iso(cut)} UTC)')
before = {e['funder'] for e in events if e['t'] < cut}
new = [a for a in F30 if a not in before]
print(f"   funding accounts first seen inside the window: {len(new)} of {len(F30)}; {sum(F30[a] for a in new)} checkouts, "
      f"{sum(V30[a] for a in new):.4f} XNO")
if EXCLUDE:
    E30x = [e for e in E30 if e['funder'] not in EXCLUDE]
    Fx, Vx = summary(E30x, f'LAST {DAYS} DAYS without {len(EXCLUDE)} excluded funding account(s)')
    newx = [a for a in Fx if a not in before]
    print(f"   funding accounts first seen inside the window: {len(newx)} of {len(Fx)}; {sum(Fx[a] for a in newx)} checkouts, "
          f"{sum(Vx[a] for a in newx):.4f} XNO")
print('\n== BY MONTH (checkouts, XNO, funding accounts)')
M = collections.defaultdict(lambda: [0, 0.0, set()])
for e in events:
    m = datetime.datetime.fromtimestamp(e['t'], datetime.timezone.utc).strftime('%Y-%m')
    M[m][0] += 1
    M[m][1] += e['gross']
    M[m][2].add(e['funder'])
for m in sorted(M):
    print(f"   {m}: {M[m][0]:4d} {M[m][1]:9.4f} {len(M[m][2]):3d}")
if SHOW:
    print(f'\n== FUNDING ACCOUNTS, LAST {DAYS} DAYS (XNO, checkouts, first seen inside the window)')
    for a in sorted(F30, key=lambda a: -V30[a]):
        print(f"   {a} {V30[a]:9.4f} {F30[a]:4d} {'new' if a not in before else ''}")
