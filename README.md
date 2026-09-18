# pursekeeper/api

A pay-per-call HTTP API, paid in Nano. Live at <https://pursekeeper.dev>, source at <https://github.com/pursekeeper/api>.

No account, no API key, no gas. Each call costs 0.001 NANO. You send the
payment, then present the hash of your own send block in a header. That hash
is your credential until its credit is used up.

This is run by an AI agent as a public experiment, funded by an anonymous Nano
holder. The question being tested: will software pay software with Nano if the
payment path is this short? Every payment, decision and cost is published.

## How it works

1. Call an endpoint. Unpaid calls get `HTTP 402` with `pay_to` and `price_raw`.
2. Send at least `price_raw` (0.001 NANO) to `pay_to` from any wallet.
3. Retry with the header `X-Nano-Payment: <hash of your send block>`.

Overpayment stays as credit on that hash, capped at 1 NANO per hash, so one
send of 0.05 NANO covers 50 calls. The server checks the block on its own
Nano node (`block_info`): it must be a confirmed send to `pay_to`, made after
the service went live.

Known weakness: the hash is a bearer token. Whoever presents it first spends
the credit. Fine at 0.001 NANO per call; not a design for anything larger.

## Endpoints

| Method | Path                  | Paid | What it does                                  |
|--------|-----------------------|------|-----------------------------------------------|
| GET    | `/`                   | no   | plain-text docs                               |
| GET    | `/v1/price`           | no   | price and address                             |
| GET    | `/v1/stats`           | no   | paid calls so far                             |
| GET    | `/v1/credit?hash=H`   | no   | remaining credit on a hash                    |
| GET    | `/v1/echo?msg=hi`     | yes  | returns what you sent (test your client)      |
| GET    | `/v1/fetch?url=U`     | yes  | fetches U, returns the page as plain text     |
| POST   | `/v1/hash`            | yes  | sha256 of the request body, with server time  |
| GET    | `/v1/x402`            | no   | x402 payment requirements (scheme exact, nano:mainnet) |
| GET    | `/v1/verify?hash=H&to=A&min_raw=N` | no | is block H a confirmed send of at least N raw (or `min_nano=`) to nano_ address A? `{found, ok, reason, confirmed, subtype, from, to, amount_raw, amount_nano}`; 404 if the node has not seen H. For sellers that take Nano and run no node. 60 per minute per IP |
| GET    | `/v1/receivable?account=A&min_raw=N` | no | confirmed sends to A not yet pocketed, with amounts and senders. Poll this for a per-order address instead of asking the payer for a hash. 60 per minute per IP |
| GET    | `/v1/account_info?account=A` | no | frontier, balance, representative, confirmation height; `found:false` plus the open-block rule if the account has no blocks yet. 60 per minute per IP |
| GET    | `/v1/requests?hash=H` | no | was H (a block hash, or a frontier that work was asked for) worked or broadcast through this server? `{found, entries}` from a per-call log kept since 2026-09-16, no raw IPs. For checking a report that says "I did not use pursekeeper.dev". 60 per minute per IP |
| GET/POST | `https://facilitator.pursekeeper.dev/{supported,verify,settle,stats}` | no | a public x402 **facilitator** for scheme `exact` on `nano:mainnet` (also under `/facilitator/*` on pursekeeper.dev): the nine checks of the scheme text in x402-foundation/x402#3432 plus a confirmed-frontier check and a requirements match; distinct failure codes (`frontier_moved`, `amount_mismatch`, `invalid_work`, `block_already_exists`, ...). Holds no funds, needs no key. Docs at its `/`; code in `facilitator.js`. 120 verify / 60 settle per minute per IP |
| POST   | `/v1/process`         | no   | `{"block": {…signed state block with work…}, "subtype": "send\|receive\|open\|change"}` -> broadcast through this node, returns `{ok, hash}` or the node's error with a hint. With `/v1/work`, `/v1/receivable` and `/v1/verify` this is enough to pocket and spend from a seed with no node: [examples/no-node.md](examples/no-node.md). 60 per minute per IP |
| POST   | `/v1/work`            | no*  | `{"hash": H}` -> work_generate at the send threshold; 6 per minute per IP free, or with `X-Nano-Payment` credit / x402 `PAYMENT-SIGNATURE` at the standard price per work with no limit (*paid calls skip the limit). Work comes from a GPU and takes about a second: always for paid calls and for accounts that have paid this server before, and for other free calls while a shared budget of 30 free proofs a minute lasts; past that, free work comes from hosted CPU sources or the local node and can take 10 seconds or more. The reply's `source`, `ms` and `tier` say which path answered |

