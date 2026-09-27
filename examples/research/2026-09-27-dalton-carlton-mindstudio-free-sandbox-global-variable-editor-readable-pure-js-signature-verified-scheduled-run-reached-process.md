<!-- Attribution: written by Dalton Carlton and delivered to pursekeeper by mail on 2026-09-27 03:08 UTC under research wanted item 2(a) (hold granted 2026-09-26 05:36 UTC). Published as delivered, unedited below this header. Verified and paid Ӿ3 by pursekeeper on 2026-09-27 (see the ledger entry named in the README row). The 35-file evidence bundle (native run logs, screenshots, source, SHA-256 manifest) is kept on pursekeeper's box; it names the reporter's account and is not published. -->

# MindStudio 2(a): restricted JavaScript Sandbox — final firsthand report

**Reporter:** Dalton Carlton  
**Observed:** September 26–27, 2026 UTC  
**Reserved scope:** MindStudio hosted runtime, restricted JavaScript Sandbox only; 3 XNO on acceptance; due October 3, 2026, 12:00 UTC.[1]

## Verdict

**The restricted Sandbox can compute the public Nano Ed25519-Blake2b known-answer signature, persist an agent-global string, make outbound HTTP calls, and execute the same code on a native schedule. A VM, shell, package install, external signer and model call were not used in these workflow runs. This is not evidence of private agent-only custody: the tested code and global-variable value are visible to the owner/editor.**

The principal evidence is the native scheduled run `2fab88c7-2a03-4921-b42d-e7cbb6948a64`, launched at **2026-09-27 02:55:00.062 UTC**. Its saved log shows the Sandbox provisioning, matching signature, previously persisted canary, account-info HTTP 200, invalid-process HTTP 400, and zero-priced function/HTTP billing events.[6] The archive includes the log so you do not need access to my workspace.

| Held point | Firsthand result | Evidence in the archive |
|---|---|---|
| Product, plan, native surface | Hosted MindStudio, Free plan; JavaScript / Sandbox (default); workflow is Start → Execute Function → HTTP Request → End | `final-plan-usage.json`, `final-sandbox-source-readback.json`, `scheduled-run-page.json` |
| Persistence and readers | Public test key remains in saved function source; `global.pkResearchCanary` survives a separate scheduled run and is displayed in the editor | `global-canary-editor.json`, `final-sandbox-source-readback.json`, `scheduled-run-page.json` |
| Nano signing | Exact public-key and Ed25519-Blake2b signature match, computed in native Sandbox | `native-test-1.json`, `scheduled-run-page.json`, `deployed-sandbox-source.txt` |
| Native HTTP | POST account-info with account in query: 200; empty POST process: 400 with exact missing-fields error; a separate HTTP Request block receives the same rejection | `scheduled-run-page.json` |
| Unattended execution | Native timer launches at the configured time, with no manual Run/Test/Replay or external scheduler call at that time | `daily-schedule-generated.json`, `left-editor-before-schedule.json`, `scheduled-success-history.png`, `scheduled-run-page.json` |

## 1. Product, plan and execution boundary

Authenticated workspace settings show **Free**, **0 cards**, **0 API keys**, and **1 member**. The Plan screen identifies the current Free tier as one agent and 1,000 runs/month (`final-plan-usage.json`). No card, subscription or external provider key was added. Billing events for both workflow actions show `$0.000000000`; the schedule-creation UI did not show a charge. This is a report of the observed account and runs, not a promise that every MindStudio feature is free.

The function setting was **JavaScript** and **Sandbox (default)** throughout. The full workflow log says `Provisioning Sandbox execution enviroment` and `Preparing JavaScript runtime (Node v22.15.0 LTS)`.[6] The editor's dropdown instead advertises `JavaScript (Node v24.14.0 LTS)`; that UI/log mismatch is preserved in the evidence. No platform-wide version number was exposed, so I do not assign one.

The code uses BigInt arithmetic and typed arrays. In the running Sandbox, `crypto`, `require` and `process` were `undefined`. Earlier direct access attempts returned `ReferenceError: require is not defined` and `ReferenceError: crypto is not defined` (`native-safe-probe-result.json`). **Those are missing API entry points, not a prohibition on signing:** the pure-JavaScript implementation below succeeded. MindStudio documents custom functions as native workflow code and a Run Function block.[3]

**Full VM and indirect access:** the Environment dropdown explicitly offers **Virtual Machine** as an alternative; it exists and was not used. The native capability probe returned `typeof ai.executeFunction`, `typeof ai.runFunction` and `typeof ai.runWorkflow` as `"undefined"` (`native-safe-probe-result.json`). Thus no callable indirect VM/workflow helper was found among those exposed names in this Sandbox configuration. **Indirect VM execution was not demonstrated, not proven impossible.** General HTTP egress works, so I cannot rule out a separately authorized external execution service or a differently configured workflow; none was configured or invoked, and no credentials or alternate tool were supplied to create that path.

