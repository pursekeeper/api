// Pay-per-call HTTP API paid in Nano. No accounts, no keys.
// Flow: call an endpoint -> 402 with price and address -> send Nano -> retry with
// header X-Nano-Payment: <send block hash>. Overpayment stays as credit on that hash.
// Also speaks x402 v2 (scheme "exact", network "nano:mainnet"): the 402 carries a
// PAYMENT-REQUIRED header, the client retries with PAYMENT-SIGNATURE carrying a signed
// send block, and this process verifies and broadcasts it itself (see x402.js).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { DatabaseSync } = require('node:sqlite');
const site = require('./site');
const cohorts = require('./cohorts');
const x402 = require('./x402');
const facilitator = require('./facilitator');
const nanocurrency = require('nanocurrency');
const { Helper } = require('@x402nano/helper');
const { ExactNanoScheme: X402Reference } = require('@x402nano/exact/facilitator');

const PORT = Number(process.env.PORT || 3000);
const RPC = process.env.NANO_RPC || 'http://127.0.0.1:7076';
const ADDRESS = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';
const PRICE_RAW = 10n ** 27n;                // 0.001 NANO per call
const MAX_CREDIT_RAW = 10n ** 30n;           // ignore sends above 1 NANO (tranches are not credit)
const NOT_BEFORE = Number(process.env.NOT_BEFORE || 1757210000); // unix time service went live
const DATA = path.join(__dirname, 'data', 'credits.json');
const X402_LOG = path.join(__dirname, 'data', 'x402.json');   // settled x402 blocks: hash, payer, amount, resource, at
// Work sources, tried in order: WORK_URLS (comma-separated RPC-style work_generate endpoints,
// e.g. a keyed hosted GPU work server), then the local node. Clients may omit block.work on
// the x402 path (extra.work = 'optional'); we compute it here before broadcasting.
const WORK_URLS = (process.env.WORK_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
// PAID_WORK_URLS: a GPU reached over a private tunnel, tried first. Paid requests (x402 settles
// and paid /v1/work) always get it. Free requests get it too, within a shared budget of
// FREE_GPU_PER_MIN proofs a minute across all callers (default 30), so a first payment through
// here takes about a second instead of the 15 to 60 s the CPU path costs. Callers whose account
// has paid this server before (x402 settle, X-Nano-Payment credit, or a settle through the
// facilitator) skip the shared budget: they have already shown they are a payer, not a flood.
// Over budget, free work falls back to WORK_URLS then the node and the reply says which source.
const PAID_WORK_URLS = (process.env.PAID_WORK_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
// A URL fragment names the source (http://127.0.0.1:3007#cpu-simd); otherwise a loopback host is
// the GPU tunnel and anything else is shown by host. Loopback CPU sources get a longer timeout.
const workName = u => { const url = new URL(u); if (url.hash) return url.hash.slice(1); return /^(127\.|localhost)/.test(url.host) ? 'gpu' : url.host; };
const workLocal = u => /^(127\.|localhost)/.test(new URL(u).host);
const FREE_GPU_PER_MIN = Number(process.env.FREE_GPU_PER_MIN || 30);
const workSources = () => ({ paid: [...PAID_WORK_URLS.map(workName), ...WORK_URLS.map(workName), 'node'],
  free: [...PAID_WORK_URLS.map(u => workName(u) + ' (' + FREE_GPU_PER_MIN + '/min shared; unlimited for accounts that paid before)'), ...WORK_URLS.map(workName), 'node'] });
const freeGpu = { tokens: FREE_GPU_PER_MIN, at: Date.now() };
function takeFreeGpu() {   // token bucket: FREE_GPU_PER_MIN a minute, burst the same
  const now = Date.now();
  freeGpu.tokens = Math.min(FREE_GPU_PER_MIN, freeGpu.tokens + (now - freeGpu.at) / 60_000 * FREE_GPU_PER_MIN); freeGpu.at = now;
  if (freeGpu.tokens < 1) return false;
  freeGpu.tokens -= 1; return true;
}
let gpuDownUntil = 0;   // circuit breaker: after a network failure the GPU is skipped for 60 s (the home machine may be off)
const X402_REQ = x402.requirements({ payTo: ADDRESS, amountRaw: PRICE_RAW, maxTimeoutSeconds: 60, workOptional: true });
const x402Reference = new X402Reference(new Helper({ NANO_RPC_URL: RPC })); // reference verify() runs in addition to ours
const settling = new Set();                                    // block hashes with a "process" call in flight
// Sends that reached this address through a fee-taking checkout wallet paid for something else.
// Subnano post purchases and tips arrive this way: the buyer pays a one-time wallet, which forwards
// our share to us and the platform fee to Subnano's collector. Such a hash is never API credit,
// whoever presents it (the chain is public, so anyone could). Marked from the ledger at startup
// and every ten minutes; wallets with an incomplete history are re-checked next round.
const FEE_COLLECTORS = new Set(['nano_1gip4yjax4jzyqfpa3f3pzt1fefbbh4w1wt67wgw75wij34qy7yyio9jeuj4']);  // Subnano (7.5% sales, 5% tips)
const NO_CREDIT_REASON = 'this send came through a marketplace checkout wallet (a Subnano post purchase or tip); it paid for that, not for API calls';
const noCredit = new Map();   // send hash -> reason
const feeVia = new Map();     // payer account -> did it forward a fee to a known collector?
// Pure: an account_history (newest first, at most PASSTHROUGH-sized) of a wallet that sent to us and to a fee collector.
function feePassthrough(history, fees, address) {
  if (!history || !history.length || history.length > 4) return false;
  const sends = history.filter(x => x.type === 'send');
  return sends.some(x => x.account === address) && sends.some(x => fees.has(x.account));
}
async function markFeePassthroughs() {
  let rows;
  try {
    const db = new DatabaseSync(site.DB_PATH, { readOnly: true });
    try { rows = db.prepare("select counterparty, meta_json from ledger where kind = 'payment_in' and counterparty like 'nano_%'").all(); } finally { db.close(); }
  } catch (e) { console.error('markFeePassthroughs: ledger:', e.message); return; }
  for (const r of rows) {
    let src; try { src = JSON.parse(r.meta_json || '{}').source_hash; } catch { /* no source hash */ }
    if (!src || noCredit.has(src.toUpperCase())) continue;
    if (!feeVia.has(r.counterparty)) {
      let hist;
      try { hist = (await rpc({ action: 'account_history', account: r.counterparty, count: '5' })).history || []; } catch { continue; }   // node unavailable: next round
      const isFee = feePassthrough(hist, FEE_COLLECTORS, ADDRESS);
      if (hist.length >= 3) feeVia.set(r.counterparty, isFee);   // a checkout wallet has three blocks; fewer means it may still be settling
      if (!isFee) continue;
    } else if (!feeVia.get(r.counterparty)) continue;
    noCredit.set(src.toUpperCase(), NO_CREDIT_REASON);
    if (src.toUpperCase() in credits && credits[src.toUpperCase()] !== '0') { credits[src.toUpperCase()] = '0'; save(); }   // credited before the wallet's fee block was visible
  }
}
// Is `account` a checkout wallet (it forwarded a fee to a known collector)? Asked when a hash is
// first presented, so a receipt cannot be spent in the minutes before the ten-minute round sees it.
// A wallet that opened within the last minute with fewer than three blocks may still be settling
// its fee block (it followed our share by 1-3 s in every case so far): look once more after 3 s.
async function checkoutWallet(account) {
  if (feeVia.has(account)) return feeVia.get(account);
  for (let attempt = 0; attempt < 2; attempt++) {
    let hist;
    try { hist = (await rpc({ action: 'account_history', account, count: '5' })).history || []; } catch { return false; }   // node unavailable: the round re-checks
    if (feePassthrough(hist, FEE_COLLECTORS, ADDRESS)) { feeVia.set(account, true); return true; }
    if (hist.length >= 3) { feeVia.set(account, false); return false; }
    const opened = hist.length ? Number(hist[hist.length - 1].local_timestamp) : 0;
    if (attempt || Date.now() / 1000 - opened > 60) return false;   // a short but older account is a real payer
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}
const RAW_PER_NANO = 10n ** 30n;

let credits = {};
try { credits = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch {}
const save = () => fs.writeFileSync(DATA, JSON.stringify(credits));
const stats = { calls_paid: 0, calls_x402: 0, calls_402: 0, started: new Date().toISOString() };
let x402Log = [];
try { x402Log = JSON.parse(fs.readFileSync(X402_LOG, 'utf8')); } catch {}

async function rpc(body) {
  const r = await fetch(RPC, { method: 'POST', body: JSON.stringify(body) });
  return r.json();
}

// work_generate for `hash` at the send threshold via the first source that answers.
// Returns { work, source, ms } or throws with the last error.
const workStats = { generated: 0, by_source: {}, by_tier: {}, last_error: '' };
// tier: 'paid' (GPU, no limit), 'payer' (free call from an account that has paid before: GPU, no
// shared budget), 'free' (GPU while the shared budget lasts), 'free-slow' (budget spent: hosted key, then node).
async function workFor(hash, { timeoutMs = 30_000, paid = false, knownPayer = false } = {}) {
  let tier = paid ? 'paid' : knownPayer ? 'payer' : takeFreeGpu() ? 'free' : 'free-slow';
  const gpuOk = tier !== 'free-slow' && Date.now() >= gpuDownUntil;
  const sources = [...(gpuOk ? PAID_WORK_URLS : []).map(u => ({ name: workName(u), url: u, timeoutMs: paid ? 15_000 : 10_000, gpu: true })),
                   ...WORK_URLS.map(u => ({ name: workName(u), url: u, timeoutMs: workLocal(u) ? Math.max(timeoutMs, 90_000) : timeoutMs })), { name: 'node', url: RPC, timeoutMs: 180_000 }];
  let lastErr = 'no work source';
  for (const src of sources) {
    const t0 = Date.now();
    try {
      const r = await fetch(src.url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'work_generate', hash, difficulty: x402.WORK_THRESHOLD }),
        signal: AbortSignal.timeout(src.timeoutMs) });
      const j = await r.json();
      if (j && j.work) {
        workStats.generated++; workStats.by_source[src.name] = (workStats.by_source[src.name] || 0) + 1;
        workStats.by_tier[tier] = (workStats.by_tier[tier] || 0) + 1;
        return { work: String(j.work).toLowerCase(), source: src.name, ms: Date.now() - t0, tier };
      }
      lastErr = src.name + ': ' + (j && (j.error || j.message) || 'no work in response');
    } catch (e) {
      lastErr = src.name + ': ' + e.message;
      if (src.gpu) { gpuDownUntil = Date.now() + 60_000; workStats.gpu_down_until = new Date(gpuDownUntil).toISOString(); }
    }
    workStats.last_error = lastErr;
  }
  throw new Error(lastErr);
}

// Accounts that have paid this server before, by any route. Free work for their frontier goes
// to the GPU without touching the shared budget. Work over a frontier is only usable by that
// account's owner, so requesting it for someone else's frontier gains an attacker nothing.
const PAYERS = path.join(__dirname, 'data', 'payers.json');
const knownPayers = new Set();
try { for (const a of JSON.parse(fs.readFileSync(PAYERS, 'utf8'))) knownPayers.add(a); } catch {}
for (const e of x402Log) if (e.payer) knownPayers.add(e.payer);
try { for (const e of (JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'facilitator.json'), 'utf8')).settled || [])) if (e.payer) knownPayers.add(e.payer); } catch {}
function rememberPayer(account) {
  if (!account || knownPayers.has(account)) return;
  knownPayers.add(account);
  try { fs.writeFileSync(PAYERS, JSON.stringify([...knownPayers])); } catch {}
}
// Is `hash` the frontier of an account that has paid before? One local block_info; false for
// anything that is not a block on this node (e.g. a public key for an open block).
async function isKnownPayerFrontier(hash) {
  if (knownPayers.size === 0) return false;
  try { const b = await rpc({ action: 'block_info', json_block: 'true', hash }); return !!(b && b.block_account && knownPayers.has(b.block_account)); }
  catch { return false; }
}

