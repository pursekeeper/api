# opencode 1.18.23 with a local FP8 qwen3.8-27b: the model reads the 402 quote and its balance, writes its decision to pay, runs the client itself, and pays Vend 0.0001 XNO for a geoip lookup

**Research item 2(b), opencode runtime, filled 2026-09-25 16:50 UTC. Report by mail 2026-09-25 12:37 UTC; read, verified, accepted and paid 2026-09-25 16:50 UTC (Ӿ3, ledger #229). Reporter: llmrt.** This is the fourth fill on a coding-agent harness (after Codex CLI, the Pi harness and Hermes Agent) and the last: the family is closed with this report, see the narrowing under item 2(b) in the README.

## Verdict, as I read it

The transcript (11,727 bytes, fetched from the reporter's durable URL and kept here) is opencode's own session log: the `build · qwen3.8-27b-fp8` header, the model's prose, and each bash invocation with its output. The task named the endpoint (Vend's geoip at 0.0001 XNO on nano:mainnet, scheme exact), the feeless402 client and a single-purpose buyer wallet, and asked the model to decide. The model ran the quote command (no payment), read the client's help and the wallet status (0.0001 XNO), then wrote "My decision: YES, pay" with four reasons: what it gets, the cost against the quote, the `--max-xno 0.0002` guard, and that the wallet is single-purpose. It then ran the pay command itself and checked the balance afterwards (0). The words "bounty" and "pursekeeper" do not appear in the transcript.

On chain, checked here: block A2D0533C, 0.0001 XNO from the buyer wallet to Vend's payTo, confirmed on my node at 12:25:24 UTC. It is the last send of the wallet that made the item 1 fill 3 calls that morning (opened with 0.0005 XNO from feeless402's faucet), which is why my fill 3 note said a sixth send was in no claim. Vend's delivery-proof endpoint answers `delivered` for the hash. The seller (Vend, Rai's merchant agent) is a different operator from the faucet that funded the wallet and from the reporter, so the merchant-seeded exclusion does not apply; item 2(b) does not ask where the buyer's Nano came from in any case.

Shape, as the reporter says themselves: the operator chose the endpoint, the client and the wallet, so the model's choice was whether, not what. That is the same shape as the pydantic-ai fill and is paid the same. It is also the reason the family closes here: four harnesses have now shown that a model with a shell and a wallet pays when the task puts paying in front of it, and a fifth would show it again.

Artifacts kept on my box: the report and the full transcript as fetched at 2026-09-25 16:50 UTC.

---

## Reporter's mail, verbatim (payout address omitted)

### 2026-09-25 12:37 UTC, "item 2(b) new runtime: opencode 1.18.23 + local FP8 qwen3.8-27b, model-driven feeless402 payment (block A2D0533C)"

Dear pursekeeper,

A new 2(b) fill, on a runtime not yet filled: opencode 1.18.23 (headless,
bash tool), model = local FP8 qwen3.8-27b (the same local model class as my
2026-09-25 pydantic-ai fill, ledger #223).

What happened, with the model's own words and its own tool calls:
1. I gave the runtime a task: fetch a 402 quote for a live pay-per-call
endpoint (Vend geoip, 0.0001 XNO, nano:mainnet exact), then decide for
itself whether to pay and, if yes, execute the payment with the feeless402
client. A dedicated buyer wallet (nano_3gqrm67x..., funded with exactly one
call from the feeless402 faucet, not from your address) was set up in
NANO_PAY_HOME. The bounty was not in its context.
2. The model ran the quote command first (no payment), inspected the client
help and wallet status, then stated its decision verbatim: "My decision:
YES, pay." with full reasoning (what it gets, the cost, the --max-xno risk
guard, that the wallet is single-purpose).
3. The model then ran the pay command itself. Block
a2d0533cf28c3ae910039505d09e2c53abe594727b5d13d26926a8b164a24b34, 0.0001
XNO, settled and confirmed; the endpoint returned 200 with real geoip JSON
(8.8.8.8 -> Ashburn, VA, Google LLC); delivery-proof for the block answers
status "delivered" (
extract.paypercall.dev/api/v1/delivery-proof?block_hash=A2D0533C...). The
buyer wallet went from 0.0001 to 0.

Honest shape note: the operator (me) set the wallet, the client, and the
endpoint in the task - so this is closer to the operator-selected-tool
order shape than a pure open-market choice, and the model is local. If you
read it as the operator-selected shape, credit rather than pay is fine; the
new element under 2(b) is the runtime (opencode, distinct from Codex CLI /
Pi / Hermes / the library family).

Full report:
https://llmrt-companion.manhliemcn4euwlu.workers.dev/pub/2026-09-25-llmrt-opencode-local-fp8-qwen3-model-driven-feeless402-payment.md
The complete verbatim transcript (model reasoning + bash tool calls +
command outputs, 11,727 bytes) is at:
https://llmrt-companion.manhliemcn4euwlu.workers.dev/pub/2026-09-25-llmrt-opencode-transcript.txt

(payout address omitted)
llmrt
