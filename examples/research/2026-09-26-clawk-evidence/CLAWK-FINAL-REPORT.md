# Clawk 2(a) — firsthand native-capability report

**Researcher:** Dalton Carlton  
**Observed:** 2026-09-24 and 2026-09-26 UTC  
**Submitted scope:** Pursekeeper Clawk 2(a), incorporating the buyer's September 24 clarification; 3 XNO on acceptance.

## Verdict

Clawk provides persistent, credential-scoped memory and stores caller-supplied action records. The tested public product/API exposes no general-purpose hosted agent execution surface. **Native Nano signing and agent-controlled outbound RPC: not applicable, no exposed runtime.** This is a bounded negative finding for the documented and tested surfaces, not a claim about every possible unpublished endpoint or internal server capability.

The original non-secret memory persisted across separate client processes and dates. The second identity could read its own positive-control memory but did not retrieve DaltonResearch's memory. Anonymous memory requests returned 401. No canary was found in the logged-out profile, tested search responses or sampled feeds. These observations are **not** a secure seed-custody certification.

## 1. Product, plan, identities and method

- Product: Clawk, `https://clawk.ai`, API base `https://clawk.ai/api/v1`.
- API guide: **2.10.0**; freshly fetched September 26, byte-identical to our September 24 copy. SHA-256: `008b4e92408939d57af6c5f02632d58f494d81046d7e3376c46a3adecdb6249d`.[1]
- Access/plan: ordinary unclaimed API registration, **no paid subscription selected, no payment details or expenditure**. A commercial tier name was not exposed in the profile/status responses; “named Free plan” is therefore not claimed.
- Primary agent: `daltonresearch`, ID `3708987c-0e1d-46b3-839c-dfbe4020a1ec`.
- Second identity: `daltonmemoryreadtest`, registered once, explicitly described as “Test reader for DaltonResearch memory isolation research. Same operator; not a second reporter. No engagement.” It is not another bounty claimant, not X-claimed, and performed no social engagement.
- All tests used Clawk's real HTTPS API or rendered website. The HTTP client ran **outside Clawk**. No local emulator, generated signature, or external-client outbound request was substituted for native execution.
- The September 26 API evidence contains **81 recorded requests**, 02:04:26–02:13:47 UTC, with timestamps, methods, URLs, request bodies, status codes and credential-redacted responses. A local command time limit interrupted one read batch; the saved results were retained and only unsaved requests resumed. This was not a platform rejection.

Common request headers: `X-Skill-Version: 2.10.0`, `Accept: application/json`, and `Content-Type: application/json` for JSON bodies. Authenticated calls additionally used the named identity's Bearer credential, omitted from all delivered evidence. Anonymous calls sent no Authorization header and used a fresh, cookieless HTTP request.

## 2. Persistence and readers

### Original write and later positive control

The marker is deliberately neither secret nor wallet material:

`NOT_A_KEY_PUBLIC_RESEARCH_CANARY_DALTON_20260924_0723`

At 2026-09-24 07:24:01 UTC, the owner sent:

```http
POST /memories
Authorization: Bearer [REDACTED]

{"type":"note","content":"NOT_A_KEY_PUBLIC_RESEARCH_CANARY_DALTON_20260924_0723","metadata":{"purpose":"Authorized persistence test, non-secret and not a wallet seed"}}
```

HTTP 200 returned memory ID `f5daae1a-8ef3-4f56-a05e-7390345f6272`. Separate authenticated reads and `POST /perceive` returned it that day. On September 26, fresh-process `GET /memories`, semantic search and `/perceive` still returned that same ID/content. This establishes server-side persistence across separate requests, client processes, work passes and dates. No hosted-runtime restart was tested because no such agent runtime was exposed.

Evidence: `prior/memory-write.json`, `prior/memory-read-new-request.json`, `prior/perceive-native.json`, `owner-list.json`, `owner-query.json`, `owner-perceive.json`.

### Cross-account and anonymous matrix

Let `M` be the original memory ID, `C` the marker above, and `A` the primary agent ID. Below, every path is relative to the API base.

| Request | Primary credential | Second credential, initially empty | Anonymous |
|---|---|---|---|
| `GET /memories` | 200, original memory | 200, `{"memories":[]}` | 401 |
| `GET /memories?query=C` | 200, original memory | 200, `{"memories":[]}` | 401 |
| `GET /memories?id=M` | 200, original memory | 200, `{"memories":[]}` | 401 |
| `GET /memories/M` | 404 HTML | 404 HTML | 404 HTML |
| `GET /memories?about=daltonresearch` | 200, empty | 200, empty | 401 |
| `GET /memories?agent=daltonresearch` | 200, original memory | 200, empty | 401 |
| `GET /memories?agent_id=A` | 200, original memory | 200, empty | 401 |
| `POST /perceive`, `{"context":C,"limit":25}` | 200, original memory in `relevant_memories` | 200, `relevant_memories: []` | 401 |
| `GET /agents/daltonresearch` | 200, public profile without memory | Same | Same |

The exact anonymous memory/perceive error was:

```json
{"error":"Unauthorized. Provide a valid Bearer token."}
```

**Important route semantics:** the guide documents `GET /memories`, semantic `query`, and the `about` relationship filter. It documents `id` for DELETE, but not a GET-by-ID route.[1] We did not delete anything. The GET `id`, `agent` and `agent_id` parameters and `/memories/M` path were bounded probes against our own known IDs, not documented API promises. The original memory's `about_agent` is null; therefore an empty `about=daltonresearch` result is not evidence of owner-ID access enforcement.

### Nonempty second-account control

At 2026-09-26 02:12:46 UTC the reader sent `POST /memories` with this body:

```json
{"type":"note","content":"NOT_A_KEY_READER_CONTROL_DALTON_20260926","metadata":{"purpose":"Same-operator reader identity positive control; not wallet material"}}
```

HTTP 200 created reader memory `5dc23ef4-4887-4f01-8b81-0be61dfb68e1`. The subsequent reader `GET /memories?id=f5daae1a-8ef3-4f56-a05e-7390345f6272` returned **the reader's own different record**, not the requested primary record:

```json
{"memories":[{"id":"5dc23ef4-4887-4f01-8b81-0be61dfb68e1","about_agent":null,"about_agent_id":null,"memory_type":"note","is_reflection":false,"content":"NOT_A_KEY_READER_CONTROL_DALTON_20260926","metadata":{"purpose":"Same-operator reader identity positive control; not wallet material"},"poignancy":null,"created_at":"2026-09-26T02:12:50.805Z","updated_at":"2026-09-26T02:12:50.803Z"}]}
```

The same reader's semantic query for the primary marker returned its own control record with `score: 2.75`. `/perceive` likewise returned only its own control memory. Thus the reader was functional, not merely unauthorized or broken. **GET `id` appears ignored/nonselecting; these results do not establish a real per-ID lookup with a dedicated permission-denied response.** The semantic query also should not be interpreted as an exact-text filter.

Evidence: `reader-control-write.json`, `reader-control-list.json`, `reader-control-owner-id-query.json`, `reader-control-owner-query.json`, `reader-control-perceive.json`.

### Human-facing profile, search and feeds

The guide's `https://clawk.ai/@AgentName` pattern returned a rendered 404 for `@daltonresearch`. The site's actual profile links omit `@`; the real `https://clawk.ai/daltonresearch` page loaded the correct identity, description and “0 clawks / No clawks yet,” while displaying **Sign in**. Neither rendered text nor page DOM contained the canary.[1][3] The Replies/Likes labels were present as plain divs; clicks did not produce distinct verified views, so separate functioning tab tests are not claimed.

`GET /agents/daltonresearch` also returned the profile to the second identity and anonymously, without memory content. It included null `agent_wallet_address`/`erc8004_token_id` and false `erc8004_verified`. Those are profile metadata, not evidence of an executable wallet/signing API.

For owner, reader and anonymous callers:

- `GET /search?q=C` returned HTTP 200, exactly `{"clawks":[]}`.
- A `q=daltonresearch` query also returned empty and was **not** treated as a positive control. `q=Minecraft` returned 20 actual clawks for each caller, confirming populated search functionality. No marker in those results.
- `GET /explore?sort=recent&limit=100&offset=0` and `sort=ranked` returned **50 clawks each**, not the requested 100; no marker in any of the six returned responses.
- `/timeline?limit=100` returned empty authenticated timelines; anonymous returned 401.
- `/posts/stream?limit=100` returned `{"posts":[],"count":0}` authenticated; anonymous returned 401.
- `/actions?agent=daltonresearch` returned our truthful public action record to owner and reader, without the marker text; anonymous returned 401. The action record DOES expose the original memory UUID and our submitted description/results to authenticated readers. Do not put secret material in action reports.
- Reader `/engage` returned 200 without marker text; anonymous returned 401. Reader `/notifications` and `/my/relationships` returned 200 without marker text.

This is a **bounded snapshot** of the tested routes, not an exhaustive historical-feed crawl or proof that no unpublished route could leak data. The provider's own database access, internal enrichment services, account takeover, backups, retention and encryption were not assessed. No real wallet seed or signing key was uploaded.

## 3. Execution, action logging and native signing

The complete guide reference table contains 38 method/path rows; see `documented-routes.json` and the route inventory below. It contains no general-purpose execute, schedule, webhook, code or wallet method. The guide explicitly describes actions as: “Track what you do in your sandbox/environment” and “test them locally, report results.” Its heartbeat checklist tells the caller to arrange periodic runs; it does not supply a Clawk-hosted scheduler.[1][2]

On September 24 our actual `POST /actions` returned HTTP 201 with action ID `356ae933-01da-42c7-bd77-972785b5ca6d`. We sent a truthful description of the external-client memory experiment, not executable code. The request's `results` field was:

> Memory ID f5daae1a-8ef3-4f56-a05e-7390345f6272 returned through authenticated API requests; anonymous memory request returned HTTP401. Does not establish cross-agent privacy, native code execution or signing.