// Look up a send block hash and turn it into credit (once).
async function creditFor(hash) {
  if (!/^[0-9A-F]{64}$/i.test(hash)) return { error: 'bad hash' };
  hash = hash.toUpperCase();
  if (noCredit.has(hash)) return { error: noCredit.get(hash) };
  if (hash in credits) return { remaining: BigInt(credits[hash]) };
  const b = await rpc({ action: 'block_info', json_block: 'true', hash });
  if (b.error) return { error: 'block not found on this node yet; wait a second and retry' };
  if (b.confirmed !== 'true') return { error: 'block not confirmed yet; retry shortly' };
  if (b.subtype !== 'send' || b.contents.link_as_account !== ADDRESS)
    return { error: 'not a send to ' + ADDRESS };
  if (Number(b.local_timestamp) < NOT_BEFORE) return { error: 'block predates this service' };
  if (await checkoutWallet(b.block_account)) { noCredit.set(hash, NO_CREDIT_REASON); return { error: NO_CREDIT_REASON }; }
  const amount = BigInt(b.amount);
  if (amount > MAX_CREDIT_RAW) return { error: 'send too large to be a payment; max 1 NANO per hash' };
  credits[hash] = amount.toString();
  save();
  rememberPayer(b.block_account);
  return { remaining: amount };
}

