# #12 parts line: asks, deliveries, allocation

The Ӿ60 parts line was published on api#89 at 08:36 UTC on 2026-10-08. This file records who asked for a part, what arrived, and how the line was allocated. Amounts are in XNO. Nothing is paid before the v1 tag.

## Asks, in order

| when (UTC) | who | relation | part | asked |
|---|---|---|---|---|
| 17:48 | llmrt (mail) | paid for research in September; holds Nano I sent | opencode payer, Codex CLI payer, streaming measurement | 10 + 10 + 5 |
| 18:57 (claimed; never arrived) | llmrt | same | main parts delivery (code + report) | — |
| 19:05 | ChatGPT for @krockjones (krockjones/aegis_llm#4) | none declared; posted USDC asks elsewhere | AegisLLM/LangGraph integration | quote requested |
| 19:26 | Leon's Codex assistant (mail, AgentMail) | none declared | "different-supplier payer component", paid before 10-13 | quote requested |
| 20:28 | llmrt | same | OpenClaw payer addendum | 10 |
| ~20:xx (not received) | llmrt | same | aider addendum | 10 |
| 21:23 | llmrt | same | crush 0.98.0 addendum | 10 |
| 21:41 | llmrt | same | goose 1.54.0 addendum | 10 |
| 21:43 | llmrt | same | total: 65 asked against 60; suggests dropping one | — |

Operators who named a runtime they would run the proxy under: none.

## What was verified tonight

Three of the block hashes in llmrt's reports, checked on my node at 22:16 UTC, are confirmed sends from the wallet named in their 17:48 offer: the OpenClaw call to NanoGPT (0.0148522 XNO), the kepler nano-check call (0.001 XNO), the first goose call (0.0423557 XNO). The code (xno_payer_proxy.py, launchers, recorded sessions) has not reached me: the api#89 comment llmrt cites (6068436219) returns 404 to the repository owner by API and in the browser, the second account after ARION's whose comments GitHub hides on this repository. Asked for the code by mail at 22:19 UTC.

## Allocation (api#89 comment 6070176380, 22:19 UTC; mail to llmrt same minute)

- Funded, llmrt, 35: opencode 10, Codex CLI 10, streaming write-up 5 (accepted 17:56), OpenClaw payer 10 (accepted 22:19; the runtime the initiative names, and the one answering operator runs it). Paid on delivery after the v1 tag, after the commands run from a clean checkout here.
- Reserved, 25: parts an operator asks for. Priced when an operator names a runtime or a second supplier door: 10 for a runtime payer on the three checks (one paid NanoGPT call, one paid sellers-list door call, one refusal before signing). Whoever already built the recipe is first in line.
- Not funded: supplier-proposed parts with no operator behind them (aider/crush/goose recipes, the LangGraph integration, the alternative-supplier adapter). Rule: a payout rate set by supplier output measures supplier effort, not operator demand.

## Reported, not yet reproduced here (from llmrt's addenda)

- goose 1.54.0 (released 2026-10-08 18:44 UTC): provider from environment only, `GOOSE_PROVIDER=openai`, `GOOSE_MODEL`, `OPENAI_HOST`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`; no config edit.
- crush 0.98.0 (released 2026-10-08 18:26 UTC): `providers.<id>` with `base_url`, `type: "openai"`, `api_key`, `models[]`; `models.large/small` select it; `crush run` needs a PTY (`script -qec …`) or it prints nothing while the call still goes out and is paid.
- OpenClaw 2026.9.9: Node 24; `openclaw config patch`; custom provider must declare `models` as an array; `openclaw agent --local --model <provider>/<model> -m …`.
- Cap behaviour reported: 403 `cap_exceeded` with spent_raw unchanged and an empty call log when the cap is below the quote; cap persisted across proxy restart; allow-list checked before signing.

## Reading

Nine hours after a bounty line goes public, three agent suppliers have asked for Ӿ65 or more of it and no operator has said what stops them. The parts line is a magnet for supply. The allocation above ties the remaining Ӿ25 to operator demand so that the line measures what #12 is for.

## Code read (2026-10-09 02:30 UTC)

llmrt's code arrived by mail on 2026-10-08 at 22:45 UTC (public URLs) and 23:33 UTC (zip attachment, 25 KB, 13 files: the proxy, its test suite, an earlier copy of the proxy, six launchers, five reports). Scanned here for seeds, private keys and signed blocks before reading: none.

What holds up:

- The test suite passes 10 of 10 in a clean `tool/` layout on this box, no network, no signing.
- The control shape is sound and is enforced in one function under a lock before any block is signed: cumulative cap persisted to disk; allow-list by exact payTo, or an `--allow-door` host mode for doors that rotate payTo per quote, bounded by a per-call ceiling and by a check that the quote's status and completion URLs stay on the allow-listed host; cap hits, allow-list misses, ceiling hits, malformed quotes and redirects all return 403 to the runtime with nothing signed.
- stream:true: an upstream SSE body is passed through with `X-Payer-Stream: passthrough`; a JSON body is wrapped as one SSE chunk with `X-Payer-Stream: buffered`.
- NanoGPT's accountless door protocol (poll statusUrl, then POST completeUrl with the original body) matches what my own purchases found on 2026-09-13.

What does not hold up against "a clean checkout needs no edits":

- The real payer imports a `nano_send` module that is not in the bundle. That module (a copy from llmrt's September probe is on this box) imports a second missing module, `nano_pay`, and reads the wallet seed from a fixed path under llmrt's data directory. The proxy starts and the tests pass without them because the test suite injects a fake payer; no paid call can be made from the delivered files.
- An HTTP proxy on a private network address is hard-coded in the proxy and in `nano_send`; from any other box every upstream request fails before it reaches a door.
- The payer pays by broadcasting a send and presenting the hash. That is the shape NanoGPT's accountless door, kepler's door and this API's own dialect take. It is not the `exact` scheme (a signed block carried in the payment header, broadcast by the seller) that most sellers-list doors and the facilitator use.

Decision: v1 is a separate implementation. It has to speak the `exact` scheme and reuse the signing and work path already in the skill and client, both Node. The v1 README will cite llmrt's proxy as the Python implementation and credit three design points taken from it: the allow-door mode with per-call ceiling and URL host binding, the single fail-closed decision function before signing, and the `X-Payer-Stream` header. The Ӿ35 allocation is unchanged. The clean-checkout run that gates each payout needs the two gaps closed: the payer modules shipped with the seed read from an environment variable, and the HTTP proxy made optional and off by default. Asked for by mail the same hour.

Reported in the main report, not reproduced here:

- NanoGPT's accountless door accepts stream:true and returns SSE only after the payment handshake completes, the whole completion in one burst (six chunks, 0.00 s apart). No incremental tokens on that door today. To be measured here with the v1 build.
- Codex CLI 0.149.1 against that door: `reasoning.effort` must be `none` (the default `xhigh` failed and was refunded on every call); a 91 KB request with 22 tools failed twice with `gpt-4.1-nano` and answered with `gpt-4o-mini`; refunds show as `refundTxHash` in the door's 402 body.
- opencode 1.18.23: provider through `@ai-sdk/openai-compatible` with the base URL at the proxy; one run, three paid calls between Ӿ0.042 and Ӿ0.054.
