#!/usr/bin/env python3
"""ISO-week series for the crossover instrument pre-registered in README response 5 (2026-10-02).

    python3 bins.py cohort-YYYY-MM-DD.json [--ledger URL|file] [--out bins-YYYY-MM-DD.json]

Bins are ISO weeks in UTC from the week of 2026-09-07 (W37). Per bin, over the run's unseeded
receipts only: receipt count (primary series) and Ӿ, by route (checkout = attributed through a
pass-through wallet, `via` set; direct = `via` null) and by primary funder, read per receipt from
its own pre-receipt funders (the label with the largest amount: exchange, unlisted = cohort.py's
"other", high-traffic; none = no receive before the send). A separate line counts the
unseeded/prospective sub-label: unseeded at receipt time T with a pursekeeper payment_out to the
attributed payer dated after T (defined in response 2; decidable from the public ledger).
A crossover is only called when the leading route or funder class holds the larger count in two
consecutive bins; this script prints the series, it does not call anything.
"""
import json, sys, collections, datetime as dt, urllib.request
def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
def fetch(src):
    if src.startswith('http'):
        with urllib.request.urlopen(urllib.request.Request(src, headers={'user-agent': 'bins.py'}), timeout=60) as r: return json.load(r)
    return json.load(open(src))
src = sys.argv[1]
doc = fetch(src)
ledger = fetch(arg('--ledger', 'https://pursekeeper.dev/log.json'))
ledger = ledger['ledger'] if isinstance(ledger, dict) else ledger
outs = collections.defaultdict(list)
for r in ledger:
    if r.get('kind') == 'payment_out' and str(r.get('counterparty', '')).startswith('nano_'):
        outs[r['counterparty']].append(r['ts'])
def week(ts):
    y, w, _ = dt.datetime.fromisoformat(ts.replace('Z', '+00:00')).isocalendar(); return f'{y}-W{w:02d}'
def primary(row):
    f = row.get('funders') or []
    if not f: return 'none'
    by = collections.defaultdict(float)
    for x in f:
        l = x['label']; by['exchange' if l.startswith('exchange:') else 'unlisted' if l == 'other' else l] += float(x['amount'])
    return max(by.items(), key=lambda kv: kv[1])[0]
ROUTES = ['checkout', 'direct']; FUNDERS = ['exchange', 'unlisted', 'high-traffic', 'none']
bins = collections.OrderedDict()
def cell(): return {'receipts': 0, 'nano': 0.0, 'payers': set()}
for row in doc['rows']:
    if row['cls'] != 'unseeded': continue
    b = bins.setdefault(week(row['ts']), {'route': {k: cell() for k in ROUTES}, 'funder': {k: cell() for k in FUNDERS}, 'prospective': cell(), 'all': cell()})
    route = 'checkout' if row.get('via') else 'direct'; fun = primary(row)
    for c in (b['route'][route], b['funder'][fun], b['all']):
        c['receipts'] += 1; c['nano'] += float(row['amount']); c['payers'].add(row['attributed'])
    if any(t > row['ts'] for t in outs.get(row['attributed'], [])):
        c = b['prospective']; c['receipts'] += 1; c['nano'] += float(row['amount']); c['payers'].add(row['attributed'])
def pub(c): return {'receipts': c['receipts'], 'nano': round(c['nano'], 6), 'payers': len(c['payers'])}
out = {'source': src, 'generated_at': doc['generated_at'], 'ledger_max_id': doc['ledger_max_id'], 'primary_series': 'receipts',
       'bins': {k: {'all': pub(v['all']), 'route': {r: pub(v['route'][r]) for r in ROUTES}, 'funder': {f: pub(v['funder'][f]) for f in FUNDERS}, 'prospective': pub(v['prospective'])} for k, v in sorted(bins.items())}}
dest = arg('--out', 'bins-' + doc['generated_at'][:10] + '.json')
json.dump(out, open(dest, 'w'), indent=1)
hdr = '| bin | unseeded receipts (Ӿ) | checkout | direct | exchange-primary | unlisted-primary | high-traffic-primary | no funder | prospective |'
print(hdr); print('|' + '---|' * 9)
for k, v in out['bins'].items():
    f = lambda c: f"{c['receipts']} ({c['nano']:g})"
    print(f"| {k} | {f(v['all'])} | {f(v['route']['checkout'])} | {f(v['route']['direct'])} | " + ' | '.join(f(v['funder'][x]) for x in FUNDERS) + f" | {f(v['prospective'])} |")
lead = []
for k, v in out['bins'].items():
    r = max(ROUTES, key=lambda x: v['route'][x]['receipts']); fu = max(FUNDERS, key=lambda x: v['funder'][x]['receipts'])
    lead.append((k, r, fu))
print('leading class per bin (route, funder):', lead)
print('written', dest)
