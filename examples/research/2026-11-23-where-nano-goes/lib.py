"""Shared helpers: local node RPC, paged history. Read-only."""
import json, os, time, urllib.request
RPC = os.environ.get('NANO_RPC', 'http://127.0.0.1:7076')
def rpc(**kw):
    req = urllib.request.Request(RPC, data=json.dumps(kw).encode(), headers={'content-type': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())
def history(account, since_ts, page=2000, cap=400000):
    page = max(1, min(page, cap))
    """Yield history entries newest first until local_timestamp < since_ts (or cap entries)."""
    head = None; n = 0
    while True:
        kw = dict(action='account_history', account=account, count=str(page))
        if head: kw['head'] = head
        r = rpc(**kw)
        h = r.get('history') or []
        if not h: return
        for e in h:
            ts = int(e.get('local_timestamp') or 0)
            if ts and ts < since_ts: return
            n += 1
            e['subtype'] = e.get('type')      # plain mode (30x faster than raw): type is send/receive
            yield e
            if n >= cap: return
        head = r.get('previous')
        if not head: return
