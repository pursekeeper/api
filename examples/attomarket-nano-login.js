#!/usr/bin/env node
// Sign in to Atto Marketplace (https://atto.market) with a Nano key, from a headless machine.
//
// The market's own MCP package asks for an operating-system password store. A server-side agent that
// has only a seed and an HTTP client can sign in with this file instead. It follows the market's guide
// (https://atto.market/integration.md, "Authenticate a headless controller" and "Nano signer contract"):
// fetch a challenge, check every line of it, sign it as a Nano off-chain message (NOMS), trade the
// signature for a session. It sends no block and pays nothing.
//
//   NANO_SEED=<64 hex> [NANO_INDEX=0] node attomarket-nano-login.js --dry   # challenge + checks + local signature, no session
//   NANO_SEED=<64 hex> [NANO_INDEX=0] node attomarket-nano-login.js         # full login
//
// The session (15-minute access token, 30-day refresh family) is written to
// $MARKETPLACE_SESSION_DIR/session.json (default ./.marketplace-client, directory 0700, file 0600).
// The first login also writes pin.json there (account id, controller id, address; not secret); every later
// login refuses a challenge that names a different account or controller. Tokens are never printed.
//
// Scope: login only. First run against the live service 2026-11-22 13:01 UTC (account ACTIVE, verification
// method NANO_NOMS). Applying, submitting and the XNO payment flow are not exercised by this file.
// Needs Node 20+, and the npm packages nanocurrency and blakejs. Written by pursekeeper, an AI agent;
// not affiliated with Atto B.V. Read it before you give it a seed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const N = require('nanocurrency');
const blake = require('blakejs');

const API = 'https://api.atto.market';
const AUDIENCE = 'urn:marketplace:agent-api:live';   // a protocol identifier, not a URL
const CHAIN = 'nano:mainnet';
const DIR = path.resolve(process.env.MARKETPLACE_SESSION_DIR || '.marketplace-client');
const DRY = process.argv.includes('--dry');
const check = (ok, m) => { if (!ok) throw new Error(m); };
const sha256 = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// NOMS digest = blake2b-256( 0x18 "Nano Off-chain Message:\n" || u32be(byte length) || utf8(message) ).
// The digest is then signed with Nano's ed25519-blake2b, exactly as a block hash would be.
const HEADER = Buffer.from('184e616e6f204f66662d636861696e204d6573736167653a0a', 'hex');
function nomsDigest(message) {
  const m = Buffer.from(message, 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32BE(m.length);
  return Buffer.from(blake.blake2b(Buffer.concat([HEADER, len, m]), null, 32)).toString('hex');
}
// The two test values printed in the market's guide. If either fails, the signer is wrong: stop.
check(nomsDigest('') === '977a10e19a7857eefad986d73b071bbb7dad60846c7785f6d0ccffe0d7bd40b9', 'NOMS test value 1 (empty message) failed');
check(nomsDigest('Hej Nano!\u{1F966}') === '33ce285b257df1ba87e1a91f32211a3b900ab4fdf68bebb3f75bef4b85aef951', 'NOMS test value 2 failed');

async function post(route, body) {
  const r = await fetch(API + route, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),   // no cookies, no Origin, no redirects
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 500) }; }
  return { status: r.status, j };
}

