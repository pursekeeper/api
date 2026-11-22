#!/usr/bin/env python3
"""Which public Nano RPC servers will broadcast a signed block for a host that runs no node?

Sends one read (block_count) and three forms of the node's `process` call to each server, using a block that is
already confirmed on chain. A server that passes the call to its node answers "Old block" (the node knows the block
and does nothing); a server that refuses broadcasting answers something else. Nothing is published and no money moves.

usage: python3 check.py <64-hex hash of any confirmed state block> [node RPC url to read the block from]
"""
import json, sys, datetime, urllib.request, urllib.error

SERVERS = [
    'https://rpc.nano.to',
    'https://node.somenano.com/proxy',
    'https://rainstorm.city/api',
    'https://nanoslo.0x.no/proxy',
    'https://app.natrium.io/api',
    'https://xno-rpc.berrypay.org/proxy',
    'https://www.bitrequest.app:8020',
    'https://pursekeeper.dev/v1/process',   # the author's own route; it takes the same bodies
]
UA = 'public-rpc-broadcast-check (+https://pursekeeper.dev/examples/research/2026-11-22-public-rpc-broadcast/)'

def post(url, body, keep=300):
    data = body if isinstance(body, bytes) else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': UA})
    try:
        r = urllib.request.urlopen(req, timeout=20)
        return [r.status, r.read().decode(errors='replace')[:keep]]
    except urllib.error.HTTPError as e:
        return [e.code, e.read().decode(errors='replace')[:keep]]
    except Exception as e:
        return ['error', str(e)[:120]]

def main():
    h = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else 'https://rpc.nano.to'
    info = json.loads(post(src, {'action': 'block_info', 'hash': h, 'json_block': 'true'}, keep=10000)[1])
    block = info['contents']
    rows = []
    for u in SERVERS:
        own = u.endswith('/v1/process')
        row = {
            'server': u,
            'read': None if own else post(u, {'action': 'block_count'}),
            'object_with_json_block': post(u, {'action': 'process', 'json_block': 'true', 'subtype': 'send', 'block': block}),
            'block_as_json_text': post(u, {'action': 'process', 'subtype': 'send', 'block': json.dumps(block)}),
            'object_without_json_block': post(u, {'action': 'process', 'subtype': 'send', 'block': block}),
            # not valid JSON: the block's text pasted between quotes without escaping
            'body_not_json': post(u, ('{"action":"process","subtype":"send","block":"' + json.dumps(block) + '"}').encode()),
        }
        rows.append(row)
        print(u)
        for k, v in row.items():
            if k != 'server': print('   ', k.ljust(26), v)
    out = {'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'block': h, 'rows': rows}
    json.dump(out, open('result.json', 'w'), indent=1)

if __name__ == '__main__':
    main()
