#!/usr/bin/env python3
"""Recheck the RenX/ANS brief with Python 3.10+ standard library only.

Default: inspect supplied factual snapshots, no network.
--live: public GET only, fresh output directory, no credentials or cookies.
--all-task-pages: additionally inspect every linked RenX detail page.
"""
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path

BASE=Path(__file__).resolve().parent
HOSTS={'renx.openmercury.com','ans-registry.org','api.ans-registry.org'}
URLS={
 'renx_tasks':'https://renx.openmercury.com/tasks/',
 'renx_terms':'https://renx.openmercury.com/terms/',
 'renx_seller':'https://renx.openmercury.com/seller-agreement/',
 'renx_identity':'https://renx.openmercury.com/marketplace/identity-credential-verification/',
 'renx_contracts':'https://renx.openmercury.com/marketplace/pay-for-result-contracts/',
 'renx_hold':'https://renx.openmercury.com/marketplace/payment-hold-release/',
 'renx_tax':'https://renx.openmercury.com/marketplace/tax-payments/',
 'renx_fees':'https://renx.openmercury.com/marketplace/flexible-fee-structure/',
 'ans_home':'https://ans-registry.org/',
 'ans_money':'https://ans-registry.org/docs/money',
 'ans_skill':'https://ans-registry.org/skill.md',
 'ans_activity':'https://ans-registry.org/activity',
 'ans_offers':'https://api.ans-registry.org/v1/offers?limit=100',
 'ans_stats':'https://api.ans-registry.org/v1/analytics/stats',
 'ans_checkpoints':'https://api.ans-registry.org/v1/ledger/checkpoints',
 'ans_openapi':'https://api.ans-registry.org/docs/openapi.json',
 'ans_agents':'https://api.ans-registry.org/v1/agents?limit=100&offset=0&sort=new',
}

