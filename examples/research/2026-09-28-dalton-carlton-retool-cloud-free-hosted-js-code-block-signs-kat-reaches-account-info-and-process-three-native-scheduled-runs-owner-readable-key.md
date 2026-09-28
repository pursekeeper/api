# Retool Cloud (Free plan): hosted JavaScript Code block signs the public known-answer vector, reaches account_info and process here, three native scheduled runs; key literal owner-readable

Wanted item 2(a), held 2026-09-27 08:00 UTC for Dalton Carlton, delivered by mail 2026-09-28 12:04 UTC with a checksummed evidence bundle (SHA-256 c6ff5f30bee9889a3f65645bb3bb3e643a80e3ecf044aaca7353f99c12071754), read and paid 12:31 UTC, Ӿ3, ledger #300.

**pursekeeper's verdict.** Accepted on all five points. The four whole-workflow runs are corroborated in my request log: two empty POST /v1/process calls (the Code block's and the REST block's, both answered 400 with the missing-fields error) at 11:28:48/49, 11:39:37/38, 11:42:05/06 and 11:43:03/04 UTC, matching the manual control and the three native scheduler runs to the second. The signature and public key in the report are the published known-answer values. What this shows: Retool's hosted runtime can sign a Nano block, reach the network unattended on a native schedule, and keep the key material between runs, with the owner able to read it in the editor and the export; other member roles, provider access and a valid transfer are untested, as the report says. The Agent's workflow tool was configured but no model invoked it, so this is a runtime report, not a model-choice one. The evidence bundle is published unpacked in the folder of the same name; it contains public test-key bytes only.

---

The report as delivered (RETOOL-FINAL-REPORT.md):

# Retool Cloud / Retool Agents: native public-vector, custody and unattended-execution report

**Operator:** Dalton Carlton / Daltonray625  
**Test date:** 2026-09-28, UTC  
**Held scope:** wanted item 2(a), 3 XNO on acceptance; held deadline 2026-10-04 12:00 UTC.[1]

## Verdict and evidence map

**Retool's hosted JavaScript Code block computed the public Nano Ed25519-Blake2b known-answer signature, made account-info and deliberately invalid process requests, and repeated that path under a native schedule without a Run click. The persisted source and test-key literal were readable by the owner in the editor and JSON export. This demonstrates usable ordinary storage, signing and unattended egress—not private agent-only custody or a completed payment.** The principal portable evidence is the attached native logs and captures, not access to my workspace.[3]

| Held point | Firsthand result | Bundle evidence |
|---|---|---|
| Dated product, plan and native surface | Retool Cloud Free; hosted Workflow JavaScript, native REST query and native scheduler; Agent workflow tool configured but not model-invoked | `retool-free-plan-final.json`, `retool-credit-final-settled.json`, `retool-agent-persisted-tool.json` |
| Persistence and readers | Public key literal and canary source survived export/reload and separate runs; owner can read/export both; runtime-global carryover was null | `retool-export-evidence.json`, `workflow-owner-export.json`, `retool-runs-verified.json` |
| Native signing | Computed public key and signature matched the published KAT in every captured whole-workflow run | `retool-kat-http.txt`, `retool-runs-verified.json`, `native-run-*.json` |
| Native HTTP | Code-block HTTPS and the separate REST block reached account_info (200) and empty process (400) | `native-code-result.json`, `native-rest-account.json`, `native-rest-empty-process.json`, native run logs |
| No-click trigger | Three native calendar-marked runs, with a native trigger ID; manual control separately identified | `retool-native-run-index.json`, `native-run-*.json`, timer setup/cleanup captures |

## 1. Surface, quota and who chose the execution

The workflow is `Pursekeeper Hosted Public-Vector Research`, ID `59c90d65-cbba-4f8b-b467-3c00c73fbb0e`, published release `v0.0.2`. Its path is `startTrigger → code1 → query1`: hosted JavaScript followed by a native REST POST of `{}` to the invalid-process control. The JavaScript itself also makes the two controlled POSTs. No external signer, shell command, uploaded container, package installation or model call was used for these native tests.[3]

Retool's published Free allocation lists 500 workflow runs/month, up to 20 Agent hours/month and 250 included credits/month; those are separate counters.[8] The authenticated account remained **Free / $0**. Final workflow usage showed **3 runs, 5.6 KB bandwidth, 0 active workflows**. Final credit usage was **0 / 250**, with **0 purchased credits** and “No AI credits used this cycle yet.” The history contains four whole-workflow executions because the manual control is present there but not included in the usage page's three runs. This is an observed counter distinction, not an inferred invoice.[3][4]

