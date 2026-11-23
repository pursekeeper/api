import json, sys, time
from lib import rpc, history
import os
ex=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'nanolooker-exchanges.json')))
extra=[{'name':'Nanswap hot wallet','account':'nano_115hp31z6kh5d66pggb15s4mxchqx1aah9jtqbeuhjdwaoqxoxo7o1yzpodk'},
       {'name':'unMineable payout','account':'nano_13egkbp8mi7ff5s5eafx6yoiatr5w6fmn3mpbpbm9gsobxxeput1tq5pyfzm'}]
now=int(time.time()); since=now-30*86400
for s in ex+extra:
    a=s['account']
    info=rpc(action='account_info',account=a)
    if 'error' in info: print(f"{s['name']:28} {info['error']}"); continue
    t0=time.time(); ns=nr=0; vs=vr=0.0; dests=set(); last=None
    for e in history(a, since, cap=60000):
        st=e.get('subtype'); amt=int(e.get('amount') or 0)/1e30
        if st=='send': ns+=1; vs+=amt; dests.add(e.get('account'))
        elif st=='receive': nr+=1; vr+=amt
        last=int(e['local_timestamp'])
    print(f"{s['name']:28} blocks {int(info['block_count']):>9} bal {int(info['balance'])/1e30:>14.2f} | 30d sends {ns:>6} Ӿ{vs:>13.2f} to {len(dests):>6} accts | receives {nr:>6} Ӿ{vr:>13.2f} | oldest read {time.strftime('%m-%d',time.gmtime(last)) if last else '-'} | {time.time()-t0:.1f}s", flush=True)