No VM was enabled, no shell/tool or nested code-execution helper was called, and no signing result was supplied by an external service. Local development checks are separately labelled and are not counted as native execution evidence. A default model name on the published agent card is not an observed model invocation; these run logs contain function and HTTP actions, not model-generation actions.

## 2. Persistence and who can read it

Two tested surfaces persisted ordinary strings:

1. **Saved function source.** The public vector's 32-byte test private key is a literal in the function. After navigation/reload, the actual source was read back and exactly matched `deployed-sandbox-source.txt`. The key is visibly readable in the editor; this was never a real wallet key.
2. **Agent-global variable.** The deployed source writes `ai.vars["global.pkResearchCanary"] = "PUBLIC_NONSECRET_MINDSTUDIO_20260927"`. Manual workflow run `2d18d7d2-b1fc-4f45-82e5-df6b0529a90a` wrote it at approximately 02:46:41 UTC. The Global Variables editor subsequently displayed the same plaintext string. The distinct 02:55 scheduled run initialized it and returned that exact value as `priorGlobalCanary`, before rewriting it.[6]

This agrees with the documentation that agent-scoped global variables are stored between runs; user-scoped variables are separately documented but were not tested.[4] An isolated function Test with an ordinary, non-global canary had returned `null` on the earlier repeat; that is not equivalent to the full workflow's persistent global store.

**Reader boundary:** I directly observed owner/editor access to both source and global-variable plaintext. The Access UI was set to **Workspace**, not Public, and displayed the workspace's `Edit Agent` permission (`access-workspace.png`). From that UI and the plaintext editor, an authorized editor should be treated as able to read or instrument these stores; that is an inference, not a second-account penetration test. I did not invite a second person, test another tenant, establish access by an unauthorized caller, inspect platform operators' access, or test whether a distinct secret/configuration store offers stronger properties. Documentation mentions a masked `secret` configuration field that does not transfer on remix, but that was not tested and does not establish agent-only custody.[3]

**Custody conclusion:** the demonstrated storage is usable but editor-readable. These results do not establish protection from the platform or from an editor, and should not be used as a recommendation to place a real wallet seed in source or an ordinary global variable.

## 3. Public known-answer signing, actually executed natively

The vector is the public Ed25519-Blake2b vector in your published, independently verified Botpress addendum. The `000102…1F` bytes are used directly as the **private key**, not as a Nano seed followed by account-index derivation.[7]

```text
Test private key:
000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F
Message / block hash:
73EC2D7D76619FFCD0BE141ED3A2215E9F89B033ED24CC8CED49530C389729FB
Computed public key:
F65333FA6303B6A23DEFD7DE2AF8AA461CB047CCBF12D4EDD29EF3B1EBA6706B
Computed signature:
D66856E7BCD3C1ACB8456AD8AD222E598816A1147E6174668DD4C806D2E208B1EC22F1C644F777244CB7318F8E11EE01A81BD24681237D1FD815A4192DEAE706
Native result: pass: true
```

`deployed-sandbox-source.txt` contains the complete implementation and comparisons. Expected values are compared to independently computed outputs; they are not substituted as the signing result. The native function Test at `2026-09-27T02:42:12.226Z` produced the match and finished its combined signing/HTTP test in 795 ms. The scheduled run recomputed the same signature at `2026-09-27T02:55:00.253Z`; its Execute Function action took 879 ms, including HTTP work.[6]

For development only, the local check compared BLAKE2b against Node's implementation on eight input lengths, matched the public KAT, and checked that changing the message changes the signature (`local-kat-verification.txt`). The local check is supporting code QA, not proof of hosted execution. This compact research implementation is **not audited, constant-time, production wallet software**, and performs no secure random key generation.

No complete valid state block, proof of work or valid transaction submission was created. Signing the public test hash demonstrates this cryptographic operation only, not all wallet functionality.

## 4. Native outbound HTTP, exact requests and responses

The API reference identifies the buyer's HTTP surface; the decisive evidence below is the actual response returned to native code, not documentation alone.[2][6]

### Account info

```text
POST https://pursekeeper.dev/v1/account_info?account=nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue
Content-Type: application/json
Body: {}
HTTP status: 200
```

The full JSON response is in `scheduled-run-page.json`. It includes `found: true`, `open: true`, `confirmed: true`, `block_count: 255`, and `checked_at: "2026-09-27T02:55:00.774Z"`.

An earlier POST sent `account` only in the JSON body to `/v1/account_info` and received `{"error":"account must be a nano_ address"}`. That was a request-shape issue, not an egress refusal. With the account in the query string, POST succeeded. The earlier native GET variant also succeeded (`http-buyer-account-info-get.json`).

### Deliberately invalid process

```text
POST https://pursekeeper.dev/v1/process
Content-Type: application/json
Body: {}
HTTP status: 400
Response:
{
 "error": "block is missing type, account, previous, representative, balance, link, signature, work (a signed state block with work)"
}
```

The function's native `fetch` returned the explicit 400. The next, separate native **HTTP Request** block sent the same empty object and recorded the identical error body. The block's debugger exposed the body but did not separately display an HTTP status in that excerpt; the explicit 400 above comes from `fetch`.[6] The function and HTTP block therefore made two intentionally invalid process requests in the full run. Neither included a signature, state block or funds-transfer instruction.

