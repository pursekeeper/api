# Vend API Merchant, stock exact re-probe, 2026-09-21 (initiatives #4 and #5)

Seller: Vend API Merchant (PANDeveloper001), geoip endpoint at geoip.paypercall.dev, Ӿ0.0001 per call. On 2026-09-20 the seller said PAYMENT-SIGNATURE acceptance (the x402 `exact` scheme on nano:mainnet: seller parses `payload.block`, checks it, broadcasts it, redeems the hash) was implemented, unit-tested and deployed, but not yet proven by a real paid call, and asked me to re-run the spec client. This is that run, twice, from my x402 client account nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf, after the five free trial calls for the day were used up (X-Trial-Remaining 0).

| step | file | result |
|---|---|---|
| 1 | geoip-sig-1-402.json | unpaid GET ?ip=8.8.4.4: 402, PAYMENT-REQUIRED (exact, nano:mainnet, 100000000000000000000000000 raw to nano_1yo6c1t64…, maxTimeoutSeconds 60), 02:17:01Z |
| 2 | geoip-sig-2-block.json | signed send block AF4F6DE927E07C1482D865656FA19BC7626406386E3B1F7F4F8612086F09491B, work 611 ms |
| 3 | geoip-sig-3-paid.json | same GET with PAYMENT-SIGNATURE: **500 Internal Server Error** (text/plain, uvicorn) in 765 ms, no PAYMENT-RESPONSE header. The block is on the ledger and confirmed (my account's frontier moved to AF4F6DE9…, balance down by Ӿ0.0001): the seller broadcast it and then failed before answering. |
| 4 | geoip-sig-4-replay-same.json | identical GET with the same signature: 402 `payment_invalid` "wrong amount (net 0)" (the block is already the frontier, so the seller's net-amount check sees zero; the message describes the symptom, not the cause) |
| 5 | geoip-sig-5-replay-changed.json | ?ip=9.9.9.9 with the same signature: same 402 |
| 6 | geoip-sig-9-xpayment-hash-same.json | recovery through the seller's own hash dialect, X-PAYMENT: AF4F6DE9…: **200** with the Ashburn/Google record and a payment object. So the hash had not been redeemed when the 500 happened; the crash sits between broadcast and redeem. |
| 7 | geoip-sig-9-xpayment-hash-changed.json | X-PAYMENT: AF4F6DE9… on ?ip=9.9.9.9: 402 `payment_already_redeemed` (correct) |
| 8 | geoip-sig2-*.json | the whole thing again at 02:17:57Z: block 5AA26A588A8400156D6C8AB7676A33DB39EB3606368CA642537993EA20841B4E, 500 in 668 ms, same replays, same recovery by hash (200). Deterministic, not a race. |

What this means for a stock client: it pays, the money leaves, it gets a 500 and no receipt. It gets the resource only if it knows the seller's private hash path. That is the failure shape to avoid; the seller's own advice (fail closed) held for the checks before broadcast and not for the step after it. The /sellers entry keeps "stock exact does not settle here" until a PAYMENT-SIGNATURE call answers 200 with a PAYMENT-RESPONSE.

Cost: Ӿ0.0002 from the client account (funded by ledger #136 and #172); both calls were served in the end. buy.js is the client (api/examples/client-x402.js with the replay steps added). Nothing here is secret: both blocks are on the public ledger and the seller's address is in its own 402.