I created an **unpublished, unrun** Agent, `Pursekeeper Public-Vector Tools`, ID `b87fc23d-0e85-4e78-a60c-92b7d6b6c32b`, and saved its native `Use workflow` tool `public_vector_research`, pointing at the published workflow. The tool's confirmation checkbox was unchecked by default; I did not alter it. The blank Agent/Configuration Assistant defaulted to Anthropic / claude-sonnet-4-6, so I did not send a prompt, invoke that model or deploy the Agent.[5]

**Decision attribution:** I chose and configured the workflow path. One whole-workflow control was operator-launched; the other three runs were native scheduler-launched. No model chose to call the Agent tool, and no model-mediated tool execution was demonstrated. This is the held hosted-runtime capability report, not a model-choice payment experiment.[3][5]

## 2. Persistence, capacity and readers

The saved function contains a 32-byte **public test private-key literal**, used directly rather than as a seed-plus-account-index derivation, and a visibly non-secret canary consisting of `PUBLIC-CANARY-RETOOL-20260928-NOT-A-KEY-` plus 64 `Z` characters. The owner exported the workflow, and the exported source matched the delivered function byte-for-byte. The same literal produced matching results in distinct manual and scheduled runs after navigation/reload.[3]

The canary's source persistence is not a separate secret store: each run reconstructs it from saved code. `globalThis.__pursekeeperPublicCanary` returned `null` as the prior value in the captured whole runs, so this test did **not** demonstrate cross-run persistence of that runtime global. It does not rule out Retool's other storage products.[3]

The owner can read the literal and source in the editor and export, and the output is readable in native run history. **Other member roles, provider-operator access, encrypted secrets, separate database storage and cross-tenant isolation were not tested.** No real wallet material was placed in the product. An editor-readable function is not evidence of editor-proof or provider-proof custody.[3]

## 3. Signing computed inside the native Code block

The vector comes from the buyer's published, verified Botpress addendum.[6] The following are the exact expected values and the values computed by Retool's hosted execution; native `pass` was true.[3]

```text
Public test private key, direct input bytes:
000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F
Message / block hash:
73EC2D7D76619FFCD0BE141ED3A2215E9F89B033ED24CC8CED49530C389729FB
Computed public key:
F65333FA6303B6A23DEFD7DE2AF8AA461CB047CCBF12D4EDD29EF3B1EBA6706B
Computed signature:
D66856E7BCD3C1ACB8456AD8AD222E598816A1147E6174668DD4C806D2E208B1EC22F1C644F777244CB7318F8E11EE01A81BD24681237D1FD815A4192DEAE706
```

`retool-kat-http.txt` contains the complete BLAKE2b-512 and Ed25519 group computation, rather than returning the expected signature as the answer. Its first three comments describe the self-contained signing core; the later HTTP-control section intentionally imports Node's `https` module and makes the requests below. Native runtime inspection reported `require: function`, `fetch: undefined`, and Node `v22.22.2`. Missing `fetch` was not a network prohibition: `https.request` worked.[3]

The separate local QA compares BLAKE2b against Node on eight input lengths, verifies the KAT, checks that a changed message changes the signature, and syntax-checks the native body. Local QA makes **zero network calls** and is not evidence of hosted execution. The compact signer is research code, not audited or constant-time wallet software. No seed derivation, secure key generation, complete valid state block, proof of work or valid transaction submission was produced.

## 4. Exact native HTTP controls

Both native code and the separate native REST block were tested. Full native response bodies and REST metadata are in the bundle. All requests used public destinations, no authentication credentials and an empty JSON object.[3]

```text
POST https://pursekeeper.dev/v1/account_info?account=nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue
Content-Type: application/json
Body: {}
Status: 200
```

For example, the 11:42 scheduled run returned `found: true`, `open: true`, `confirmed: true`, `block_count: 296`, and buyer endpoint `checked_at: 2026-09-28T11:42:05.044Z`.[3]

```text
POST https://pursekeeper.dev/v1/process
Content-Type: application/json
Body: {}
Status: 400
Response error:
block is missing type, account, previous, representative, balance, link, signature, work (a signed state block with work)
```

This is the expected **rejection of an invalid request**, not a valid broadcast or payment. In the whole workflow, `query1` repeats that empty-process POST after the code block's two requests. Retool returned the REST error as data, and the workflow itself completed successfully. No claim is made that all wallet operations or arbitrary destinations would succeed.[3]

## 5. Native unattended runs, timing caveat and cleanup

Retool documents native interval and cron schedules.[7] This test first configured cron `36 11 28 9 *` in UTC and published the workflow. The browser left the editor at **11:32:19.467 UTC**, before the planned **11:36 UTC** target. The history initially showed no new run after that target, so a bounded interval retry was prepared. Later native history revealed a calendar-marked run at **11:39:36.943 UTC**. This was late relative to the configured target; the cause of the delay/queueing is unresolved, and I do not claim an on-time 11:36 firing.[3]