def allowed(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or u.hostname not in HOSTS or u.username or u.password:
        raise ValueError('URL outside the fixed public research hosts')
    if u.port not in (None,443):raise ValueError('Unexpected port')

class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        allowed(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

class Text(HTMLParser):
    def __init__(self,main_only=False):
        super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
        self.main_only=main_only;self.active=not main_only
    def handle_starttag(self,tag,attrs):
        if tag=='main':self.active=True
        if tag in ('script','style','noscript'):self.skip+=1
        if self.active and tag in ('p','div','li','h1','h2','h3','br','tr'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript') and self.skip:self.skip-=1
        if self.active and tag in ('p','li','h1','h2','h3','tr'):self.parts.append('\n')
        if tag=='main' and self.main_only:self.active=False
    def handle_data(self,data):
        if self.active and not self.skip:self.parts.append(data)
    def value(self):
        return '\n'.join(re.sub(r'\s+',' ',s).strip() for s in ''.join(self.parts).splitlines() if s.strip())

class Cards(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.rows=[];self.row=None;self.h2=False;self.a=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='li' and 'data-amount' in a:
            self.row={'amount':a['data-amount'],'currency':a.get('data-currency'),
                      'deadline':a.get('data-deadline'),'category':a.get('data-category'),'title':'','url':None}
        if self.row is not None and tag=='h2':self.h2=True
        if self.row is not None and self.h2 and tag=='a':
            self.a=True;self.row['url']=urllib.parse.urljoin(URLS['renx_tasks'],a.get('href',''))
    def handle_data(self,data):
        if self.row is not None and self.a:self.row['title']+=data
    def handle_endtag(self,tag):
        if tag=='a':self.a=False
        if tag=='h2':self.h2=False
        if tag=='li' and self.row is not None:
            self.rows.append(self.row);self.row=None

def validate_rows(rows):
    if not isinstance(rows,list) or not rows:
        raise ValueError('No recognized directory cards: empty/changed page requires review, not an automatic zero')
    if len(rows)>1000:raise ValueError('Unexpectedly large directory; stop for review')
    urls=[]
    for row in rows:
        if not re.fullmatch(r'https://renx\.openmercury\.com/tasks/[0-9a-f-]{36}/',row.get('url','')):
            raise ValueError('Unexpected task URL')
        if not row.get('title') or not row.get('currency') or not row.get('deadline'):
            raise ValueError('Missing task metadata')
        if Decimal(row['amount'])<0:raise ValueError('Negative proposed budget')
        urls.append(row['url'])
    if len(set(urls))!=len(urls):raise ValueError('Duplicate task URLs')

def analyze(stats,offers,checkpoints,rows):
    validate_rows(rows)
    totals=stats['totals']
    for key in ('agents','activeOffers','receipts','confirmedReceipts'):
        if type(totals[key]) is not int or totals[key]<0:raise ValueError('Invalid stats count: '+key)
    volume=int(totals['confirmedCashVolumeMicros'])
    if volume<0:raise ValueError('Invalid cash volume')
    items=offers['offers']
    if not isinstance(items,list) or 'nextCursor' not in offers:raise ValueError('Unexpected offers shape')
    if len({x['id'] for x in items})!=len(items):raise ValueError('Duplicate offer IDs')
    prices=[int(x['priceMicros']) for x in items]
    if any(x<0 for x in prices):raise ValueError('Negative offer price')
    if not isinstance(checkpoints['checkpoints'],list):raise ValueError('Unexpected checkpoint shape')
    return {
       'renx':{'directory_cards_observed':len(rows),'currencies':sorted({r['currency'] for r in rows}),
               'budget_min':str(min(Decimal(r['amount']) for r in rows)),
               'budget_max':str(max(Decimal(r['amount']) for r in rows)),
               'categories':len({r['category'] for r in rows}),
               'funding_verdict':'Human/source review required; budgets and keyword matches are not payment evidence'},
       'ans':{'public_totals':totals,'offers_returned':len(items),'zero_price_offers':sum(p==0 for p in prices),
              'positive_price_offers':sum(p>0 for p in prices),'offer_pagination_complete':offers['nextCursor'] is None,
              'checkpoint_count':len(checkpoints['checkpoints']),'checkpoint_chain_report':checkpoints['chain']},
       'limits':'Public observations only; no account, wallet, payment or payout test. Missing/failed data are not zero.'}

def load_json(path):return json.loads(path.read_text(encoding='utf-8-sig'))

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--live',action='store_true')
    ap.add_argument('--all-task-pages',action='store_true')
    ap.add_argument('--output',type=Path)
    args=ap.parse_args()
    if args.all_task_pages and not args.live:ap.error('--all-task-pages requires --live')
    if not args.live:
        sums=BASE/'SHA256SUMS.txt'
        if sums.exists():
            for line in sums.read_text(encoding='utf-8').splitlines():
                digest,name=line.split('  ',1);p=(BASE/name).resolve()
                if not p.is_relative_to(BASE.resolve()):raise ValueError('Manifest path escapes bundle')
                if hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise ValueError('Hash mismatch: '+name)
        else:raise ValueError('SHA256SUMS.txt missing')
        summary=analyze(load_json(BASE/'raw/ans_stats.json'),load_json(BASE/'raw/ans_offers.json'),
                        load_json(BASE/'raw/ans_checkpoints.json'),load_json(BASE/'renx_inventory.json'))
        print(json.dumps(summary,ensure_ascii=False,indent=2));return 0
    out=args.output or Path('verification-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    out.mkdir(parents=True,exist_ok=False)
    opener=urllib.request.build_opener(Redirects())
    manifest=[]
    def get(key,url):
        allowed(url)
        rec={'id':key,'url':url,'method':'GET','requested_at_utc':dt.datetime.now(dt.timezone.utc).isoformat()}
        try:
            req=urllib.request.Request(url,method='GET',headers={'User-Agent':'TAIYAKU-WORKS-public-research/1.0','Accept':'text/html,application/json,text/plain;q=0.9'})
            with opener.open(req,timeout=35) as response:
                data=response.read(4_000_001)
                if len(data)>4_000_000:raise ValueError('Response limit exceeded')
                if response.status!=200:raise ValueError('Unexpected HTTP status')
                rec.update(status=response.status,final_url=response.url,content_type=response.headers.get('Content-Type'),
                           response_date=response.headers.get('Date'),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
            filename=key+('.json' if 'json' in (rec['content_type'] or '') else '.html' if 'html' in (rec['content_type'] or '') else '.txt')
            (out/filename).write_bytes(data);rec['file']=filename
            return data
        except Exception as e:
            rec['error']=type(e).__name__+': '+str(e)
            raise
        finally:
            manifest.append(rec);(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    try:
        data={k:get(k,v) for k,v in URLS.items()}
        cards=Cards();cards.feed(data['renx_tasks'].decode('utf-8'));validate_rows(cards.rows)
        (out/'renx_inventory.json').write_text(json.dumps(cards.rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        summary=analyze(json.loads(data['ans_stats']),json.loads(data['ans_offers']),json.loads(data['ans_checkpoints']),cards.rows)
        if args.all_task_pages:
            flags=[]
            for i,row in enumerate(cards.rows,1):
                uid=row['url'].rstrip('/').split('/')[-1]
                content=get('task_'+uid,row['url']).decode('utf-8');parser=Text(main_only=True);parser.feed(content)
                txt=parser.value()
                if len(txt)<100:raise ValueError('Task main content not recognized')
                (out/('task_'+uid+'.main.txt')).write_text(txt,encoding='utf-8')
                terms=[line for line in txt.splitlines() if re.search(r'fund|escrow|secured|deposit|payment status|prepaid|reserved|charged|paid',line,re.I)]
                flags.append({'url':row['url'],'candidate_lines':terms,'verdict':'unreviewed'})
                if i%20==0:print(f'Fetched {i}/{len(cards.rows)} task pages',file=sys.stderr)
                time.sleep(0.25)
            (out/'funding_review_candidates.json').write_text(json.dumps(flags,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            summary['renx']['detail_pages_fetched']=len(flags)
        (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2));return 0
    except Exception as e:
        error={'status':'incomplete','error':type(e).__name__+': '+str(e),'meaning':'Unknown, not zero; inspect manifest.json'}
        (out/'ERROR.json').write_text(json.dumps(error,indent=2)+'\n',encoding='utf-8')
        raise

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:
        print('INCOMPLETE: '+type(e).__name__+': '+str(e),file=sys.stderr);sys.exit(1)
