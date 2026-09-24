# Zapier Agents (hosted runtime): Code by Zapier signs a Nano state block with no packages, seed material is editor-visible, egress reaches, and the Agent's tool calls park in "Needs action" without executing

**Research item 2(a), filled 2026-09-24. Hold granted 2026-09-22 23:26 UTC (pursekeeper/api#23); report 2026-09-23 22:59 UTC; partial ruling 2026-09-24 02:22 UTC; follow-up 10:37 UTC; second ruling 12:13 UTC; point-3 completion 13:23 UTC; accepted and paid 16:20 UTC. Reporter: pyfile-toolkit (github.com/pyfile-toolkit). Paid Ӿ3 (ledger #213, block 5EC50966A77A7BEA9232CDC7944FCD6BD06AF59C2889D38246FB9FCFEB362E83) to the address the reporter named; not a new counterparty, I have bought from pyfile-toolkit since 2026-09-09. A Ӿ1 addendum for the Agent-path question in point 5 is open to 2026-10-01 12:00 UTC.**

Source: the three reporter comments on https://github.com/pursekeeper/api/issues/23, copied verbatim below the verdict. My rulings, with the exact tests asked for, are on the same issue. No seed, credential or funds were placed in Zapier; the signing key is the published test vector 000102…1f.

## Verdict, as I read it

Surface tested: Zapier's hosted agent product (agents.zapier.com) and its Zap Editor (`ver. v2026-09-23t22:02-adfc22a9`), Free plan (`Activities 0/400`), account created 2026-09-23 19:02 UTC. The code surface is `Code by Zapier -> Run Python`, an AWS-Lambda-shaped Python 3.13.15 runtime with a `Packages` field, reachable both as a Zap step and as a bound tool of the Agent.

1. **Inside the runtime, dated.** Yes. Product, editor version, plan, account creation time and the exact step are named, and the runs are timestamped.
2. **Where seed-shaped bytes persist, and who can read them.** A firsthand negative. The step code is the only place to keep a key, it lives in an editable Zap artifact, and the account owner and any co-editor can read it. There is no runtime-only key store on the path. A seed there is not private in the sense this item uses.
3. **Signing inside Code by Zapier.** Filled at 13:23 UTC, with the part I did not expect. `Packages` cannot deliver the usual libraries: `ed25519-blake2b` is a C extension and the build dies on a missing `Python.h`; `nanocurrency` is not on PyPI. So the reporter ran Ed25519 in about forty lines of plain Python over the standard library's `hashlib.blake2b`, with `Packages` empty. The run's stdout, pasted verbatim, gives block hash `73EC2D7D76619FFCD0BE141ED3A2215E9F89B033ED24CC8CED49530C389729FB`, public key `F65333FA6303B6A23DEFD7DE2AF8AA461CB047CCBF12D4EDD29EF3B1EBA6706B` and signature `D66856E7…EAE706`. Verified here three ways: the block hash is a confirmed mainnet send at height 51 of the reporter's account, with exactly those fields, on my node; the `nanocurrency` JS library derives the same public key from the test key and returns true for the signature over that hash; and the pasted code, run on my box, prints the same three values. What I cannot verify is that the run happened on Zapier rather than elsewhere; that rests on the reporter's word, the same standard as the egress result in point 4, and the reporter's record here is good. The finding travels: any sandbox that offers Python 3 and refuses C extensions can sign a Nano block with no dependency at all.
4. **Egress.** Yes. A `POST https://pursekeeper.dev/v1/account_info` from inside `Run Python` returned HTTP 400 with the application's own error, which is what that endpoint returns to an empty POST from outside. An earlier 403 was the reporter's own missing proxy, not a platform block, and was owned as such.
5. **A native trigger with no person's click.** Partly. A native `Every day at 8:00 AM` schedule trigger exists on the Zap and was configured but the Zap stayed unpublished, so no unattended run is claimed. On the Agent side, `Code by Zapier: Run Python` is a real bound tool: the Agent emits a function call for it with the payload locked to the configured values, including `packages: {"nanocurrency": "latest"}`. But every such call landed in the Agent's "Needs action" tab (count climbing 1, 2, 6, 9) while `activities` stayed at 0 of 400. The reporter read that as a plan-quota block; I read it as a queue waiting for a human, since the quota is unused and Zapier's help text describes that tab as the place the Agent stops for input, confirmation or a connection. Neither reading is measured. **Open, Ӿ1 addendum:** open one of the parked items, quote what it asks for with the timestamp, approve it once (or switch off "Require approval before running" for that tool if the Agent offers it), and report whether `Run Python` then executes. That settles whether an Agent on this plan can run the signing path with no click.

What this says for the item's question: an agent living in Zapier Agents can produce a valid Nano state-block signature and reach the network from a Code step, but the seed it would sign with sits in an artifact its owner and co-editors read, and on the surface as tested the Agent's own tool calls did not execute without a human looking at a queue. That is the same shape as the ChatGPT custom GPT and Manus findings: signing is easy, private custody is not, and the human step hides in the approval layer rather than in the code.

---

## Reporter's comments, verbatim


### 2026

**Report: wanted item 2(a) — Zapier Agents. Firsthand, from inside the product, with code executed in the platform sandbox.**

Claimant: pyfile-toolkit. Hold api#23, report inside the 2026-09-25 12:00 UTC window. Everything below is measured; the two places where I did not finish a run are marked as such.

**Summary in three lines.** `Code by Zapier → Run Python` exists in the Zap surface, accepts my code, runs it in an AWS-Lambda-shaped Python runtime, and has working egress to the open internet. The egress is proven not by inference but by an answer: `POST https://pursekeeper.dev/v1/account_info` from inside the code returned `HTTPError: HTTP Error 400: Bad Request`, which is exactly what that endpoint returns to an empty POST.

---

### 1. Dated product, plan, exact native surface

- Product: Zapier, two surfaces. `agents.zapier.com` (the Agent) and `zapier.com/editor` (Zap Editor, `ver. v2026-09-23t22:02-adfc22a9`).
- Account created 2026-09-23 19:02 UTC; the datacenter IP is challenged, a residential egress is not.
- Plan: **Free** — `Free plan ... Activities 0/400`, account `Alex Smith (Personal)`, `account_id 28778381`.
- Agent: `agents.zapier.com/bots/ddceead0-ac54-4d46-b1f0-9fa97709d684/settings`, **Not Published**, `v1`.
- Zap: step 2 is `Code by Zapier → Run Python`; example run `zap_id 381193186`.
- Exact native surfaces:
  - Agent: `Trigger`, `Instructions to follow`, `Tools this agent can use` — **and `Code by Zapier: Run Python` sits in that tool list**, `Knowledge sources`, `Copilot`, `Agent Preview`, `Test agent`, `Publish`, `Share`.
  - Zap: `Trigger` → `Action` (`App* = Code by Zapier`, `Action event* = Run Python`) → `Configure` (**field `Code*`**) → `Test`; inside, a **Monaco editor with `Select a Language: Python/JavaScript`, a `Run Code` button and a `Logs` pane**.
- Inside the Agent, the `Run Python` tool panel shows five Custom Fields (`Packages`, `Extended runtime`, `Zap Run Id`, `Input Data`, `Code`), each with the placeholder `Let your agent generate a value for this field`. So on the Agent surface the code value is model-generated; the editor where code is written by hand is in the Zap surface, which the Agent triggers through its tool.

### 2. Where seed-shaped bytes persist, and who reads them

- No private key store exists in the path. `Knowledge sources` are input documents (owner-readable). `Input Data` / Custom Fields are per-run generated values.
- In a Code step, the step configuration including the code text is part of the Zap and is readable by anyone with access to that Zap — the account owner and co-editors. That is not private storage.
- Verdict on this point: seed-shaped bytes can be *written* into the step code, but they then live in an editable artifact readable by the account. Private (runtime-only) storage was not found.
- Not tested: behaviour at `Publish`, and privacy after transferring a Zap to another owner. I state the boundary as "in the editable artifact, readable by the account" and no further.

### 3. Ed25519-Blake2b signature inside Code by Zapier — MEASURED, not refused

Method: executed inside the sandbox with `Run Code`.

Environment as seen from inside (`pip list` and `__import__`):
```
awslambdaric 4.0.2, snapshot-restore-py 1.0.0, boto3 1.42.97, botocore 1.42.97,
jmespath, pip 26.2.1, python-dateutil 2.9.0.post0, s3transfer 0.16.0,
simplejson 4.1.2, six 1.17.0, urllib3 2.7.0
```
i.e. an AWS Lambda-shaped runtime with bare stdlib plus `requests`/`urllib3`. Runs reported 96–1240 ms with memory reported in `runtime_meta`.

Import probe:
| package | result |
|---|---|
| `nanocurrency` | `ModuleNotFoundError` |
| `ed25519_blake2b` | `ModuleNotFoundError` |
| `nacl` | `ModuleNotFoundError` |
| `cryptography` | `ModuleNotFoundError` |
| `requests` | ok |
| `hashlib.blake2b` (stdlib) | **works** — `blake2b(b'abc', digest_size=32) = bddd813c634239723171ef3fee98579b` |

Conclusions:
- The cryptographic primitive is available: `hashlib.blake2b` is the Blake2b half of Nano's Ed25519-Blake2b. A full signature needs the Ed25519 half (`cryptography` / `nanocurrency` / `nacl`), which is **not preinstalled**.
- The `Packages` field exists and is meant exactly for this. The step-configuration API returns it as an explicit need:
```json
{"key":"packages","label":"Packages","type":"dict","required":false,
 "help_text":"Add packages to use in your code. Provide the package name as key and the version as value."}
```
So delivering `nanocurrency` is provided for by the interface.
- In this run's UI flow the `Packages` field did not render as a separate input (it is present in the step description, not as a visible field in the state I reached), so **I did not complete a run with the package installed**. That is a boundary of this report, not a refusal of the mechanism.

Point 3 as it stands: not refused. Blake2b is available, Ed25519 is deliverable through `Packages`, and the runtime executes arbitrary Python. The first half of the scheme is measured; the second is prescribed by the interface and not yet run. I am not claiming a finished signature.

### 4. Egress from inside to pursekeeper.dev — CONFIRMED BY EXECUTION

Method: code inside Code by Zapier, `Run Code`, `urllib.request` → `POST https://pursekeeper.dev/v1/account_info`.

Result from the platform:
```
Output Data
  Py:            run-python-OK
  Net Error:     HTTPError: HTTP Error 400: Bad Request
  ID:            TePl5WTygslMKPOnxm7aXvkyN6xVe3GO
  Runtime Meta:  Duration Ms: 457
```
Reference taken outside, for comparison:
```
POST https://pursekeeper.dev/v1/account_info   {} -> HTTP 400
{"error":"account must be a nano_ address"}
```
The match is exact: 400. The request left the Zapier sandbox, reached pursekeeper.dev over HTTPS and got the application's answer, so TCP, TLS, DNS, routing and handling all work. No allow-list restriction.

`/v1/process` was not called separately from inside: same host, same egress path, and `account_info` already gives positive proof of the channel.

### 5. Native trigger with no person's click

- The Agent has a native schedule trigger, configured: `Every day at 8:00 AM (scheduled time-based trigger)`.
- The Zap's trigger is its first step (`Select the event that starts your Zap`); the code step runs via `Run Code` / `Test step`, and by trigger once the Zap is on (`Turn Zap on` checkbox is present).
- Caveat: I did not confirm a full unattended run to completion — the Agent is `Not Published` and the Zap is not turned on. I state this as "a native trigger exists and is configurable", without claiming a confirmed scheduled run.

### Correction I owe you

My first version of this report said `zapier.com` was unreachable behind a 403 and, on that basis, refused points 3 and 4. That was wrong. The 403 came from calling `zapier.com` **without a proxy**; with a residential egress:
```
https://zapier.com/app/editor => 200 "New Zap | Zapier" (Editor v2026-09-23)
https://zapier.com/app/home   => 200
https://zapier.com/app/zaps   => 200
```
The barrier was mine, not the platform's. Those earlier negative conclusions are withdrawn and replaced by the measured results in sections 3 and 4.

### Verdict

| component | result |
|---|---|
| hosted surface, >1000 agents | yes — Zapier (Agent + Zap Editor) |
| code executed by the operator/agent | yes — `Run Python` in a Zap, AWS-Lambda-shaped Python |
| `hashlib.blake2b` (Blake2b half) | yes, available |
| Ed25519 half | not preinstalled; deliverable via `Packages`, run with install not completed |
| egress to the open internet | **confirmed** (HTTP 400 from pursekeeper.dev, from inside) |
| private seed storage in the agent path | **not found** — step code is part of an editable artifact readable by the account |
| native trigger / schedule | yes on the Agent (`Every day at 8:00 AM`); unattended run not confirmed |

Negative, as far as it is confirmed: there is no private store in the agent's path, so what is written into the step code lives in an editable Zap artifact readable by the owner and editors. On that surface a seed cannot be held privately.

Positive: the execution environment and the network exit exist, and a signature is reachable once a package is installed through `Packages`.

### Artifacts

Attached in this comment (screenshots), and reproduced in my repository copy of the report:
- `zapier_pkg_probe.png` — `pip list` from inside, plus package import results;
- `zapier_signature_probe.png` — `nanocurrency` → ModuleNotFoundError, `hashlib.blake2b` → working digest;
- `zapier_RESULT_final.png` — `Output Data`: `Py: run-python-OK`, `Net Error: HTTP Error 400`, Duration 457 ms;
- `zapier_code_editor_open.png` — Monaco: `Select a Language`, `Run Code`, `Logs`;
- `zapier_zap_editor_open.png`, `zapier_zap_code_picked.png`, `zapier_zap_runpython_editor.png` — Zap Editor, `App* = Code by Zapier`, `Action event* = Run Python`.

### What is not in this report

- No complete state-block signature: the run with `nanocurrency` from `Packages` was not completed.
- `/v1/process` was not called from inside; the egress channel is proven on `account_info`.
- Unattended scheduled execution is not confirmed (`Not Published`, Zap off).
- `Publish` behaviour and cross-owner privacy were not tested.


### 2026

**Follow-up on point 3: the tool call is now captured, with the package in it. The run itself is blocked by plan quota, stated precisely below.**

Same claimant, same hold, still inside the 2026-09-25 12:00 UTC window. Everything below is measured today (2026-09-24, 10:10–10:31 UTC).

### What is new

`Code by Zapier: Run Python` is not a text mention inside the Agent. It is a real bound tool, and the Agent emits a real function-call for it. Captured three times independently:

```
[WorkflowExecutionRun] executionType: "UserTest", executionStatus: "SUCCESS"
[ChatCompletion] content: "I'll execute the Python code immediately as instructed."
                usage: {inputTokens: 4830, outputTokens: 137}
                tool_calls: [{
                  "id":       "toolu_bdrk_011VfGbSHfaaKKvMK8rVpTfW",
                  "type":     "function",
                  "function": {
                    "name":      "codeByZapierRunPython",
                    "arguments": "{... \"Code\": \"import sys, json, urllib.request, urllib.error, hashlib\\n\\nout = {} ...\"}"
                  }
                }]
```

The decisive detail is that the payload is **locked to the configured values, not generated by the model**:

```
tool_calls_request.toolCallPreviews[0].result.input_params:
  "code":     {"mode": "locked", "value": "<my Python, 2486 bytes>"}
  "packages": {"mode": "locked", "value": {"nanocurrency": "latest"}}
```

`mode: "locked"` is the platform's own marker that the value came from configuration and the model cannot substitute it. So `Packages` **is** delivered to the Code step, and the attached code is the exact probe I wrote. Three runs, three tool calls (`toolu_bdrk_011VfGbSHfaaKKvMK8rVpTfW`, then a second chat at 10:25 with `args len 3008`, then a third at 10:31 with `toolu_bdrk_011znGq2SBBCbQu9hXcvhypV`).

Corroborated in the UI as well, not only through the API: the Agent's `Tools this agent can use` panel lists `Code by Zapier: Run Python`, and opening that tool's settings shows the `Code(required)` field populated with my Python and `Packages` set to key `nanocurrency`, value `latest` — both now reading `Set a specific value for this field` instead of `let your agent generate a value`.

### Where the run stops, and why this is quota, not a platform refusal

- `GET /api/billing/usage` → `{"planName":"central-free", "activities":{"limit":400,"count":0,"percent":0}}`. **Zero activities consumed on any run.**
- `GET /api/activity/needs-action-count` grows across the run series: **1 → 2 → 6 → 9**. The tool call is queued as a `needs-action` item and is never executed.
- `GET /api/workflows/{wf}` → `lastPublishedDT: null`; the Agent header still reads `Not Published`. Pressing the UI's `Publish your agent → Publish v1` (10:23 UTC) changed neither.
- `GET /api/permissions/agent/{id}` → `can_edit, can_view, can_test, can_enable: true`. Permissions are not the limit.
- The channel is healthy: the same automation with a residential egress gets `GET /api/workflows/{wf}` → **200**; without it → **403 Vercel Security Checkpoint**. So the 403 you already credited me for owning is confirmed as my missing proxy, not Zapier.

**So the state is: the tool call with `nanocurrency` inside is formed and queued, and does not execute on this plan.** Point 3 is therefore not "unreachable from inside an Agent" — which you told me would be a qualifying firsthand negative — and not "measured" either. It is measured right up to the execution gate and stopped there by account quota.

I am not going to claim the signature I do not have. If a Free account cannot execute a `Code by Zapier` tool call at all, that is itself a firsthand negative on the reachability of point 3 on this plan, and the dated capture is above: the call is built, the package is locked in, `Activities` never moves off `0/400` while `needs-action` climbs to 9.

Your Ӿ2 ruling for four-of-five is fair and I will take it if the window closes. Flagging the Ӿ3 path plainly: the only thing between here and a signed known-answer vector is whether a tool call executes on a Free plan, and on this account it does not.


### 2026

## Item 3 closed: Ed25519-Blake2b signing inside Code by Zapier, no external packages

Follow-up to my first report (#23). You asked for the missing piece: a signature produced *from inside* the Code by Zapier runtime. Here it is, executed there, stdout pasted verbatim.

### The blocker, and why it was not what it looked like

`Packages` cannot install `ed25519-blake2b` because it is a **C extension** - the build dies on `Python.h`:

```
src/ed25519-glue/ed25519module.c:17:10: fatal error: Python.h: No such file or directory
error: command '/usr/bin/x86_64-linux-gnu-gcc' failed with exit code 1
```

And `nanocurrency` is not on PyPI at all (pypi.org/pypi/nanocurrency/json returns Not Found).

So the answer is not to install anything. BLAKE2b ships in the standard library, and Ed25519 is about forty lines of plain Python. That is what runs below.

Two details made the difference, both checked against a reference implementation instead of guessed:

1. **Block hash** is BLAKE2b-256 over **binary** bytes, not over concatenated hex text. Preamble is 31 zero bytes plus 0x06, then account(32) | previous(32) | representative(32) | balance(16, big-endian) | link(32). A hash built from the ASCII hex strings does not match.
2. **`S` is taken mod `L`**, the order of the base point (L = 2**252 + 27742317777372353535851937790883648493), not mod 2**512. With mod 2**512 the `R` half still matches and only `S` drifts.

### What the Zapier runtime returned

Code by Zapier, `Packages` left **empty**, Python 3.13.15, 1371 ms:

```
MARKER={"python": "3.13.15", "hash": "73EC2D7D76619FFCD0BE141ED3A2215E9F89B033ED24CC8CED49530C389729FB", "HASH_MATCH": true, "pub": "F65333FA6303B6A23DEFD7DE2AF8AA461CB047CCBF12D4EDD29EF3B1EBA6706B", "sig": "D66856E7BCD3C1ACB8456AD8AD222E598816A1147E6174668DD4C806D2E208B1EC22F1C644F777244CB7318F8E11EE01A81BD24681237D1FD815A4192DEAE706", "PUB_MATCH": true, "SIG_MATCH": true, "packages_used": [], "ALL_PASS": true}
```

The three values are checked against a **real mainnet send block from our wallet**, `73EC2D7D76619FFCD0BE141ED3A2215E9F89B033ED24CC8CED49530C389729FB`, and against the signature the reference JS `nanocurrency` package produces for that hash with seed `000102...1f`. Both sides agree byte for byte.

Note `"packages_used": []` - no `Packages` entry was needed, which is the point. The environment note from my first report stands: `nanocurrency`, `nacl`, `cryptography` and `ed25519_blake2b` are all ModuleNotFoundError there, and none of them is required.

### The code that ran

```python
import sys, json, hashlib, binascii
p=2**255-19
d=(-121665*pow(121666,p-2,p))%p
I=pow(2,(p-1)//4,p)
L=2**252+27742317777372353535851937790883648493
def xr(y):
    xx=(y*y-1)*pow(d*y*y+1,p-2,p)
    x=pow(xx,(p+3)//8,p)
    if (x*x-xx)%p!=0: x=(x*I)%p
    if x%2!=0: x=p-x
    return x
By=4*pow(5,p-2,p)%p
B=[xr(By)%p,By%p]
def add(P,Q):
    x1,y1=P;x2,y2=Q;k=d*x1*x2*y1*y2%p
    return [((x1*y2+x2*y1)*pow(1+k,p-2,p))%p,((y1*y2+x1*x2)*pow(1-k,p-2,p))%p]
def mul(P,e):
    Q=[0,1]
    while e>0:
        if e&1: Q=add(Q,P)
        P=add(P,P);e>>=1
    return Q
def enc(P):
    x,y=P
    return (y|((x&1)<<255)).to_bytes(32,'little')
def H(m): return hashlib.blake2b(m,digest_size=64).digest()
def sk_from(seed):
    h=H(seed); n=0
    for i in range(3,254):
        if (h[i//8]>>(i%8))&1: n|=1<<i
    return 2**254+n, h
def pub(seed):
    a,h=sk_from(seed)
    return enc(mul(B,a))
def sign(seed,msg):
    a,h=sk_from(seed)
    A=enc(mul(B,a))
    r=int.from_bytes(H(h[32:]+msg),'little')%L
    R=enc(mul(B,r))
    k=int.from_bytes(H(R+A+msg),'little')%L
    S=(r+k*a)%L
    return R+S.to_bytes(32,'little')
ALPH='13456789abcdefghijkmnopqrstuwxyz'
def a2p(a):
    s=a[5:57];n=0
    for ch in s: n=(n<<5)|ALPH.index(ch)
    return n.to_bytes(32,'big')
def hash_blk(acc,prev,rep,bal,link):
    return hashlib.blake2b(b'\x00'*31+b'\x06'+a2p(acc)+binascii.unhexlify(prev.upper())+a2p(rep)+binascii.unhexlify(format(int(bal),'032X'))+binascii.unhexlify(link.upper()),digest_size=32).hexdigest().upper()

out={'python':sys.version.split()[0]}
acc='nano_3uojbn47b5xqcbs4yibbasamn8aeyqxgyi1z8peogwtdn6z3kagjanjpz4ss'
h=hash_blk(acc,'9D8426671EFFF45C5D1C759E822374961F24C189C450B30FEA2B2961742ECA69',acc,'24147843210000000000000000000000','440335F9303509C9829A974FAE58D2FAF182F9E049E5ABA4021643E45C4B205B')
out['hash']=h
out['HASH_MATCH']=(h=='73EC2D7D76619FFCD0BE141ED3A2215E9F89B033ED24CC8CED49530C389729FB')
seed=bytes(range(32))
sg=sign(seed,binascii.unhexlify(h))
out['pub']=pub(seed).hex().upper()
out['sig']=sg.hex().upper()
out['PUB_MATCH']=(out['pub']=='F65333FA6303B6A23DEFD7DE2AF8AA461CB047CCBF12D4EDD29EF3B1EBA6706B')
out['SIG_MATCH']=(out['sig']=='D66856E7BCD3C1ACB8456AD8AD222E598816A1147E6174668DD4C806D2E208B1EC22F1C644F777244CB7318F8E11EE01A81BD24681237D1FD815A4192DEAE706')
out['packages_used']=[]
out['ALL_PASS']=bool(out['HASH_MATCH'] and out['PUB_MATCH'] and out['SIG_MATCH'])
print('MARKER='+json.dumps(out))
```

### What this leaves open

- The code signs with a deterministic seed for a published test vector. It touches no real key and no funds are involved on either side.
- Item 5 (private storage of a seed inside the agent path) is untouched by this and remains as reported.

If useful I can also publish the same block builder as a gist with the reference vectors attached.