function nano(raw) {   // exact decimal NANO string for a raw amount (no float rounding)
  const r = BigInt(raw); const i = r / RAW_PER_NANO; const f = (r % RAW_PER_NANO).toString().padStart(30, '0').replace(/0+$/, '');
  return f ? i + '.' + f : i.toString();
}

function send(res, code, body, type = 'application/json') {
  const data = typeof body === 'string' ? body : JSON.stringify(body, null, 1);
  res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'access-control-allow-origin': '*',
    'access-control-allow-headers': 'X-Nano-Payment, PAYMENT-SIGNATURE, X-PAYMENT, Content-Type',
    'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Nano-Credit-Remaining-Raw, X-Nano-Payment-Hash' });
  res.end(data);
}

const DESCRIPTIONS = { '/v1/echo': 'returns what you sent', '/v1/fetch': 'fetches a URL and returns the page as plain text', '/v1/hash': 'sha256 of the request body, with server time' };
function hostOf(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || 'pursekeeper.dev').split(',')[0].trim(); }

// x402 v2 PaymentRequired for this request: header value plus the same object for the JSON body.
function x402Required(req, hint) {
  const u = new URL(req.url, 'http://x');
  return x402.paymentRequired({ requirements: X402_REQ, url: 'https://' + hostOf(req) + req.url,
    description: DESCRIPTIONS[u.pathname] || 'pursekeeper.dev paid call', error: hint || 'payment required' });
}

function paymentRequired(res, hint, req) {
  stats.calls_402++;
  const pr = req ? x402Required(req, hint) : null;
  if (pr) res.setHeader(x402.REQUIRED_HEADER, pr.header);
  send(res, 402, {
    error: hint || 'payment required',
    pay_to: ADDRESS,
    price_nano: nano(PRICE_RAW),
    price_raw: PRICE_RAW.toString(),
    how: 'Send at least price_raw to pay_to, then retry with header X-Nano-Payment: <send block hash>. ' +
         'Anything above the price stays as credit on that hash for later calls (max 1 NANO per hash).',
    how_x402: 'Or pay per call with x402: decode the PAYMENT-REQUIRED header (base64 JSON, same as the x402 field below), ' +
              'sign a send block for exactly amount raw to payTo from your current frontier, and retry with header ' +
              'PAYMENT-SIGNATURE: base64({x402Version:2, accepted, payload:{block}}). See /v1/x402 and /examples/client-x402.js.',
    x402: pr ? pr.body : undefined,
    docs: '/'
  });
}

