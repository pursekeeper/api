#!/usr/bin/env python3
"""My own Ed25519 verify (RFC 8032 reference shape) with BLAKE2b-512 in place of SHA-512,
as Nano signs. Written from the RFC, not from the seller's snippet.
Usage: verify_sig.py <free.txt>"""
import hashlib, re, sys, json
p = 2**255 - 19
L = 2**252 + 27742317777372353535851937790883648493
d = -121665 * pow(121666, p - 2, p) % p
def inv(x): return pow(x, p - 2, p)
def recover_x(y, sign):
    if y >= p: return None
    x2 = (y*y - 1) * inv(d*y*y + 1) % p
    if x2 == 0: return None if sign else 0
    x = pow(x2, (p + 3)//8, p)
    if (x*x - x2) % p != 0: x = x * pow(2, (p - 1)//4, p) % p
    if (x*x - x2) % p != 0: return None
    if (x & 1) != sign: x = p - x
    return x
def add(P, Q):
    x1, y1 = P; x2, y2 = Q
    k = d*x1*x2*y1*y2 % p
    return ((x1*y2 + x2*y1) * inv(1 + k) % p, (y1*y2 + x1*x2) * inv(1 - k) % p)
def mul(s, P):
    R = (0, 1)
    while s:
        if s & 1: R = add(R, P)
        P = add(P, P); s >>= 1
    return R
def dec(b):
    y = int.from_bytes(b, 'little'); sign = y >> 255; y &= (1 << 255) - 1
    x = recover_x(y, sign)
    return None if x is None else (x, y)
By = 4 * inv(5) % p; B = (recover_x(By, 0), By)
def verify(pk, sig, msg):
    A = dec(pk); R = dec(sig[:32]); s = int.from_bytes(sig[32:], 'little')
    if A is None or R is None or s >= L: return False
    h = int.from_bytes(hashlib.blake2b(sig[:32] + pk + msg, digest_size=64).digest(), 'little') % L
    return mul(s, B) == add(R, mul(h, A))
AB = "13456789abcdefghijkmnopqrstuwxyz"
def addr_pk(addr):
    body = addr.split('_', 1)[1]; n = 0
    for c in body[:52]: n = n*32 + AB.index(c)
    pk = (n & ((1 << 256) - 1)).to_bytes(32, 'big'); c = 0
    for ch in body[52:]: c = c*32 + AB.index(ch)
    ok = hashlib.blake2b(pk, digest_size=5).digest()[::-1] == c.to_bytes(5, 'big')
    return pk, ok
t = open(sys.argv[1], encoding='utf-8').read()
msg = re.search(r'\n(\{"author_handle".*?\})\n', t).group(1)
sig = re.search(r'\n([0-9a-f]{128})\n', t).group(1)
pkhex = re.search(r'Public Key \(32-byte hex\): ([0-9A-F]{64})', t).group(1)
addr = re.search(r'Nano Signing Address: (nano_[13][0-9a-z]{59})', t).group(1)
pk, ok = addr_pk(addr)
print('address', addr)
print('address checksum ok:', ok, '| pubkey in text equals address key:', pk.hex().upper() == pkhex)
print('signature valid:', verify(pk, bytes.fromhex(sig), msg.encode()))
print('tampered message valid (control, must be False):', verify(pk, bytes.fromhex(sig), msg.replace('"price_xno":"', '"price_xno":"1').encode()))
j = json.loads(msg)
print({k: j[k] for k in ('edition', 'price_xno', 'paid_markdown_bytes', 'paid_markdown_sha256', 'dataset_sha256', 'canonical_url', 'probed_at_utc')})
