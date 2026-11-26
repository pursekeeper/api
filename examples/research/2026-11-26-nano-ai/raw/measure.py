#!/usr/bin/env python3
"""Measure Nano AI (xnoapp.onrender.com): one call per case, every reply logged whole.
usage: python3 research/nanoai/measure.py <outdir> <case> [<case> ...]
Needs secrets/nanoai.env in the environment (set -a; . secrets/nanoai.env; set +a)."""
import json, os, sys, time, urllib.request, urllib.error, random
BASE = os.environ['NANOAI_BASE']; U = os.environ['NANOAI_USER']; P = os.environ['NANOAI_PASS']
HDR = {'x-username': U, 'x-password': P, 'Content-Type': 'application/json', 'User-Agent': 'pursekeeper-measure/1 (+https://pursekeeper.dev)'}
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
LOG = open(os.path.join(out, 'measure.jsonl'), 'a')
def call(path, body=None, method=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=HDR, method=method or ('POST' if data else 'GET'))
    t = time.time()
    try:
        r = urllib.request.urlopen(req, timeout=timeout); code = r.status; raw = r.read(); hdrs = dict(r.headers)
    except urllib.error.HTTPError as e:
        code = e.code; raw = e.read(); hdrs = dict(e.headers)
    except Exception as e:
        return {'code': None, 'error': repr(e), 'secs': round(time.time() - t, 2)}
    try: js = json.loads(raw)
    except Exception: js = {'_raw': raw[:400].decode('utf8', 'replace')}
    return {'code': code, 'secs': round(time.time() - t, 2), 'json': js, 'headers': {k: v for k, v in hdrs.items() if k.lower() in ('content-type', 'x-ratelimit-remaining', 'retry-after')}}
def credits():
    r = call('/balance'); return (r.get('json') or {}).get('credits')
def chat(case, chat_id, model, message, note=''):
    before = credits()
    r = call('/chat', {'chatId': chat_id, 'model': model, 'message': message})
    after = credits()
    js = r.get('json') or {}
    msgs = (js.get('chats') or {}).get(chat_id) or []
    last = msgs[-1] if msgs else {}
    rec = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'case': case, 'chat_id': chat_id, 'model_asked': model, 'prompt_chars': len(message),
           'code': r.get('code'), 'secs': r.get('secs'), 'credits_before': before, 'credits_after': after,
           'reply_keys': sorted(js.keys()), 'last_msg_keys': sorted(last.keys()), 'n_msgs_in_chat': len(msgs),
           'answer': last.get('content') if last.get('role') == 'assistant' else None, 'error': js.get('error') or r.get('error') or js.get('_raw'), 'note': note}
    LOG.write(json.dumps(rec) + '\n'); LOG.flush()
    a = rec['answer']
    print(f"[{case}] {model} {rec['code']} {rec['secs']}s credits {before}->{after} msgs {len(msgs)} keys {rec['reply_keys']} lastkeys {rec['last_msg_keys']} prompt {len(message)} chars")
    print('   answer:', (repr(a[:700]) + (f' …(+{len(a)-700})' if a and len(a) > 700 else '')) if a else None, '| error:', rec['error'])
    return rec
MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'qwen/qwen3.8-27b']
def filler(n_chars, secret, where='start'):
    random.seed(7)
    words = ['ledger', 'harbour', 'window', 'orange', 'signal', 'paper', 'river', 'engine', 'market', 'candle', 'thread', 'garden']
    body = ' '.join(random.choice(words) for _ in range(n_chars // 7))
    s = f'The pass phrase is {secret}.'
    return (s + ' ' + body) if where == 'start' else (body[:len(body)//2] + ' ' + s + ' ' + body[len(body)//2:])
stamp = str(int(time.time()))
for case in sys.argv[2:]:
    if case == 'four':
        for m in MODELS:
            chat('four', 'Session_four_' + stamp + m.split('/')[1], m, 'What is 17 times 23? Then, on a new line, say which model you are and who made you, if you know. Keep it under 40 words.')
    elif case == 'unlisted':
        chat('unlisted', 'Session_unl_' + stamp, 'llama-3.3-70b-versatile', 'Reply with the single word: ready', 'a Groq model id that is not on the page')
        chat('unlisted', 'Session_unl2_' + stamp, 'no-such/model-xyz', 'Reply with the single word: ready', 'a made-up model id')
    elif case == 'memory':
        cid = 'Session_mem_' + stamp
        chat('memory-1', cid, MODELS[0], 'Remember this number for later: 48217. Reply only: noted.')
        chat('memory-2', cid, MODELS[0], 'What number did I ask you to remember? Reply with the number only.')
    elif case.startswith('ctx'):
        n = int(case[3:]) * 1000   # ctx16 = 16,000 characters, about 4,000 tokens
        secret = 'quartz-' + stamp[-4:]
        chat(case, 'Session_' + case + '_' + stamp, MODELS[1], filler(n, secret, 'middle') + '\n\nSomewhere in the text above is a sentence giving a pass phrase. Reply with the pass phrase only.', f'secret {secret} in the middle of {n} chars')
    elif case == 'long-out':
        chat('long-out', 'Session_out_' + stamp, MODELS[0], 'Write the integers from 1 to 600 separated by single spaces, nothing else.', 'about 1,700 output tokens if complete')
    elif case == 'empty':
        chat('empty', 'Session_empty_' + stamp, MODELS[0], '', 'empty message')
    else:
        print('unknown case', case)
print('credits now', credits())
