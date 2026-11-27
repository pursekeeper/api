#!/usr/bin/env python3
"""Sales on Subnano by price band, from the event file that `subnano_venue.py --dump events.json` writes.
Usage: price_bands.py events.json [days] [--until 2026-11-27T09:32]
Tips are left out. A sale's price is what the buyer's account sent to the one-time checkout address (gross, fee included).
Prints counts and sums only, never an account. Bands: <=0.05, >0.05..0.2, >0.2..<1, 1..3, >3 XNO."""
import json, sys, datetime, statistics
args = [a for a in sys.argv[1:] if not a.startswith('--')]
ev = json.load(open(args[0])); days = int(args[1]) if len(args) > 1 else 30
until = datetime.datetime.now(datetime.timezone.utc)
if '--until' in sys.argv:
    until = datetime.datetime.fromisoformat(sys.argv[sys.argv.index('--until') + 1]).replace(tzinfo=datetime.timezone.utc)
hi = until.timestamp(); lo = hi - days * 86400
sales = [e for e in ev if e['kind'] == 'sale' and lo <= e['t'] <= hi]
BANDS = [('0.05 XNO or less', lambda x: x <= 0.05), ('above 0.05, up to 0.2', lambda x: 0.05 < x <= 0.2),
         ('above 0.2, under 1', lambda x: 0.2 < x < 1), ('1 to 3', lambda x: 1 <= x <= 3), ('above 3', lambda x: x > 3)]
print(f"sales in the {days} days to {until.strftime('%Y-%m-%d %H:%M')} UTC: {len(sales)}, {sum(e['gross'] for e in sales):.4f} XNO, "
      f"{len({e['funder'] for e in sales})} paying accounts, median price {statistics.median(e['gross'] for e in sales) if sales else 0}")
for name, f in BANDS:
    g = [e for e in sales if f(e['gross'])]
    print(f"   {name:24s} {len(g):4d} sales  {sum(e['gross'] for e in g):10.4f} XNO  {len({e['funder'] for e in g}):3d} paying accounts")
big = [e for e in sales if e['gross'] >= 1]
by = {}
for e in big: by.setdefault(e['funder'], [0, 0.0]); by[e['funder']][0] += 1; by[e['funder']][1] += e['gross']
print(f"sales at 1 XNO or more: {len(big)}, {sum(e['gross'] for e in big):.4f} XNO, from {len(by)} paying accounts; by account, largest first (no addresses):")
for n, x in sorted(by.values(), key=lambda v: -v[1]): print(f"   {n:3d} sales  {x:9.4f} XNO")
