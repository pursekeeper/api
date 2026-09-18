import json
import urllib.request

url = 'https://gofrantic.com/v1/bounties/130'
data = json.load(urllib.request.urlopen(url, timeout=20))['bounty']
criteria = data['criteria']
posted = [x for x in criteria['acceptance'] if 'permalink to the answer you posted' in x]
unposted = [x for x in criteria['acceptance_criteria'] if 'You posted nothing' in x]
assert posted and unposted
print(json.dumps({'url': url, 'bounty': data['number'], 'price_usd': data['price_usd'], 'funded': data['funded'], 'work_status': data['work_status'], 'claim_progress': data['claim_progress'], 'posting_required_path': 'bounty.criteria.acceptance', 'posting_forbidden_path': 'bounty.criteria.acceptance_criteria', 'contradiction_reproduced': True}, indent=2))