// x402 path: verify the signed send block locally, broadcast it, then serve. The settled
// hash is written to credits.json with zero credit so it can never be presented again
// through the X-Nano-Payment path (a settled x402 block is a confirmed send to us).
async function chargeX402(req, res, headerValue) {
  const d = x402.decodePayment(headerValue);
  if (d.error) return paymentRequired(res, 'x402: ' + d.error, req), false;
  const v = await x402.verify(d.payload, X402_REQ, {
    accountInfo: account => rpc({ action: 'account_info', account, representative: 'true', include_confirmed: 'true' }),
    seen: async h => (h in credits) || settling.has(h),
    reference: x402Reference,
    workGenerate: async hash => (await workFor(hash, { paid: true })).work   // a paying block earns its work
  });
  if (!v.ok) return paymentRequired(res, 'x402: ' + v.reason, req), false;
  settling.add(v.hash);
  let s;
  try { s = await x402.settle(v.block, v.payer, { process: block => rpc({ action: 'process', json_block: 'true', subtype: 'send', block }) }); }
  finally { settling.delete(v.hash); }
  if (!s.success) return paymentRequired(res, 'x402: ' + s.errorReason, req), false;
  credits[s.transaction] = '0';
  if (v.hash !== s.transaction) credits[v.hash] = '0';
  save();
  x402Log.push({ hash: s.transaction, payer: v.payer, amount_raw: PRICE_RAW.toString(), resource: req.url, at: new Date().toISOString(), work_by: v.workBy || 'client' });
  rememberPayer(v.payer);
  try { fs.writeFileSync(X402_LOG, JSON.stringify(x402Log)); } catch {}
  stats.calls_paid++; stats.calls_x402++;
  res.setHeader(x402.RESPONSE_HEADER, x402.settleHeader(s));
  res.setHeader('x-nano-payment-hash', s.transaction);
  return true;
}

// Rate-limited proxy to the node's work_generate, for clients without a work server.
const workHits = new Map();   // ip -> [timestamps]
let workInFlight = 0;
// Free: FREE_WORK_PER_MIN per minute per IP (default 6), GPU while the shared budget lasts.
// Paid (X-Nano-Payment credit hash or an x402 PAYMENT-SIGNATURE at the standard price): no
// per-IP limit, GPU always. A paying x402 block gets its own work computed here too, so an
// agent with Nano but no PoW can buy its first work without doing any.
const FREE_WORK_PER_MIN = Number(process.env.FREE_WORK_PER_MIN || 6);
async function workGenerate(req, res) {
  const paid = !!(req.headers['x-nano-payment'] || x402.paymentHeader(req.headers));
  if (paid) {
    if (!await charge(req, res)) return;
    workStats.paid = (workStats.paid || 0) + 1;
  } else {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const hits = (workHits.get(ip) || []).filter(t => now - t < 60_000);
    // Over the free limit the answer is a normal 402 with PAYMENT-REQUIRED, so an x402 client just pays.
    if (hits.length >= FREE_WORK_PER_MIN) return paymentRequired(res, 'free limit is ' + FREE_WORK_PER_MIN + ' work_generate calls per minute per IP; pay ' + nano(PRICE_RAW) + ' NANO per work (X-Nano-Payment credit or x402 PAYMENT-SIGNATURE) to continue without limit', req);
    hits.push(now); workHits.set(ip, hits);
    if (workHits.size > 10_000) workHits.clear();
  }
  let body;
  try { body = JSON.parse((await readBody(req, 10_000)).toString('utf8') || '{}'); } catch { return send(res, 400, { error: 'body must be JSON {hash}' }); }
  const hash = String(body.hash || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hash)) return send(res, 400, { error: 'hash must be 64 hex characters (your account frontier)' });
  if (workInFlight >= 4) return send(res, 503, { error: 'work server busy; retry in a few seconds' });
  workInFlight++;
  try {
    const knownPayer = !paid && await isKnownPayerFrontier(hash);
    const r = await workFor(hash, { paid, knownPayer });
    logReq(req, { kind: 'work', hash, ok: true, paid, tier: r.tier, source: r.source, ms: r.ms });
    return send(res, 200, { hash, work: r.work, threshold: x402.WORK_THRESHOLD, source: r.source, ms: r.ms, paid, tier: r.tier });
  } catch (e) { logReq(req, { kind: 'work', hash, ok: false, paid, error: e.message }); return send(res, 502, { error: 'work_generate: ' + e.message }); }
  finally { workInFlight--; }
}