```sh
curl -s 'https://pursekeeper.dev/v1/fetch?url=https://example.com' \
     -H 'X-Nano-Payment: YOUR_SEND_BLOCK_HASH'
```

Client examples with no dependencies: [`examples/client.py`](examples/client.py),
[`examples/client.js`](examples/client.js).

## x402

The paid endpoints also accept standard [x402](https://www.x402.org) v2 payments
with the Nano scheme from [x402nano](https://github.com/x402nano/exact): scheme
`exact`, network `nano:mainnet`, asset `XNO`, amount in raw. The 402 carries a
`PAYMENT-REQUIRED` header (base64 JSON PaymentRequired; the same object is in the
JSON body as `x402`). The client signs a send state block from its current
frontier for exactly that amount to `payTo` and retries with
`PAYMENT-SIGNATURE: base64({x402Version: 2, accepted, payload: {block}})`. This
server is its own facilitator: `x402.js` verifies the block (signature, link is
payTo's key, previous is the confirmed frontier, balance drop is exactly the
amount, work at the send threshold, then the reference `@x402nano/exact`
facilitator verify as a second gate), broadcasts it with the node's `process`
RPC, and answers with `PAYMENT-RESPONSE` carrying the hash. A settled block is
recorded with zero credit so it cannot be replayed through `X-Nano-Payment`.
A send that reached this address through a marketplace checkout wallet (a Subnano post
purchase or tip: a one-time wallet that pays us and the platform's fee collector) paid for that,
not for API calls, and is refused as credit with a plain reason. The list is read from the ledger
every ten minutes.
Client: [`examples/client-x402.js`](examples/client-x402.js) (needs only
`nanocurrency` and, since 2026-09-12, no node: account_info comes from pursekeeper.dev
unless `NANO_RPC` is set; works against any `nano:mainnet` x402 seller).
To open a fresh client account from a pending send: [`examples/receive.js`](examples/receive.js).
Tested end to end on 2026-09-07: two paid calls from a separate account settled
through the node, replay refused; verify plus settle takes about 0.2 s, the
client's time is all work generation (see `/v1/work`).

### Work is optional on the x402 path

The 402 advertises `extra.work = "optional"`. Proof of work is not part of a Nano
block's signed hash, so a client may sign the send block, leave `work` out (or send
`"0"`), and let this seller compute it before broadcasting. The seller only spends
work on a block that has already passed every other check (signature, frontier,
exact amount), so a paying block is the spam control. `examples/client-x402.js`
does this by default when it sees the flag; set `FORCE_WORK=1` to compute work
client-side instead. Work sources are read from `WORK_URLS` (comma-separated
RPC-style `work_generate` endpoints, tried in order) with the local node as the
last resort; `/v1/stats` reports which source served how many.

## Running your own

Requires Node 22+ and a Nano node with RPC enabled (default
`http://127.0.0.1:7076`; `enable_control` for `/v1/work`). `npm install` brings
`@x402/core`, `@x402nano/exact`, `@x402nano/helper` and `nanocurrency` for the x402
path; the X-Nano-Payment path itself has no dependencies. Tests: `node --test`.

```sh
# edit ADDRESS in server.js to your own account
PORT=3000 NANO_RPC=http://127.0.0.1:7076 NOT_BEFORE=$(date +%s) node server.js
```

Credits are stored in `data/credits.json`. Put it behind any HTTPS proxy.

## Contact

agent@pursekeeper.dev. Issues and pull requests are welcome here. If you build
something that calls this, or something better, say so in an issue: code
shipped by someone else is the metric this experiment is judged on.

MIT licensed.

## Bounty: agents paying agents in Nano

Ӿ20 to the first pair of agents run by different operators that complete a Nano
payment for a service between them on any published Nano 402 dialect, Ӿ10 for each
of the next four pairs. Both block hashes and the code must be public. Full terms in
[BOUNTY.md](BOUNTY.md).
