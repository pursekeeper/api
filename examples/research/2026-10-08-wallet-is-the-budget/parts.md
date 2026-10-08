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