// Free payment checks for sellers without a Nano node: is block H a confirmed send of at least
// N raw to address A (/v1/verify), and which confirmed sends to A are still unpocketed
// (/v1/receivable). Read-only against this node; 60 per minute per IP.
const checkHits = new Map();
// Persisted counters for the free checks, so third-party use of /v1/verify and
// /v1/receivable survives restarts and can be cited at review. IPs are stored only as
// short hashes, to count distinct callers without keeping addresses.
const CHECKS_FILE = path.join(__dirname, 'data', 'checks.json');
let checks = { verify: 0, receivable: 0, ips: {}, since: new Date().toISOString() };
try { checks = { ...checks, ...JSON.parse(fs.readFileSync(CHECKS_FILE, 'utf8')) }; } catch {}
// Request log for /v1/work and /v1/process: one JSON line per call, no raw IPs (sha256 prefix
// like checks.json). Exists so a report that says "I did not use pursekeeper.dev for work or
// broadcast" can be checked from here, and so a hosted-runtime run can point at its own line.
const REQ_LOG = path.join(__dirname, 'data', 'requests.jsonl');
function ipKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
}
function logReq(req, entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ip_key: ipKey(req), ...entry });
  try { fs.appendFileSync(REQ_LOG, line + '\n'); } catch {}
}
// Entries whose `hash` or `previous` equals H, newest first, at most `limit`. Reads the whole
// file; fine at the sizes this log sees. Returns [] if the log does not exist yet.
function reqLogFor(hash, limit = 20) {
  let lines = [];
  try { lines = fs.readFileSync(REQ_LOG, 'utf8').split('\n').filter(Boolean); } catch { return []; }
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let e; try { e = JSON.parse(lines[i]); } catch { continue; }
    if (e.hash === hash || e.previous === hash) out.push(e);
  }
  return out;
}
function countCheck(kind, req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const key = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
  checks[kind] = (checks[kind] || 0) + 1;
  checks.ips[key] = (checks.ips[key] || 0) + 1;
  try { fs.writeFileSync(CHECKS_FILE, JSON.stringify(checks)); } catch {}
}
function checkStats() {
  return { verify: checks.verify, receivable: checks.receivable, account_info: checks.account_info || 0, process: checks.process || 0, distinct_ips: Object.keys(checks.ips).length, since: checks.since };
}
function overFreeLimit(req, map, limit) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const hits = (map.get(ip) || []).filter(t => now - t < 60_000);
  if (hits.length >= limit) return true;
  hits.push(now); map.set(ip, hits);
  if (map.size > 10_000) map.clear();
  return false;
}
function minRawOf(u) {
  const raw = u.searchParams.get('min_raw'), n = u.searchParams.get('min_nano');
  if (raw != null) { if (!/^\d{1,40}$/.test(raw)) throw new Error('min_raw must be an integer in raw'); return BigInt(raw); }
  if (n != null) {
    const m = /^(\d+)(?:\.(\d{1,30}))?$/.exec(n); if (!m) throw new Error('min_nano must be a decimal NANO amount');
    return BigInt(m[1]) * RAW_PER_NANO + BigInt((m[2] || '').padEnd(30, '0'));
  }
  return 0n;
}
async function verifyBlock(req, res, u) {
  if (overFreeLimit(req, checkHits, 60)) return send(res, 429, { error: 'limit is 60 checks per minute per IP' });
  countCheck('verify', req);
  const hash = String(u.searchParams.get('hash') || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hash)) return send(res, 400, { error: 'hash must be 64 hex characters (a block hash)' });
  const to = u.searchParams.get('to');
  if (to && !nanocurrency.checkAddress(to)) return send(res, 400, { error: 'to must be a nano_ address' });
  let minRaw; try { minRaw = minRawOf(u); } catch (e) { return send(res, 400, { error: e.message }); }
  const b = await rpc({ action: 'block_info', json_block: 'true', hash });
  if (b.error) return send(res, 404, { hash, found: false, ok: false, error: 'block not found on this node (not broadcast yet, or wrong hash); retry in a second' });
  const amount = BigInt(b.amount || '0');
  const confirmed = b.confirmed === 'true';
  const dest = b.subtype === 'send' ? b.contents.link_as_account : null;
  const reasons = [];
  if (!confirmed) reasons.push('not confirmed yet; retry shortly');
  if (b.subtype !== 'send') reasons.push('not a send block (subtype ' + b.subtype + ')');
  if (to && dest && dest !== to) reasons.push('sent to ' + dest + ', not to ' + to);
  if (minRaw > 0n && amount < minRaw) reasons.push('amount ' + amount + ' raw is below min ' + minRaw + ' raw');
  return send(res, 200, { hash, found: true, ok: reasons.length === 0, reason: reasons.join('; ') || undefined,
    confirmed, subtype: b.subtype, from: b.block_account, to: dest, amount_raw: amount.toString(), amount_nano: nano(amount),
    height: Number(b.height), local_timestamp: Number(b.local_timestamp), checked_at: new Date().toISOString(), node: 'pursekeeper.dev' });
}
async function receivable(req, res, u) {
  if (overFreeLimit(req, checkHits, 60)) return send(res, 429, { error: 'limit is 60 checks per minute per IP' });
  countCheck('receivable', req);
  const account = u.searchParams.get('account') || '';
  if (!nanocurrency.checkAddress(account)) return send(res, 400, { error: 'account must be a nano_ address' });
  let minRaw; try { minRaw = minRawOf(u); } catch (e) { return send(res, 400, { error: e.message }); }
  const r = await rpc({ action: 'receivable', account, count: '100', source: 'true', include_only_confirmed: 'true', threshold: (minRaw > 0n ? minRaw : 1n).toString() });
  if (r.error) return send(res, 502, { error: 'node: ' + r.error });
  const blocks = Object.entries(r.blocks && typeof r.blocks === 'object' ? r.blocks : {}).map(([hash, v]) => ({ hash, amount_raw: String(v.amount), amount_nano: nano(v.amount), from: v.source }));
  const total = blocks.reduce((a, b) => a + BigInt(b.amount_raw), 0n);
  return send(res, 200, { account, count: blocks.length, total_raw: total.toString(), total_nano: nano(total), blocks, confirmed_only: true,
    note: 'confirmed sends to this account that have not been pocketed with a receive block; each is final and spendable once received. Pocketing needs a signed receive block and work (POST /v1/work).', checked_at: new Date().toISOString(), node: 'pursekeeper.dev' });
}

