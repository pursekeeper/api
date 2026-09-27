import collections, csv, json, re
from html.parser import HTMLParser
from pathlib import Path

class PublicPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.capture=False; self.payload=[]; self.card_links=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='script' and attrs.get('id')=='__NUXT_DATA__': self.capture=True
        if tag=='a' and re.fullmatch(r'/marketplace/bty_[a-z0-9-]+',attrs.get('href','')): self.card_links.append(attrs['href'])
    def handle_endtag(self,tag):
        if tag=='script': self.capture=False
    def handle_data(self,text):
        if self.capture:self.payload.append(text)

def parse_fab(html):
    page=PublicPage(); page.feed(html)
    if not page.payload: raise ValueError('FAB public data script missing; do not infer zero')
    pool=json.loads(''.join(page.payload))
    if not isinstance(pool,list): raise ValueError('FAB data script is not an indexed array')
    def resolve(index,trail=()):
        if type(index)!=int or index<0 or index>=len(pool): raise ValueError('Unsupported/missing indexed value')
        if index in trail: raise ValueError('Cycle in public bounty data')
        obj=pool[index]; trail=trail+(index,)
        if isinstance(obj,dict):return {k:resolve(v,trail) for k,v in obj.items()}
        if isinstance(obj,list):
            if obj and isinstance(obj[0],str):
                if obj[0] not in ('Reactive','ShallowReactive','Ref','ShallowRef') or len(obj)!=2:raise ValueError('Unsupported data wrapper')
                return resolve(obj[1],trail)
            return [resolve(v,trail) for v in obj]
        return obj
    matches=[i for i,obj in enumerate(pool) if isinstance(obj,dict) and {'bounties','count','statusCounts'}.issubset(obj)]
    if len(matches)!=1:raise ValueError('Missing or ambiguous bounty catalogue')
    result=resolve(matches[0]); rows=result['bounties']
    if not isinstance(rows,list) or type(result['count'])!=int or result['count']!=len(rows):raise ValueError('Bounty count mismatch')
    required=('bountyId','title','posterId','status','paymentType','rewardEc','rewardUsd','createdAt')
    for row in rows:
        if any(k not in row for k in required):raise ValueError('Missing bounty field: '+str(row.get('bountyId'))+' '+str([k for k in required if k not in row]))
        if any(type(row[k]) not in (int,float) or row[k]<0 for k in ('rewardEc','rewardUsd')):raise ValueError('Invalid reward')
    ids=[row['bountyId'] for row in rows]
    if len(ids)!=len(set(ids)):raise ValueError('Duplicate bounty IDs')
    if set(page.card_links)!={'/marketplace/'+i for i in ids}:raise ValueError('Visible cards and embedded data disagree')
    counts=dict(collections.Counter(row['status'] for row in rows))
    for key,value in counts.items():
        if result['statusCounts'].get(key)!=value:raise ValueError('Status counts disagree')
    return result

def parse_jc(obj):
    if not isinstance(obj,dict) or not isinstance(obj.get('bounties'),list) or type(obj.get('count'))!=int:raise ValueError('JC missing list/count')
    if obj['count']!=len(obj['bounties']):raise ValueError('JC count mismatch')
    for row in obj['bounties']:
        if not isinstance(row.get('funding'),dict) or type(row['funding'].get('escrowed'))!=bool:raise ValueError('JC missing funding flag')
        if not isinstance(row.get('price'),dict) or type(row['price'].get('amount_cents'))!=int:raise ValueError('JC missing price')
    if len({r['id'] for r in obj['bounties']})!=len(obj['bounties']):raise ValueError('JC duplicate IDs')
    return obj

