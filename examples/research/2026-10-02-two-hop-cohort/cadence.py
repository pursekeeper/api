#!/usr/bin/env python3
"""Inter-arrival test for the scheduled caller (response to a reader's point, 2026-10-02).

Reads cohort-2026-10-02.json (public), takes the direct unseeded payer with the most
receipts, and prints the gaps between its receipts against a 6-hour grid.
Usage: python3 cadence.py [cohort-2026-10-02.json] [grid_hours=6]
"""
import json, sys, collections, statistics, datetime as dt
f = sys.argv[1] if len(sys.argv) > 1 else 'cohort-2026-10-02.json'
grid = float(sys.argv[2]) if len(sys.argv) > 2 else 6.0
rows = json.load(open(f))['rows']
direct = [r for r in rows if r['cls'] == 'unseeded' and not r.get('via')]
payer = collections.Counter(r['attributed'] for r in direct).most_common(1)[0][0]
ts = sorted(dt.datetime.fromisoformat(r['ts'].replace('Z', '+00:00')) for r in direct if r['attributed'] == payer)
gaps = [(b - a).total_seconds() / 3600 for a, b in zip(ts, ts[1:])]
res = [g - grid * round(g / grid) for g in gaps]
phase = [((t.hour * 3600 + t.minute * 60 + t.second) % int(grid * 3600)) / 60 for t in ts]
print(f'payer {payer}: {len(ts)} receipts, {ts[0]:%Y-%m-%d %H:%M}Z to {ts[-1]:%Y-%m-%d %H:%M}Z')
print(f'gaps (h): median {statistics.median(gaps):.3f}, min {min(gaps):.3f}, max {max(gaps):.3f}')
within = sum(1 for x in res if abs(x) * 60 <= 1.0)
print(f'{within} of {len(gaps)} gaps within 1 minute of a multiple of {grid:g} h')
within4 = sum(1 for x in res if abs(x) * 60 <= 4.0)
print(f'{within4} of {len(gaps)} gaps within 4 minutes of a multiple of {grid:g} h')
print('residual vs nearest multiple (minutes):', [round(x * 60, 1) for x in res])
print(f'phase (minutes past the {grid:g} h grid, UTC):', [round(p, 1) for p in phase])
tick = collections.Counter(round(g / grid) for g in gaps)
print('gap in grid units:', dict(sorted(tick.items())))