// Free node proxies so an agent with a seed and no node can pocket and spend: account_info
// (frontier, balance, representative, confirmation height) and process (broadcast a signed
// state block). Both read/forward to this node only; 60 per minute per IP, counted like the checks.
async function accountInfo(req, res, u) {
  if (overFreeLimit(req, checkHits, 60)) return send(res, 429, { error: 'limit is 60 checks per minute per IP' });
  countCheck('account_info', req);
  const account = u.searchParams.get('account') || '';
  if (!nanocurrency.checkAddress(account)) return send(res, 400, { error: 'account must be a nano_ address' });
  const r = await rpc({ action: 'account_info', account, representative: 'true', include_confirmed: 'true' });
  if (r.error === 'Account not found') return send(res, 200, { account, found: false, frontier: null, balance_raw: '0', balance_nano: '0',
    representative: null, open: false, note: 'no blocks yet: the first block is an open (previous = 0 * 64, work on the account public key); see /v1/receivable for what it can pocket', node: 'pursekeeper.dev' });
  if (r.error) return send(res, 502, { error: 'node: ' + r.error });
  return send(res, 200, { account, found: true, open: true, ...shapeAccountInfo(r), checked_at: new Date().toISOString(), node: 'pursekeeper.dev' });
}
// Modern nodes (V24+) answer include_confirmed with confirmed_frontier / confirmed_height; older ones with
// confirmation_height_frontier / confirmation_height. Accept both, never invent a value: when neither is
// present, confirmed_frontier is null, confirmation_height is null and confirmed is false.
// (Dalton's item-5 report, 2026-09-11: the old mapping read only the legacy names and returned null on my own node.)
function shapeAccountInfo(r) {
  const pick = (...vals) => { for (const v of vals) if (v !== undefined && v !== null && v !== '') return String(v); return null; };
  const confirmedFrontier = pick(r.confirmed_frontier, r.confirmation_height_frontier);
  const height = pick(r.confirmed_height, r.confirmation_height);
  return { frontier: r.frontier, confirmed_frontier: confirmedFrontier, confirmed: confirmedFrontier !== null && confirmedFrontier === r.frontier,
    balance_raw: String(r.balance), balance_nano: nano(r.balance), confirmed_balance_raw: r.confirmed_balance != null ? String(r.confirmed_balance) : undefined,
    receivable_raw: String(r.receivable ?? r.pending ?? '0'), representative: r.representative, block_count: Number(r.block_count),
    confirmation_height: height !== null && /^\d+$/.test(height) ? Number(height) : null };
}
async function processBlock(req, res) {
  if (overFreeLimit(req, checkHits, 60)) return send(res, 429, { error: 'limit is 60 checks per minute per IP' });
  countCheck('process', req);
  let body;
  try { body = JSON.parse((await readBody(req, 20_000)).toString('utf8') || '{}'); } catch { return send(res, 400, { error: 'body must be JSON {block, subtype?}' }); }
  const block = body.block && typeof body.block === 'object' ? body.block : body;
  const need = ['type', 'account', 'previous', 'representative', 'balance', 'link', 'signature', 'work'];
  const missing = need.filter(k => block[k] == null || block[k] === '');
  if (missing.length) return send(res, 400, { error: 'block is missing ' + missing.join(', ') + ' (a signed state block with work)' });
  if (block.type !== 'state') return send(res, 400, { error: 'only state blocks' });
  const sub = ['send', 'receive', 'open', 'change', 'epoch'].includes(body.subtype) ? body.subtype : undefined;
  const r = await rpc({ action: 'process', json_block: 'true', ...(sub ? { subtype: sub } : {}), block });
  logReq(req, { kind: 'process', hash: r.hash || null, previous: String(block.previous || '').toUpperCase(), account: block.account, subtype: sub || null, ok: !r.error, error: r.error || null });
  if (r.error) return send(res, 400, { ok: false, error: 'node: ' + r.error, hint: 'common causes: wrong previous (use /v1/account_info frontier), balance not exact, work below threshold ' + x402.WORK_THRESHOLD + ' for previous (or the account public key for an open), signature over the wrong fields' });
  return send(res, 200, { ok: true, hash: r.hash, subtype: sub, note: 'broadcast; check confirmation with /v1/verify?hash=' + r.hash, node: 'pursekeeper.dev' });
}

async function charge(req, res) {
  const hash = req.headers['x-nano-payment'];
  if (!hash) {
    const ph = x402.paymentHeader(req.headers);
    return ph ? chargeX402(req, res, ph) : (paymentRequired(res, undefined, req), false);
  }
  const c = await creditFor(hash);
  if (c.error) return paymentRequired(res, c.error, req), false;
  if (c.remaining < PRICE_RAW) return paymentRequired(res, 'credit on this hash is used up', req), false;
  const left = c.remaining - PRICE_RAW;
  credits[hash.toUpperCase()] = left.toString();
  save();
  stats.calls_paid++;
  res.setHeader('x-nano-credit-remaining-raw', left.toString());
  return true;
}

// --- endpoints ---------------------------------------------------------------

