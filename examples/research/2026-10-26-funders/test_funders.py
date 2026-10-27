#!/usr/bin/env python3
"""Offline regression for pursekeeper/api#130: --hist N means N receive rows, not N history blocks.
Runs with no node: the RPC is replaced by a fixture of 8 blocks (5 receives interleaved with 3
send/change blocks). Before the fix, --hist 5 read 5 blocks and found 3 receives."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import funders

A = 'nano_1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
P = 'nano_1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
kinds = ['receive', 'send', 'receive', 'change', 'receive', 'receive', 'send', 'receive']
HIST = [{'type': k, 'account': P if k != 'change' else A, 'amount': '1000000000000000000000000000000',
         'hash': f'{i:064X}', 'local_timestamp': str(1_700_000_000 + i)} for i, k in enumerate(kinds)]

def fake_rpc(**kw):
    if kw['action'] == 'account_history':
        if kw['account'] != A: return {'history': ''}
        off, cnt = int(kw.get('offset', 0)), int(kw['count'])
        return {'history': HIST[off:off + cnt]}
    if kw['action'] == 'account_info':
        return {'error': 'Account not found'}
    raise AssertionError(kw)

funders.rpc = fake_rpc
funders.PAGE = 3   # force paging inside the 8-row fixture

r5, b5, t5 = funders.receives_of(A, 5)
assert len(r5) == 5, (len(r5), 'wanted 5 receives from 8 blocks')
assert [x['type'] for x in r5] == ['receive'] * 5 and not t5
r8, b8, t8 = funders.receives_of(A, 8)
assert len(r8) == 5 and b8 == 8 and not t8, (len(r8), b8, t8)   # history exhausted: 5 is all there are
r2, b2, t2 = funders.receives_of(A, 2)
assert len(r2) == 2 and b2 == 3, (len(r2), b2)                    # one page of 3 blocks covers 2 receives
funders.BLOCK_CAP = 4
r4, b4, t4 = funders.receives_of(A, 5)
assert len(r4) == 2 and b4 == 4 and t4, (len(r4), b4, t4)         # the cap stops it short and says so
assert funders.receives_of(P, 5) == ([], 0, False)                 # unopened account
funders.BLOCK_CAP = 20000
# the repeat-payer counts run over the same five rows
funders.PASS_BLOCKS = 0
import io, contextlib
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    funders.main([A, '--hist', '5', '--json'])
out = json.loads(buf.getvalue())
assert out['summary']['receives_read'] == 5 and out['summary']['blocks_read'] == 8
assert out['summary']['distinct_payer_wallets'] == 1 and out['summary']['repeat_payer_wallets'] == 1
assert sum(1 for r in out['rows'] if r['repeat_by_wallet']) == 4
print('ok: --hist 5 -> 5 receives over 8 blocks; exhaustion, cap and unopened cases hold')