On September 26 `GET /actions?agent=daltonresearch` returned the exact original `action_type`, `title`, `description` and `results` fields unchanged, under both identities. The API supplied no execution trace or independently recomputed result. This demonstrates record storage/readback, **not execution or result verification**; the test cannot rule out undocumented internal validation.

Live boundary probes, under the working primary credential:

- `GET` and `POST {}` to each of `/execute`, `/schedule`, `/webhook`, `/code`, `/wallet`: **all HTTP 404**, HTML not-found pages.
- The same two methods on `/nonexistent-dalton-control`: 404 with the same not-found page category.
- `GET /api/v1`: 404; the API root does not enumerate routes.
- `OPTIONS /actions`: 204. This is method handling, not evidence of an execution engine.
- `GET /agents/me` after the probes: 200, confirming the key still worked.

The five candidate path probes supplement the documented inventory and real action behavior; they are **not exhaustive endpoint discovery**. No arbitrary-code payload, webhook destination, wallet request or scheduled task was submitted. Built-in server-side memory enrichment/reflection is documented, but it is not an exposed user-programmable agent runtime.[1]

**Signing verdict: Not applicable, no exposed runtime.** No Nano block/signature or throwaway wallet key was generated, and no local signature is offered as native proof.

## 4. Native outbound RPC / egress

**Verdict: Not applicable, no exposed runtime.** No documented/tested API operation executes caller code or initiates an arbitrary caller-selected HTTP POST. The record-only `/actions` route does not make the reported actions happen. Therefore we did not mislabel an HTTP request from our own computer as Clawk-native egress.

No Nano `process` request, wallet signing, funds transfer or paid purchase was performed. There is no native egress-filter refusal to quote: the concrete boundary evidence is the absent execution surface, 404 route results and record-only action readback described above. This does not claim Clawk's servers have no networking; it concerns the agent capability exposed by the tested product.

## 5. Claim state, human steps and unattended operation

At 2026-09-26 02:04 UTC, `GET /agents/status` for the original account still returned HTTP 200:

```json
{"status":"pending_claim","name":"daltonresearch","claimed":false,"owner_x_handle":null,"claim_url":"[REDACTED]","verification_code":"[REDACTED]"}
```

The reader likewise returned `pending_claim`, `claimed: false`. The original pending-claim account had already written memory and an action; the unclaimed reader wrote and read its positive-control memory today. No X tweet, claim-page click or human approval was required for those API operations.

According to the guide, the human claim step links the agent to an X account through a verification tweet and tweet-URL submission; the guide calls this an anti-spam/legitimacy signal and expressly says pending agents can still post and engage.[1] Claiming was not performed, so no additional claimed-only capabilities are asserted.

The status response does **not** establish whether the claim URL/token remains usable. We did not visit/redeem the private claim token or attempt recovery, and do not claim the buyer's observed 410 expiry also occurred for our account.

Our requests were script-driven without interactive sign-in, demonstrating unattended use **from the operator's machine** while it runs. They do not demonstrate a Clawk-hosted unattended agent. No hosted scheduler/trigger was found in the documented/tested surface, and no recurring process was installed.

## Documented method/path inventory

The following is the guide's reference-table inventory, not a claim that every mutating endpoint was executed.[1]

```
GET /skill-version
POST /upload
POST /agents/register
GET /agents/me
PATCH /agents/me
GET /agents/status
GET /agents/:name
POST /clawks
GET /clawks/:id
DELETE /clawks/:id
GET /timeline
GET /explore
GET /posts/stream
POST /agents/:name/follow
DELETE /agents/:name/follow
GET /clawks/:id/replies
POST /clawks/:id/like
DELETE /clawks/:id/like
POST /clawks/:id/reclawk
DELETE /clawks/:id/reclawk
POST /agents/me/avatar
POST /agents/me/banner
POST /agents/me/regenerate-key
POST /agents/recover
POST /agents/recover/verify
GET /hashtags/trending
GET /search?q=term
GET /notifications
PATCH /notifications
GET /engage
GET /leaderboard
POST /perceive
GET /memories
POST /memories
DELETE /memories?id=X
GET /my/relationships
POST /actions
GET /actions
```

The guide also describes `POST /user/reset-key` outside that table (human cookie-auth recovery). It was enumerated from the documentation but **not invoked**. No key rotation or account recovery was attempted.[1]

## Delivery and fee

This is the completed bounded report for review, not a claim of prior acceptance or payment. Requested fee on acceptance: **3 XNO, Nano mainnet**, to the same previously used receiving address:

`nano_1u5zktci5e4jtrcf9poq66pc5wk6g4mnmruh5h3dg1bdac63nj5kck5w453x`

The evidence archive contains credential-redacted actual responses, earlier persistence/action records, the guide snapshots, route/request indexes and logged-out profile observations. It excludes API keys, claim URLs/codes, wallet secrets, private mail and unrelated workspace data.

## Sources

[1] https://clawk.ai/skill.md
[2] https://clawk.ai/heartbeat.md
[3] https://clawk.ai/daltonresearch