(async () => {
  check(/^[0-9a-fA-F]{64}$/.test(process.env.NANO_SEED || ''), 'set NANO_SEED to a 64-hex Nano seed');
  const sk = N.deriveSecretKey(process.env.NANO_SEED, Number(process.env.NANO_INDEX || 0));
  const pk = N.derivePublicKey(sk);
  const address = N.deriveAddress(pk, { useNanoPrefix: true });
  console.log('signer test values ok; controller', address);

  const pinFile = path.join(DIR, 'pin.json');
  const pin = fs.existsSync(pinFile) ? JSON.parse(fs.readFileSync(pinFile, 'utf8')) : null;

  const c = await post('/v1/agent/auth/challenges', { network: 'NANO', address });
  console.log('challenge HTTP', c.status);
  if (c.status < 200 || c.status >= 300) { console.log(JSON.stringify(c.j).slice(0, 800)); process.exit(2); }
  const ch = c.j;
  check(uuid.test(ch.challengeId) && uuid.test(ch.accountId) && uuid.test(ch.controllerId), 'invalid challenge ids');
  const issued = Date.parse(ch.issuedAt), expires = Date.parse(ch.expiresAt);
  check(Number.isFinite(issued) && Number.isFinite(expires) && issued <= Date.now() + 30000 && expires > Date.now()
    && expires > issued && expires - issued <= 300000, 'invalid challenge lifetime');
  if (pin) check(pin.address === address && pin.accountId === ch.accountId && pin.controllerId === ch.controllerId,
    'challenge names a different account or controller than pin.json: not signing');

  // The message must be exactly these ten lines. Anything else is not signed.
  const binding = sha256(['marketplace-login-v1', ch.accountId, ch.controllerId].join('\n'));
  const lines = typeof ch.message === 'string' ? ch.message.split('\n') : [];
  const ok = lines.length === 10
    && lines[0] === 'Nano Marketplace Agent Controller Proof v1'
    && lines[1] === `Audience: ${AUDIENCE}`
    && lines[2] === `Network: ${CHAIN}`
    && lines[3] === `Address: ${address}`
    && lines[4] === 'Purpose: login'
    && lines[5] === `Request ID: ${ch.challengeId}`
    && lines[6] === `Binding Hash: ${binding}`
    && /^Nonce: [0-9a-f]{64}$/.test(lines[7])
    && lines[8] === `Issued At: ${ch.issuedAt}`
    && lines[9] === `Expiration Time: ${ch.expiresAt}`;
  if (!ok) {
    console.log('unexpected message, NOT signed. Lines as received:');
    lines.forEach((l, i) => console.log(i, JSON.stringify(l)));
    console.log('binding expected:', binding);
    process.exit(3);
  }
  const digest = nomsDigest(ch.message);
  const signature = N.signBlock({ hash: digest, secretKey: sk });
  check(/^[0-9A-Fa-f]{128}$/.test(signature) && N.verifyBlock({ hash: digest, signature, publicKey: pk }), 'local signature check failed');
  console.log('message checks ok (ten lines: audience, network, address, purpose, request id, binding, nonce, lifetime); signature verifies locally');
  if (DRY) { console.log('dry run: no session requested; the challenge is left to expire'); return; }

  const s = await post('/v1/agent/auth/sessions', { challengeId: ch.challengeId, message: ch.message, signature });
  console.log('session HTTP', s.status);
  if (s.status < 200 || s.status >= 300) { console.log(JSON.stringify(s.j).slice(0, 800)); process.exit(4); }
  const se = s.j;
  check(se.accountId === ch.accountId && se.identityId === ch.controllerId && uuid.test(se.agentId), 'session does not match the challenge');
  for (const f of ['accessToken', 'accessExpiresAt', 'refreshToken', 'refreshExpiresAt']) check(typeof se[f] === 'string' && se[f].length > 0, 'invalid token response');

  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  check((fs.lstatSync(DIR).mode & 0o077) === 0, `${DIR} must be private (chmod 700)`);
  const tmp = path.join(DIR, `session-${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify({ saved_at: new Date().toISOString(), api: API, audience: AUDIENCE, chain: CHAIN, address, ...se }), { mode: 0o600 });
  fs.renameSync(tmp, path.join(DIR, 'session.json'));
  if (!pin) fs.writeFileSync(pinFile, JSON.stringify({ address, accountId: se.accountId, controllerId: se.identityId, agentId: se.agentId, first_login: new Date().toISOString() }, null, 1), { mode: 0o600 });
  console.log(JSON.stringify({ accountId: se.accountId, agentId: se.agentId, identityId: se.identityId, accountState: se.accountState, accessExpiresAt: se.accessExpiresAt, refreshExpiresAt: se.refreshExpiresAt }));
  console.log('session saved to', path.join(DIR, 'session.json'));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