function isPrivate(ip) {
  if (net.isIPv6(ip)) return /^(::1$|fc|fd|fe80|::ffff:(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i.test(ip);
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

async function fetchText(urlStr) {
  let u; try { u = new URL(urlStr); } catch { throw new Error('bad url'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('http(s) only');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (addrs.some(a => isPrivate(a.address))) throw new Error('private address refused');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  const r = await fetch(u, { signal: ctl.signal, redirect: 'follow',
    headers: { 'user-agent': 'nano-paid-api/0.1 (+pay-per-call fetch)' } }).finally(() => clearTimeout(t));
  const ct = r.headers.get('content-type') || '';
  let body = await r.text();
  if (body.length > 2_000_000) body = body.slice(0, 2_000_000);
  if (/html/i.test(ct)) {
    body = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }
  return { status: r.status, content_type: ct, url: r.url, text: body.slice(0, 200_000) };
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) reject(new Error('body too large')); else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const DOCS = `Pay-per-call HTTP API, paid in Nano.
(x402 facilitator for exact on nano:mainnet: https://facilitator.pursekeeper.dev  Agent summary: /llms.txt   Public log: /log.json   Other Nano 402 sellers, verified by payment: /sellers.json   Human page: send Accept: text/html)

No account, no API key. Each call costs ${nano(PRICE_RAW)} NANO (${PRICE_RAW} raw).
Run by an AI agent as a public experiment: does software pay software with Nano?

Flow
  1. Call an endpoint. You get HTTP 402 with pay_to and price_raw.
  2. Send at least price_raw NANO to pay_to.
  3. Retry with header  X-Nano-Payment: <hash of your send block>.
     Overpayment stays as credit on that hash (max 1 NANO per hash), so one
     send can cover many calls. Whoever presents the hash first spends the credit.

x402
  The same endpoints also take standard x402 (v2) payments with the Nano scheme
  from @x402nano/exact: scheme "exact", network "nano:mainnet", asset "XNO",
  amount ${PRICE_RAW} raw. The 402 carries a PAYMENT-REQUIRED header (base64
  JSON; the same object is in the body under "x402"). Sign a send block from your
  current frontier for exactly that amount to payTo, and retry with PAYMENT-SIGNATURE: base64 JSON {x402Version: 2,
  accepted, payload: {block}}. This server verifies the block against its own node
  and broadcasts it; the reply carries PAYMENT-RESPONSE with the block hash. No
  external facilitator, no account. The block pays for one call and cannot be
  reused as X-Nano-Payment credit. Work is optional here: the requirements carry
  extra.work = "optional", so omit it or send "0" and this server computes it before
  broadcasting; if you include work it must be valid at the send threshold. Other
  sellers may require it: check their extra.work before generating. Requirements:
  GET /v1/x402. Work, if you want your own: POST /v1/work.

Endpoints
  GET  /api                   this text (also / for non-browser clients)
  GET  /v1/price              price and address (free)
  GET  /v1/stats              paid calls so far (free)
  GET  /v1/credit?hash=H      remaining credit on a hash (free)
  GET  /v1/echo?msg=hi        returns what you sent (paid; for testing your client)
  GET  /v1/fetch?url=U        fetches U and returns the page as plain text (paid)
  POST /v1/hash               sha256 of the request body, with server time (paid)
  GET  /v1/x402               x402 payment requirements for the paid endpoints (free)
  GET  /v1/verify?hash=H&to=A&min_raw=N
                              is block H a confirmed send of at least N raw to nano_ address A?
                              (free, 60/min per IP; for sellers who take Nano and have no node)
  GET  /v1/receivable?account=A&min_raw=N
                              confirmed, unpocketed sends to A with amounts and senders (free, 60/min)
  GET  /v1/account_info?account=A
                              frontier, confirmed_frontier, confirmed (bool), balance, representative,
                              confirmation_height (null if the node gives none) (free, 60/min);
                              found:false with the open-block rule if the account has no blocks
  POST /v1/process {"block":{...state block...},"subtype":"send|receive|open|change"}
  GET  /v1/requests?hash=H   was H (or a block with previous H) worked or broadcast through here? {found, entries}. Free, 60/min
                              broadcast a signed state block through this node (free, 60/min).
                              With /v1/work, /v1/receivable and /v1/verify this is enough to
                              pocket and spend from a seed with no node: /examples/no-node.md
  POST /v1/work  {"hash":H}   work_generate at the send threshold for any hash. Free: 6 per
                              minute per IP, from a GPU (about a second) while a shared budget
                              of 30 free proofs a minute lasts, then CPU sources (10 s or more);
                              the reply's "source" and "ms" say which. Accounts that have paid
                              this server before always get the GPU. With X-Nano-Payment credit
                              or an x402 payment header, ${nano(PRICE_RAW)} NANO per work, GPU,
                              no limit

Example
  curl -s 'https://pursekeeper.dev/v1/fetch?url=https://example.com' \\
       -H 'X-Nano-Payment: YOUR_SEND_BLOCK_HASH'

Client examples: /examples/client.py  /examples/client.js  /examples/client-x402.js
Source: https://github.com/pursekeeper/api   Address: ${ADDRESS}
`;

// Renamed from paynano to pursekeeper on 2026-09-07 (PayNano is an existing tool by alecrios).
// Every *.paynano.dev host redirects to the same path on the matching pursekeeper.dev host.
const OLD_HOST = /(^|\.)paynano\.dev$/i;
function redirectOldHost(req, res) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().split(':')[0];
  if (!OLD_HOST.test(host)) return false;
  const code = (req.method === 'GET' || req.method === 'HEAD') ? 301 : 308;
  res.writeHead(code, { Location: 'https://' + host.replace(OLD_HOST, '$1pursekeeper.dev') + req.url, 'Cache-Control': 'public, max-age=86400' });
  res.end(); return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (redirectOldHost(req, res)) return;
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (await site.handle(req, res, u, send)) return;
    if (await cohorts.handle(req, res, u, send)) return;
    if (await facilitator.handle(req, res, u, send, { rpc, settling })) return;
    if (u.pathname === '/' || u.pathname === '/api') return send(res, 200, DOCS, 'text/plain');
    if (u.pathname.startsWith('/examples/')) {
      const root = path.join(__dirname, 'examples');
      let f = path.resolve(root, '.' + path.posix.normalize('/' + decodeURIComponent(u.pathname.slice('/examples/'.length))));
      if (f !== root && !f.startsWith(root + path.sep)) return send(res, 404, { error: 'no such example' });
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'README.md');
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, { error: 'no such example' });
      return send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain');
    }
    if (u.pathname === '/v1/price') return send(res, 200, { pay_to: ADDRESS, price_raw: PRICE_RAW.toString(), price_nano: nano(PRICE_RAW) });
    if (u.pathname === '/v1/stats') return send(res, 200, { ...stats, checks: checkStats(), credited_hashes: Object.keys(credits).length, x402_settled: x402Log.length,
      x402_work_by_seller: x402Log.filter(e => e.work_by === 'seller').length, work: { ...workStats, free_gpu_budget_per_min: FREE_GPU_PER_MIN, free_gpu_tokens_now: Math.floor(freeGpu.tokens), known_payers: knownPayers.size }, work_sources: workSources() });
    if (u.pathname === '/v1/x402') return send(res, 200, {
      x402Version: x402.X402_VERSION, accepts: [X402_REQ],
      resource: { url: 'https://' + hostOf(req) + '/v1/{echo,fetch,hash}', description: 'pursekeeper.dev pay-per-call API', mimeType: 'application/json' },
      request_header: 'PAYMENT-SIGNATURE (X-PAYMENT also accepted): base64 JSON {x402Version:2, accepted, payload:{block}}',
      response_header: 'PAYMENT-RESPONSE: base64 JSON {success, transaction, network, payer}',
      block_rules: 'state block from your current confirmed frontier; balance = current balance - amount exactly; link = payTo; work optional (extra.work = "optional"): omit it or send "0" and this seller computes it before broadcasting; if you send work it must be valid at ' + x402.WORK_THRESHOLD + ' against previous',
      work: 'POST /v1/work {"hash": "<frontier>"}: 6 per minute per IP free (GPU, about a second, within a shared budget of ' + FREE_GPU_PER_MIN + ' a minute; CPU after that), or pay ' + nano(PRICE_RAW) + ' NANO per work (same headers) with no limit; for sends to anyone else', example: '/examples/client-x402.js', spec: 'https://github.com/x402nano/schemes',
      work_sources: workSources() });
    if (u.pathname === '/v1/work' && req.method === 'POST') return workGenerate(req, res);
    if (u.pathname === '/v1/verify') return verifyBlock(req, res, u);
    if (u.pathname === '/v1/receivable') return receivable(req, res, u);
    if (u.pathname === '/v1/account_info') return accountInfo(req, res, u);
    if (u.pathname === '/v1/process' && req.method === 'POST') return processBlock(req, res);
    if (u.pathname === '/v1/requests' && req.method === 'GET') {
      if (overFreeLimit(req, checkHits, 60)) return send(res, 429, { error: 'limit is 60 checks per minute per IP' });
      const h = String(u.searchParams.get('hash') || '').toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(h)) return send(res, 400, { error: 'hash must be 64 hex characters (a block hash, or the frontier work was asked for)' });
      const entries = reqLogFor(h);
      return send(res, 200, { hash: h, found: entries.length > 0, entries, note: 'every /v1/work and /v1/process call since 2026-09-16 is logged here by hash; absence means pursekeeper.dev was not used for that block' });
    }
    if (u.pathname === '/v1/credit') {
      const c = await creditFor(u.searchParams.get('hash') || '');
      return send(res, c.error ? 400 : 200, c.error ? { error: c.error } : { remaining_raw: c.remaining.toString(), remaining_nano: nano(c.remaining) });
    }
    if (u.pathname === '/v1/echo') {
      if (!await charge(req, res)) return;
      return send(res, 200, { echo: u.searchParams.get('msg') || '', at: new Date().toISOString(),
        notice: 'This endpoint is run by an AI agent (pursekeeper). Paying it regularly? Say who you are at agent@pursekeeper.dev or github.com/pursekeeper/api/issues/1; every payment is public at /log.' });
    }
    if (u.pathname === '/v1/fetch') {
      if (!await charge(req, res)) return;
      try { return send(res, 200, await fetchText(u.searchParams.get('url') || '')); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (u.pathname === '/v1/hash' && req.method === 'POST') {
      if (!await charge(req, res)) return;
      const body = await readBody(req);
      return send(res, 200, { sha256: crypto.createHash('sha256').update(body).digest('hex'), bytes: body.length, at: new Date().toISOString() });
    }
    send(res, 404, { error: 'no such endpoint', docs: '/' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});
if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => console.log('listening on', PORT));
  markFeePassthroughs(); setInterval(markFeePassthroughs, 600_000).unref();
}
module.exports = { shapeAccountInfo, logReq, reqLogFor, REQ_LOG, feePassthrough, FEE_COLLECTORS, checkoutWallet };
