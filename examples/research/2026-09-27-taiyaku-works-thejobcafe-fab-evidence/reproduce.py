"""Public evidence reproduction. Python 3.10+; standard library; GET only.

Usage: python reproduce.py --out fresh-evidence
Downloads third-party source pages locally, never executes their JavaScript,
and never creates accounts, credentials, claims, payments or transfers.
"""
import argparse, collections, concurrent.futures, datetime, hashlib, json, re
import urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from inventory import parse_fab, parse_jc

ALLOWED={'thejobcafe.com','firstagentsbank.com','cdn.firstagentsbank.com'}
def permitted(url):
    parsed=urllib.parse.urlsplit(url)
    if parsed.scheme!='https' or parsed.hostname not in ALLOWED or parsed.username or parsed.password:
        raise ValueError('Not an allowed public source URL')
    return url

class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        permitted(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

class Text(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript'):self.skip+=1
        if tag in ('p','div','li','section','h1','h2','h3','h4','tr','br','pre'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript') and self.skip:self.skip-=1
        if tag in ('p','li','h1','h2','h3','h4','tr','pre'):self.parts.append('\n')
    def handle_data(self,text):
        if not self.skip:self.parts.append(text)
    def value(self):return '\n'.join(re.sub(r'\s+',' ',s).strip() for s in ''.join(self.parts).splitlines() if s.strip())

def capture(source,directory):
    row={'id':source['id'],'url':source['url'],'requested_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'GET','authenticated':False}
    try:
        request=urllib.request.Request(permitted(row['url']),headers={'User-Agent':'TAIYAKU-WORKS-public-research/1.0','Accept':'text/html,application/json,text/plain;q=0.9'},method='GET')
        with urllib.request.build_opener(Redirects()).open(request,timeout=25) as response:
            raw=response.read(4_000_001)
            if len(raw)>4_000_000:raise ValueError('Response exceeds snapshot limit')
            row.update(status=response.status,final_url=response.url,content_type=response.headers.get('Content-Type',''),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
            row['response_headers']={k:v for k,v in response.headers.items() if k.lower() in ('date','content-type','etag','last-modified','cache-control')}
        (directory/(row['id']+'.body')).write_bytes(raw)
        decoded=raw.decode('utf-8','replace')
        if 'html' in row['content_type']:
            parser=Text();parser.feed(decoded);decoded=parser.value()
        (directory/(row['id']+'.text.txt')).write_text(decoded,encoding='utf-8')
    except urllib.error.HTTPError as exc:row.update(status=exc.code,error=str(exc))
    except Exception as exc:row['error']=type(exc).__name__+': '+str(exc)
    return row

def main():
    args=argparse.ArgumentParser(description=__doc__);args.add_argument('--out',type=Path,required=True); options=args.parse_args()
    options.out.mkdir(parents=True,exist_ok=False)
    directory=options.out/'sources';directory.mkdir()
    package=Path(__file__).resolve().parent
    manifest=json.loads((package/'source_manifest.json').read_text(encoding='utf-8'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(lambda s:capture(s,directory),manifest))
    (options.out/'source_manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    byid={r['id']:r for r in rows}; report={'observed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources_requested':len(rows),'errors':[]}
    def body(key):
        if byid[key].get('status')!=200 or 'error' in byid[key]:raise ValueError(key+': source unavailable; not an empty result')
        return (directory/(key+'.body')).read_text(encoding='utf-8')
    try:
        opened=parse_jc(json.loads(body('jc_bounties_open')));all_jc=parse_jc(json.loads(body('jc_bounties_all')))
        payouts=json.loads(body('jc_payouts'))
        if not isinstance(payouts.get('payouts'),list) or type(payouts.get('paid_count'))!=int or len(payouts['payouts'])!=payouts['paid_count']:raise ValueError('Missing/inconsistent payout count')
        if sum(r['price_cents'] for r in payouts['payouts'])!=payouts['total_paid_cents']:raise ValueError('Payout sum mismatch')
        report['thejobcafe']={'open':opened['count'],'all':all_jc['count'],'statuses':dict(collections.Counter(r['status'] for r in all_jc['bounties'])),'funded_flags':sum(r['funding']['escrowed'] for r in all_jc['bounties']),'reported_paid_count':payouts['paid_count'],'reported_paid_cents':payouts['total_paid_cents']}
    except Exception as exc:report['errors'].append(str(exc))
    try:
        fab=parse_fab(body('fab_marketplace')); opened=[r for r in fab['bounties'] if r['status']=='open']
        report['fab']={'count':fab['count'],'status_counts':fab['statusCounts'],'open_payment_types':dict(collections.Counter(r['paymentType'] for r in opened)),'open_ec_advertised':sum(r['rewardEc'] for r in opened),'open_usd_advertised':sum(r['rewardUsd'] for r in opened),'open_escrow_field_count':sum('escrowId' in r for r in opened),'open_escrow_id_count':sum(bool(r.get('escrowId')) for r in opened),'open_posters':len({r['posterId'] for r in opened}),'open_creation_dates':sorted({r['createdAt'][:10] for r in opened})}
        (options.out/'fab_inventory.json').write_text(json.dumps([{k:r.get(k) for k in ('bountyId','title','status','paymentType','rewardEc','rewardUsd','escrowId','createdAt')} for r in fab['bounties']],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    except Exception as exc:report['errors'].append(str(exc))
    quote_results=[]
    brief_quotes=re.findall('“([^”]+)”',(package/'brief.md').read_text(encoding='utf-8'))
    for item in json.loads((package/'quote_register.json').read_text(encoding='utf-8')):
        key=item['source_id']; text_file=directory/(key+'.text.txt')
        quote=brief_quotes[item['brief_quote_index_zero_based']]
        if hashlib.sha256(quote.encode('utf-8')).hexdigest()!=item['quote_sha256']:raise ValueError('Brief quotation and register disagree')
        found=text_file.exists() and quote in text_file.read_text(encoding='utf-8')
        quote_results.append({'source_id':key,'brief_quote_index_zero_based':item['brief_quote_index_zero_based'],'present':found})
        if not found:report['errors'].append('Cited wording unavailable or changed: '+key)
    report['quotes']=quote_results
    try:
        if byid['fab_faq_asset']['url'] not in body('fab_faq'):raise ValueError('FAQ component reference changed; inspect the newly linked official component')
    except Exception as exc:report['errors'].append(str(exc))
    report['documented_market_api_status']=byid['fab_public_market_api'].get('status')
    report['failed_fetches']=[{'id':r['id'],'status':r.get('status'),'error':r.get('error')} for r in rows if r.get('status')!=200 or 'error' in r]
    (options.out/'observations.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='quotes'},ensure_ascii=False,indent=2))
    return 1 if report['errors'] else 0

if __name__=='__main__':raise SystemExit(main())