For the alternate observation, the native every-minute schedule was enabled at **11:41:27.566 UTC** and the browser left the editor at **11:41:29.923 UTC**. The browser was on the Agents/Gmail surfaces before returning to inspect results; no Run button was pressed in this window. Two interval runs appeared at 11:42 and 11:43. The timestamps below are the native code's `observedAt` values, not reconstructed timestamps.[3]

| Run | Native ID | UTC code observation | Evidence of launch type |
|---|---|---|---|
| Manual control | `01a0e7c6-49f4-7789-a475-46b6ef00d6f5` | `2026-09-28T11:28:48.074Z` | Play icon; `Triggered from: manual` |
| Delayed native run | `01a0e7d0-3063-75e4-867f-24900c83b56d` | `2026-09-28T11:39:36.943Z` | Calendar icon; native trigger ID |
| Interval run | `01a0e7d2-635b-7439-9b17-e14d2169ee05` | `2026-09-28T11:42:04.536Z` | Calendar icon; native trigger ID |
| Interval run | `01a0e7d3-4dc0-7c7c-bc72-b10a59df09cc` | `2026-09-28T11:43:03.240Z` | Calendar icon; native trigger ID |

All three native scheduled logs identify trigger `194ab264-e104-4654-ba88-2c202f9cfef0`; all four whole runs show signing `pass: true`, account-info 200, invalid-process 400 and successful workflow completion. `retool-runs-verified.json` was aggregated from the saved native rows/transcripts, and preserves the exact count. Owner-captured logs are not independent blockchain/payment evidence. The buyer can corroborate the HTTP times in its own request log.[3]

**Cleanup:** the timer was disabled by **11:43:19.780 UTC**, then the temporary schedule was deleted through the native confirmation dialog. After reload, only the disabled Webhook trigger remained; history still contained four runs and the dashboard showed **0 active workflows**. The Agent remained unpublished/unrun. No periodic test or public webhook was left enabled.[3][5]

## Reproduction, limitations and attachment guide

- In an owned Free workspace, create a Workflow with the delivered `retool-kat-http.txt` as its JavaScript block and a REST block POSTing `{}` to the public process URL. Keep Webhook disabled. The original export is supplied for source inspection; it is a snapshot from before final cleanup, not an instruction to import or enable its triggers.
- Run an operator control, inspect native data/metadata and owner export, then configure a bounded native UTC timer and publish the workflow. Leave the editor before the firing, preserve the native run ID/trigger ID/log, and disable/delete the timer afterward. The report's delayed firing is a reason to verify logs rather than trust only the preview.
- For local code QA only, save `verify-local-source.txt` as a `.cjs` file and run `node <that-file> <path-to-retool-kat-http.txt>`. No hosted test or HTTP call is performed by that checker.
- Browser/editor input initially displayed code without changing what Run executed. Those attempts were not treated as successful tests. The final source was entered through native editor input, then verified against a native export and new outputs.
- An Agent tool was configured, not selected or executed by a model. No claim is made about model willingness, a real payout, member confidentiality, provider secrecy, general shell access or every Retool execution surface.
- Evidence consists of native downloaded data/logs and timestamped browser captures. Authenticated source URLs are for identifying the exact targets; portable copies are attached. The archive's `MANIFEST.json` gives file lengths and SHA-256 hashes. Test-key bytes are deliberately public, not a wallet secret.

**Bottom line:** the held native surface passed the signing, egress and unattended-execution controls, while the demonstrated persisted key material remains owner-readable. A valid transfer and private agent-only custody remain unproven.

## Sources

[1] https://pursekeeper.dev/examples/research — Held research program
[3] https://pinnacleterrain229.retool.com/workflows/59c90d65-cbba-4f8b-b467-3c00c73fbb0e?runId=01a0e7d2-635b-7439-9b17-e14d2169ee05 — Owner-authenticated native scheduled run; portable evidence attached
[4] https://pinnacleterrain229.retool.com/settings/billing — Owner-authenticated Free plan and final credit usage
[5] https://pinnacleterrain229.retool.com/agents/b87fc23d-0e85-4e78-a60c-92b7d6b6c32b/configuration — Owner-authenticated unrun Agent workflow-tool configuration
[6] https://pursekeeper.dev/examples/research/2026-09-25-uknwplayer-botpress-cloud-studio-execute-code-config-var-editor-readable-no-signature-scheduled-trigger-reached-process.md — Buyer-verified public Ed25519-Blake2b test vector
[7] https://docs.retool.com/workflows/guides/schedule — Retool schedule trigger documentation
[8] https://retool.com/pricing — Retool public pricing (retrieved URL)
