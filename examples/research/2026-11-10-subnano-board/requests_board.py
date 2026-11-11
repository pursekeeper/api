#!/usr/bin/env python3
"""Subnano Requests board, counted from the venue's public API. Standard library only.

  python3 requests_board.py [--json OUT.json] [--base https://subnano.ai] [--exclude handle]...

Reads GET /api/requests?status=all and GET /api/requests/{id} for each brief (no token).
Prints, per requester: briefs, proposals received, proposals the requester paid for
(the venue's own `requesterPayment.purchased` flag), and the list price and tips of those.
Prints, per proposer: proposals made and how many were paid.
--exclude marks handles (for example the venue operator's accounts, or your own) so the
totals are also shown without them.

What this cannot see: who funded a purchase. A paid flag says the requester's account
bought the post; the Nano may be an operator's, an allowance, or the requester's own
earnings. For that, trace the seller's payout account (subnano_funders.py, same folder).
"""
import argparse, json, sys, time, urllib.request
from collections import defaultdict

def get(url):
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'requests-board/1 (research script)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def amt(x):
    return (float(x['amount']), x['currency']) if x else (0.0, None)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='https://subnano.ai')
    ap.add_argument('--json')
    ap.add_argument('--exclude', action='append', default=[])
    a = ap.parse_args()
    items, off = [], 0
    while True:
        d = get(f'{a.base}/api/requests?status=all&limit=50&offset={off}')
        items += d.get('items') or []
        off += len(d.get('items') or [])
        if not d.get('items') or off >= (d.get('total') or 0):
            break
    details = []
    for it in items:
        details.append(get(f"{a.base}/api/requests/{it['id']}"))
        time.sleep(0.6)
    req_stats = defaultdict(lambda: {'kind': None, 'briefs': 0, 'proposals': 0, 'paid': 0, 'xno': 0.0, 'usdc': 0.0, 'tips_xno': 0.0})
    prop_stats = defaultdict(lambda: {'kind': None, 'made': 0, 'paid': 0, 'xno': 0.0})
    rows = []
    for d in details:
        r = d['request']; h = r['author']['handle']; s = req_stats[h]
        s['kind'] = r['author'].get('authorKind'); s['briefs'] += 1
        for p in d.get('proposals') or []:
            ph = p['author']['handle']; ps = prop_stats[ph]
            ps['kind'] = p['author'].get('authorKind'); ps['made'] += 1; s['proposals'] += 1
            pay = p.get('requesterPayment') or {}
            price, cur = amt((p.get('post') or {}).get('price'))
            tip, tcur = amt(pay.get('tipped'))
            if pay.get('purchased'):
                s['paid'] += 1; ps['paid'] += 1
                if cur == 'XNO': s['xno'] += price; ps['xno'] += price
                elif cur == 'USDC': s['usdc'] += price
            if tip and tcur == 'XNO': s['tips_xno'] += tip
            rows.append({'request': r['id'], 'requester': h, 'requester_kind': s['kind'], 'proposal': p['id'], 'proposer': ph,
                         'proposer_kind': ps['kind'], 'price': price, 'currency': cur, 'purchased': bool(pay.get('purchased')),
                         'purchased_at': pay.get('purchasedAt'), 'tip_xno': tip if tcur == 'XNO' else 0.0, 'proposed_at': p.get('createdAt')})
    print(f"Subnano Requests board at {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}: {len(details)} briefs, "
          f"{len(rows)} proposals from {len(prop_stats)} accounts, {sum(1 for x in rows if x['purchased'])} paid by the requester")
    print('\nrequester            kind   briefs proposals paid  XNO list  XNO tips  USDC')
    for h, s in sorted(req_stats.items(), key=lambda kv: -(kv[1]['xno'] + kv[1]['tips_xno'])):
        mark = ' (excluded below)' if h in a.exclude else ''
        print(f"{h:20s} {str(s['kind']):6s} {s['briefs']:6d} {s['proposals']:9d} {s['paid']:4d} {s['xno']:9.2f} {s['tips_xno']:9.2f} {s['usdc']:5.2f}{mark}")
    tot = sum(s['xno'] + s['tips_xno'] for s in req_stats.values())
    rest = {h: s for h, s in req_stats.items() if h not in a.exclude}
    rtot = sum(s['xno'] + s['tips_xno'] for s in rest.values())
    print(f"\nall requesters: {tot:.2f} XNO (list price plus tips) over {sum(s['paid'] for s in req_stats.values())} paid proposals")
    if a.exclude:
        print(f"without {', '.join(a.exclude)}: {rtot:.2f} XNO over {sum(s['paid'] for s in rest.values())} paid proposals from "
              f"{sum(1 for s in rest.values() if s['paid'])} paying requesters ({sum(1 for s in rest.values() if s['paid'] and s['kind']=='agent')} agents)")
    a2a = [x for x in rows if x['purchased'] and x['requester_kind'] == 'agent' and x['proposer_kind'] == 'agent' and x['requester'] not in a.exclude]
    print(f"agent requester paid agent proposer (requester not excluded): {len(a2a)} purchases, {sum(x['price'] for x in a2a if x['currency']=='XNO'):.2f} XNO")
    for x in a2a:
        print(f"   {x['purchased_at'][:16]}Z {x['requester']} -> {x['proposer']} {x['price']} {x['currency']}")
    print('\nproposer             kind   made paid  XNO list')
    for h, s in sorted(prop_stats.items(), key=lambda kv: (-kv[1]['paid'], -kv[1]['made'])):
        print(f"{h:20s} {str(s['kind']):6s} {s['made']:4d} {s['paid']:4d} {s['xno']:9.2f}")
    unpaid = [h for h, s in req_stats.items() if s['proposals'] and not s['paid']]
    if unpaid:
        print('\nrequesters with proposals and no purchase: ' + ', '.join(unpaid))
    if a.json:
        json.dump({'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'base': a.base, 'requests': details, 'rows': rows}, open(a.json, 'w'), indent=1)
        print(f'\nsaved {a.json}')

if __name__ == '__main__':
    main()
