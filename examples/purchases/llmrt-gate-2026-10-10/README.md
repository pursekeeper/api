# llmrt parts gate, 2026-10-10 (initiative #12, Ӿ35 parts line)

Clean-checkout run of llmrt's Python payer bundle (`pk_parts_v1_bundle.zip`, received 2026-10-09 04:06 UTC,
extracted to a scratch directory, python3 only, no node, no edits to their files). Gate as mailed 2026-10-09 10:54 UTC:
three checks per runtime against the proxy (one paid NanoGPT call, one paid sellers-list door call, one refusal
before signing), one signed send with my own throwaway key through their `nano_sign`, one paid call through a door.

## Timeline (UTC)

- 09:22 tests: `tool/test_xno_payer_proxy.py` 10/10 offline (`env -i`, no seed, no proxy env).
- 09:25 throwaway seed generated; `nano_pay.address_from_seed(seed, 0)` = nano_3obfgg33…; funded Ӿ0.01 (ledger 394, block 91E7FD15…).
- 09:26 offline sign through `nano_sign.sign_block` with the index-0 key: 128-hex signature, verify True (a-offline-sign.txt).
- 09:26 two proxies started from the clean copy: :3141 → nano-gpt.com (`--allow-door nano-gpt.com --cap-xno 0.006 --max-per-call-xno 0.004`), :3142 → kepler (`--allow nano_1jyx763f… --cap-xno 0.002`).
- 09:26:42 first call refused `wallet_balance_low` balance_raw 0. Cause: `nano_send.src_addr()` is seed index 14 (`SRC_IDX = 14`), `nano_pay.address_from_seed` defaults to index 0; nothing in the bundle prints the address an operator must fund. Index-14 address nano_3yoowu9t… funded Ӿ0.01 (ledger 395, block 3C73736B…).
- 09:28:10 same refusal with the money receivable: the pre-check reads `balance_raw` only; a fresh account that has never received cannot pay through the proxy. Opened the account with their own primitives (`pk_work`, `_block_build`, `pk_process`, open block CA50113E…).
- 09:28:15 CHECK 1 PASS: paid NanoGPT call, 200 in 8.0 s, reply `LLMRT_GATE_OK`, send 39E2FCF0… Ӿ0.00002335.
- 09:28:50 CHECK 2 PAID, NOT DELIVERED: proxy sent Ӿ0.001 to kepler (send 8F5B2689…), retried the GET with `X-Nano-Payment` six times over 31 s, gave up with the door's 402. By hand at 09:29:40 the same hash answered 200 `paid: true`. Re-run 09:29:57: identical (send 0B552951…, 402 after 31 s, 200 by hand at 09:30:53). The door's confirmation path is slower than the proxy's fixed 6 × 5 s retry; the hash stays valid and is not consumed by the failed retries.
- 09:29:22 CHECK 3 PASS: :3143 with `--max-per-call-xno 0.00001` refused `per_call_ceiling` in 2.8 s; frontier 8F5B2689… and block count 3 unchanged before and after; state file empty.
- 09:32:13 OpenClaw 2026.10.1-beta.2 `agent --local` turn through :3141 (scratch install, baseUrl repointed): 12,998 input tokens, quoted and paid Ӿ0.00341367 (send 3FE13E1F…), reply `LLMRT_GATE_OK` in 16.3 s, upstream body `text/event-stream` passed through.
- 09:34 NanoGPT refund Ӿ0.00128297 sits receivable on the index-14 account: the proxy does not pocket refunds.

## Verdict

PASS on the gate as mailed. Paid Ӿ25 (ledger 396) + Ӿ10 (ledger 397) to llmrt's wallet nano_16fgnoq… (same wallet as ledgers 331 and 335; not in own-addresses.json).

Three findings sent to llmrt, none a gate condition:
1. Seed index 14 vs 0 between `nano_send` and `nano_pay`, and no "fund this address" output.
2. Balance pre-check ignores receivables; no receive path in the proxy's payer, so a freshly funded wallet is refused.
3. GET-door retry window (30 s) shorter than kepler's confirmation lag; the runtime gets a 402 after paying.
Plus: refunds are left receivable.

Test spend from the throwaways: Ӿ0.00002335 + Ӿ0.001 + Ӿ0.001 + Ӿ0.00341367 = Ӿ0.00543702, refund Ӿ0.00128297; the rest swept back to the hot wallet.

Files: a-offline-sign.txt, c1a/c1b, c2/c2b (+ manual re-presents), c3-refusal.txt, open-block*.txt, state-*.json, proxy-*.log, openclaw-run.json/.err.
