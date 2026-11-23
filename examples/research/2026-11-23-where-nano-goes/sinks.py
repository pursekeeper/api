"""Direct inflow of named non-exchange accounts over DAYS (local node, read-only, aggregates only)."""
import json, sys, time, collections
from lib import rpc, history
DAYS=int(sys.argv[1]) if len(sys.argv)>1 else 30
now=int(time.time()); since=now-DAYS*86400
import os
lab=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'labels-blocklattice.json')))
KEEP=('nanogames','pasino','bc.game','luckynano','luckygames','betnano','nano.bet','poker','cwallet','playnano hot wallet #1','tipnano','freenanofaucet','nanswap','wenano','kappture','sellix','put.io','kakele','nanobrowserquest','xnopay','bitrequest','nano.to/faucet','nanobot','2miners','tippy','nano tipbot','viva games','nanopaint','pixelwall','rock paper','coinbattles','usenano','nanomart','nanocafe','yoursixpay','crpay','fyncom','getnano','nano 💧 drop','natrium')
names={a:n for a,n in lab.items() if any(k in n.lower() for k in KEEP)}
names['nano_3iesabenbyb6zg4m5oboysu63pge3ieyskwct7udxfnebu1eix3ery9m8a59']='NanoGPT collection wallet (my match; sweeps are batched)'
names['nano_1gip4yjax4jzyqfpa3f3pzt1fefbbh4w1wt67wgw75wij34qy7yyio9jeuj4']='Subnano fee collector (7.5% / 5%)'
rows=[]
for a,n in names.items():
    try:
        i=rpc(action='account_info',account=a,receivable='true')
        if 'error' in i: continue
        if int(i.get('modified_timestamp',0))<since: rows.append((-1,n,'no block in the window')); continue
        nr=ns=0; vr=vs=0.0; senders=collections.Counter(); dests=set(); t0=time.time(); cut=False; k=0
        for e in history(a, since, cap=60000):
            k+=1; amt=int(e.get('amount') or 0)/1e30
            if e['subtype']=='receive': nr+=1; vr+=amt; senders[e.get('account')]+=amt
            elif e['subtype']=='send': ns+=1; vs+=amt; dests.add(e.get('account'))
        cut = k>=60000
        big=sum(1 for s,v in senders.items() if v>=1)
        rows.append((vr, n, f"blocks {int(i['block_count']):>8} bal {int(i['balance'])/1e30:>10,.0f} recv'able {int(i.get('receivable',0))/1e30:>9,.0f} | in {nr:>6} from {len(senders):>5} accts ({big:>4} sent >=1 XNO) Ӿ{vr:>11,.0f} | out {ns:>6} to {len(dests):>5} accts Ӿ{vs:>11,.0f}{' | CUT at 60k blocks' if cut else ''} | {time.time()-t0:.0f}s"))
    except Exception as ex:
        rows.append((-2,n,f'!! {ex}'))
    print(f"{n[:36]:36} {rows[-1][2]}", flush=True)
json.dump([(n,s) for v,n,s in sorted(rows,key=lambda r:-r[0])], open('sinks.json','w'), indent=0)
