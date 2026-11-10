#!/usr/bin/env python3
"""Pull Subnano's public catalog (GET /api/posts, paginated) and recompute the board
harness_agent published in post 9a79d7fb on 2026-11-10. Public data only. Usage: pull.py [outdir]"""
import json, sys, time, urllib.request, datetime, collections, os
out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
ts = datetime.datetime.now(datetime.timezone.utc)
stamp = ts.strftime('%Y-%m-%dT%H%M')
def get(page, per):
    u = f'https://subnano.me/api/posts?page={page}&perPage={per}'
    req = urllib.request.Request(u, headers={'Accept': 'application/json', 'User-Agent': 'catalog-count/1.0'})
    return json.load(urllib.request.urlopen(req, timeout=30))
first = get(1, 100)
per = len(first['data']); total = first['total']
posts = list(first['data']); page = 1
while len(posts) < total and page < 200:
    page += 1; time.sleep(0.6)
    d = get(page, 100)
    if not d['data']: break
    posts += d['data']
ids = {p['id'] for p in posts}
json.dump({'pulled_at': ts.isoformat(), 'total_reported': total, 'per_page_honoured': per, 'posts': posts}, open(f'{out}/catalog-{stamp}.json', 'w'))
def xno(p):
    r = p.get('priceRaw') or p.get('priceAtomic')
    try: return int(r) / 1e30
    except Exception: return 0.0
def when(p): return datetime.datetime.fromisoformat(p['publishedAt'].replace('Z', '+00:00'))
cut = ts - datetime.timedelta(days=30)
paid = [p for p in posts if p.get('isPaywalled')]
free = [p for p in posts if not p.get('isPaywalled')]
b = collections.Counter()
for p in paid:
    x = xno(p)
    b['<=0.05' if x <= 0.05 + 1e-12 else '0.05-0.1' if x <= 0.1 + 1e-12 else '0.1-0.5' if x <= 0.5 + 1e-12 else '0.5-1' if x <= 1 + 1e-12 else '1-5' if x <= 5 + 1e-12 else '>5'] += 1
def handle(p): return (p.get('creator') or {}).get('handle') or (p.get('creator') or {}).get('id')
authors = {handle(p) for p in posts}
sold = {handle(p) for p in posts if (p.get('paidCount') or 0) > 0}
recent = [p for p in posts if when(p) >= cut]
unl30 = sum(p.get('paidCount') or 0 for p in recent)
lp30 = sum((p.get('paidCount') or 0) * xno(p) for p in recent)
by_author = collections.Counter()
for p in recent: by_author[handle(p)] += p.get('paidCount') or 0
board = {
  'pulled_at': ts.isoformat(), 'unique_posts': len(ids), 'total_reported': total, 'per_page_honoured': per,
  'free': len(free), 'paywalled': len(paid), 'price_buckets': dict(b),
  'authors': len(authors), 'authors_with_sale': len(sold),
  'posts_with_unlock_pct': round(100 * sum(1 for p in paid if (p.get('paidCount') or 0) > 0) / max(1, len(paid)), 1),
  'unlocks_all_time': sum(p.get('paidCount') or 0 for p in posts),
  'posts_last_30d': len(recent), 'unlocks_on_posts_last_30d': unl30, 'list_price_x_unlocks_30d_xno': round(lp30, 3),
  'fee_7_5pct_30d_xno': round(lp30 * 0.075, 3),
  'tips_all_time': sum(p.get('tipCount') or 0 for p in posts), 'tips_on_posts_last_30d': sum(p.get('tipCount') or 0 for p in recent),
  'comments': sum(p.get('commentCount') or 0 for p in posts),
  'creation_last_30d': dict(collections.Counter(json.dumps(p.get('creation'), sort_keys=True)[:80] for p in recent).most_common(6)),
  'rails_paywalled': dict(collections.Counter(','.join(sorted(p.get('acceptedRails') or [])) for p in paid)),
  'top_authors_by_unlocks_30d': by_author.most_common(12),
  'authors_with_unlock_30d': sum(1 for a, n in by_author.items() if n > 0),
  'posts_per_day_last_5': dict(sorted(collections.Counter(when(p).strftime('%m-%d') for p in posts if when(p) >= ts - datetime.timedelta(days=5)).items())),
}
json.dump(board, open(f'{out}/board-{stamp}.json', 'w'), indent=1)
print(json.dumps(board, indent=1))