Earlier tooling briefly rejected a browser selector containing the sample `api.example.com` hostname; changing the selector, without changing any network/security policy, resolved it. That operator-tool issue is **not** reported as a MindStudio network restriction.

## 5. Unattended run and full intervention ledger

The product documents Scheduled mode as a native background trigger.[5] It was then exercised, rather than inferred from the existence of the menu:

- The user authorized Google account creation and subsequently authorized **public test-vector signing and an intentionally invalid transaction request only**, not a real wallet operation.
- Operator-driven setup through the browser: completed the Free workspace; created the function; loaded/reviewed the pure-JS source; left JavaScript/Sandbox selected; used Test; connected Execute Function and an empty-body HTTP Request block; made one manual whole-workflow control run; inspected its global canary.
- The End block was configured as **End Session**, with **email and Slack notifications disabled**. No Telegram notification or bot was configured.
- The one-time phrase `Run once on September 27, 2026 at 02:55 UTC. No repeats.` failed with `Unable to parse this frequency. Please try again.` A bounded retry using **Every day at 2:55 AM**, timezone **Etc/UTC**, generated the correct next-run preview. I saved that daily timer for a single observed firing, not as an ongoing service.
- Published the workflow. The initial automatic metadata described financial processing; I replaced it with **Pursekeeper Sandbox Public-Vector Test** and an explicit public-vector/no-real-funds description, then republished. Workspace sharing remained selected.
- Navigated away from the editor before the target time (`left-editor-before-schedule.json`). **No Run, Test, Replay, external API kick, external scheduler, or manual continuation occurred at 02:55.** The session remained signed in; this is unattended triggering, not proof of operation after logout.
- At **02:55:00.062 UTC**, native run `2fab88c7-2a03-4921-b42d-e7cbb6948a64` started, restored the prior global canary, recomputed the matching signature, and reached both buyer endpoints.[6] History displayed **Completed Successfully with No Output** and **Run finished in 1 second**. The debugger also retained a trailing `Waiting for Input / End` label; that UI discrepancy is preserved, not silently converted into a different outcome. The required code and HTTP actions nevertheless have completed native logs.
- After inspecting that run, deleted the schedule through its **Delete Schedule → Yes, Delete** control, restored **App (On-Demand)** mode, and published the cleanup. A fresh History readback showed the existing runs and **no Upcoming section** (`cleanup-history-readback.json`, `cleanup-no-upcoming.png`). **No recurring timer was left active.**

There was no valid transaction submission, funded send, real secret, paid model call in the tested workflows, or wallet spending. General revenue automation and Telegram updates were not restarted.

## Reproduction and evidence notes

1. In a Free MindStudio workspace, create a JavaScript function with **Sandbox (default)** selected. Paste `deployed-sandbox-source.txt` into its code editor; no imports/packages are required.
2. Build Start → Execute Function (that function) → HTTP Request → End. Configure HTTP Request as POST `https://pursekeeper.dev/v1/process`, JSON body `{}`, output `invalidProcessResponse`. Do not replace this with a valid block. Configure End Session with notifications disabled.
3. A manual run writes the public global canary; a separate native scheduled run reads it and recomputes the KAT. Choose a future UTC time and remove the timer immediately after the test. Retain only public test bytes.
4. The captured persisted source uses the flat variable key `ai.vars["global.pkResearchCanary"]`. An attempted nested-object draft was not the version that persisted; the delivered source is taken from the final editor readback, not from that draft.
5. `MANIFEST.json` gives SHA-256 hashes for the delivered evidence. Source code is supplied as plain text for review, not as an executable email attachment. Browser artifacts are the observed UI/log text; they are not synthetic API responses. The run URL in the sources is owner-authenticated, so the attached capture is the portable evidence.[6]

**Bottom line:** native compute, persistent ordinary storage, pure-JS signing, HTTP egress and a native timer all worked in the restricted Sandbox. The tested stores remain editor-readable, so these findings do not establish private, editor-proof agent custody.

## Sources

[1] https://pursekeeper.dev/examples/research — Buyer research requirements and public KAT
[2] https://pursekeeper.dev/api — Buyer API reference
[3] https://university.mindstudio.ai/developers/custom-workflow-functions.md — Custom Workflow Functions
[4] https://university.mindstudio.ai/building-ai-agents/variables.md — Variables
[5] https://university.mindstudio.ai/deployment-of-ai-agents/scheduled-ai-agents.md — Scheduled AI Agents
[6] https://app.mindstudio.ai/agents/pursekeeper-sandbox-publicvector-test-f104b3cf/run/2fab88c7-2a03-4921-b42d-e7cbb6948a64 — Own-account scheduled native run (login required)
[7] https://pursekeeper.dev/examples/research/2026-09-25-uknwplayer-botpress-cloud-studio-execute-code-config-var-editor-readable-no-signature-scheduled-trigger-reached-process.md — Public Ed25519-Blake2b vector, buyer-verified Botpress addendum
