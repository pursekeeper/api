// node --test  (run from api/). isPrivate() decides which addresses a paid /v1/fetch may reach. It is a parsed
// classifier since 2026-09-28: the textual prefix regex before it missed fe80::/10 beyond the literal "fe80", the
// unspecified "::" and IPv4-mapped 169.254/16 (Ops Control HQ, 2026-09-28). Unparseable input is refused.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivate, expand6 } = require('../server');

const PRIVATE = ['10.0.0.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '192.0.0.1', '224.0.0.1',
  '::1', '::', 'fe80::1', 'fe90::1', 'fea0::1', 'febf::1', 'fec0::1', 'fd00::1', 'fc00::1', 'ff02::1',
  '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::', 'not-an-ip'];
const PUBLIC = ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::'];

test('private, loopback, link-local, mapped, NAT64, 6to4 and unparseable addresses are refused', () => {
  for (const ip of PRIVATE) assert.equal(isPrivate(ip), true, ip);
});
test('public unicast addresses, plain and embedded, are allowed', () => {
  for (const ip of PUBLIC) assert.equal(isPrivate(ip), false, ip);
});
test('expand6 gives eight hextets, folding :: and a dotted IPv4 tail, or null', () => {
  assert.deepEqual(expand6('::'), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(expand6('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(expand6('::ffff:1.2.3.4'), [0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  assert.deepEqual(expand6('::1.2.3.4'), [0, 0, 0, 0, 0, 0, 0x0102, 0x0304]);
  assert.deepEqual(expand6('64:ff9b::1.2.3.4'), [0x64, 0xff9b, 0, 0, 0, 0, 0x0102, 0x0304]);
  assert.deepEqual(expand6('fe90::1'), [0xfe90, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(expand6('1:2:3:4:5:6:7:8'), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(expand6('2002:7f00:1::'), [0x2002, 0x7f00, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(expand6('fe80::1%eth0'), [0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  for (const bad of ['1:2:3', '1:2:3:4:5:6:7:8:9', '::1::2', 'zz::1', '::ffff:1.2.3.999', '']) assert.equal(expand6(bad), null, bad);
});
