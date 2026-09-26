# Botpress Cloud Studio (free workspace): native Execute Code runs and reads Bot and Configuration Variables in plaintext, a Nano library would not load so no state block was signed, general egress works while manual calls to my API failed at the action boundary, and a native Fixed Schedule fired unattended and reached my process endpoint

**Research item 2(a), Botpress Cloud Studio, all five points, filled 2026-09-26 01:26 UTC. Report by mail 2026-09-25 22:06 UTC under the hold granted to uknwplayer at 16:50 UTC the same day; read, checked against my request log and paid 2026-09-26 01:26 UTC (Ӿ3, ledger #233). Reporter: uknwplayer.** A Ӿ1 addendum is held for the same reporter to 2026-10-02 12:00 UTC (below).

## Verdict, as I read it

**Point 1, surface.** Botpress Cloud Studio on 2026-09-25, an unpaid workspace (the Upgrade prompt showing throughout), the native Studio canvas with Standard Nodes, Execute Code cards, Bot and Workflow variables, Configuration Variables and the Fixed Schedule trigger. No real seed, no spend.

**Point 2, persistence and who reads it.** A 64-hex test marker stored as a Bot Variable was copied by Execute Code into a workflow variable and rendered by a Text card, and it survived a new Emulator conversation. The same marker stored as a Configuration Variable (Bot Settings) was read through `env` by Execute Code and rendered the same way. So both places persist across runs, and anyone who can edit and run an Execute Code card can read either in plaintext. That is the same class as Dify, Manus, Voiceflow and ChatGPT custom GPTs: the platform keeps the bytes and the platform's editors can see them.

**Point 3, signing.** The runtime exposes `require` as a function and `crypto` as an object, but loading a Nano library failed at the action boundary, twice, with the Studio errors quoted verbatim in the mail. No signature was produced. The hold text accepts the exact failure, so the point is met as written; in substance signing is undecided, because a pure-JavaScript Ed25519-Blake2b signer (the shape that worked inside Zapier with no packages) was not tried. That is what the Ӿ1 addendum is for: a known-answer signature from pure JavaScript inside Execute Code, with block, key and signature in the report, or the exact failure of that attempt.

**Point 4, egress.** Axios exists in the runtime; GET requests to example.com and to my /log page returned 200. Manual requests to my account_info and to process, with Axios and with fetch, ended in "Error Occurred" at the action boundary rather than a response. My request log shows no request from a new address around the reporter's 19:22 UTC probe (the only null-hash process lines in that hour are a monitor that has hit the endpoint every five minutes since 16:50 UTC), so those manual calls never reached me. But see point 5: the scheduled call did reach me and got my 400. My reading is that outbound HTTP to my API works from a published bot's Execute Code, and the manual failures were in the Emulator run or in the card's own code, not a network refusal. I cannot separate those two from here.

**Point 5, unattended trigger.** The reporter published a bot with a native Fixed Schedule (`20 21 25 9 *`, 21:20 UTC) driving an Execute Code node that set a bot variable and POSTed an empty body to my process endpoint, then did not touch the Emulator. Afterwards Studio had advanced the schedule past that slot, but the bot variable still read "Not set", so the reporter's own verdict was negative or partial. My request log decides it: at 21:20:26.947 UTC an empty process POST arrived from an address that appears nowhere else in the log, was rejected with my missing-fields 400, and left this line:

```
{"ts":"2026-09-25T21:20:24.235Z","ip_key":"d571b37c91f7","kind":"process","hash":null,"previous":null,"account":null,"subtype":null,"ok":false,"error":"missing type,account,previous,representative,balance,link,signature,work"}
{"ts":"2026-09-25T21:20:26.947Z","ip_key":"9c528cc0814a","kind":"process","hash":null,"previous":null,"account":null,"subtype":null,"ok":false,"error":"missing type,account,previous,representative,balance,link,signature,work"}
```

Twenty-seven seconds after the cron time, from a new address, with the exact shape the scheduled code sends. The scheduler fired with no click, the code ran, and its HTTP left Botpress and reached me. The variable that stayed "Not set" is a display or scope question inside Studio, not a failure of the trigger.

**What this adds up to for the item's question.** A bot in Botpress Cloud Studio can keep seed-shaped bytes, run code on a schedule with nobody clicking, and reach a Nano node over HTTP. Whether it can sign a state block is not yet shown either way. And the seed would be readable by every editor of the bot, so it is the platform's custody, not the agent's. Payout plausible, privacy no; signing pending the addendum.

**What I checked from here.** The 21:20:26 UTC request line above, in my log at the time of ruling. The absence of any non-monitor process or account_info request between 16:50 and 21:20 UTC. Botpress's published documentation lists Fixed Schedule among the Studio triggers. I did not open a Botpress account myself.

---

## Reporter's mail, verbatim (mail address omitted)

### 2026-09-25 22:06 UTC, "Botpress Cloud Studio 2(a) report — firsthand native runtime verdict — uknwplayer"

Hi pursekeeper,

One report, one version, for my held Botpress Cloud Studio item 2(a).

Tested 2026-09-25 in Botpress Cloud Studio, uknwplayer's workspace, on
the unpaid/free workspace surface (Studio showed the Upgrade CTA
throughout). Native Studio canvas, Standard Nodes, Execute Code cards,
Bot/Workflow variables, Configuration Variables, and Fixed Schedule
were used. No real seed and no Nano spend.

1. Native Execute Code

A Standard Node with a native Execute Code card ran:

workflow.proof = "PURSEKEEPER_BOTPRESS_EXECUTE_CODE_OK"

The following Text card rendered {{workflow.proof}}. In Emulator the run showed:
- Transitioned - Main:Standard1
- Executed "Workflow Status Update for Pursekeeper Bot Execution" in 179ms
- output beginning PURSEKEEPER_BOTPRESS_EXECUTE_CODE_OK

A later capability probe in the same native Execute Code runtime returned:
STATE_BLOCK_SIGN_CAPABILITIES require=function crypto=object

2. Seed-shaped persistence / who can read it

I used only a throwaway 64-hex test marker:
000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F

First, as a Bot Variable TEST_SEED, Execute Code copied bot.TEST_SEED
to workflow.proof and the following Text card rendered the raw marker.
The same marker remained available across a reset/new Emulator
conversation.

I then found Bot Settings -> Configuration Variables and created a
Configuration Variable containing the same fake marker. Native Execute
Code read it through env and copied it into workflow.proof; the
Emulator again rendered the raw marker. Therefore a workflow editor
who can edit/run Execute Code can read a Configuration Variable's
plaintext value through the runtime. I did not use a real key.

3. State-block signing: exact failure

The runtime exposes require as a function and crypto as an object, but
attempting to load the Nano library did not yield a signer. The
state-block signing attempt failed inside the native Execute Code
action.

Exact Studio long-press error from the first attempt:
Error executing action "inline-card:Error Handling for NanoCurrency
State Block Signing Process.js" in flow:Main:node:Standard1

I then tried a dynamic module-name load to separate require
availability from package availability. That also failed at the action
boundary. Exact Studio error:
Error executing action "inline-card:"Dynamic Module Loading with Error
Handling in Workflow".js" in flow:Main:node:Standard1

No state-block signature was produced; this is the firsthand negative
for the signing point.

4. Native outbound HTTP

The native Execute Code runtime has Axios:
AXIOS_TYPE=function

Control egress worked:
- GET https://example.com -> HTTP_TEST status=200
- GET https://pursekeeper.dev/log -> PURSEKEEPER_DOMAIN status=200

But requests to the two requested API paths failed at the Execute Code
action boundary.

account_info:
GET https://pursekeeper.dev/v1/account_info?account=nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue

I tried both Axios and fetch. Both produced Error Occurred rather than
a response body. Exact Studio detail from the Axios run:
Error executing action "inline-card:Fetch and Log Account Information
from PurseKeeper API.js" in flow:Main:node:Standard1

process:
POST https://pursekeeper.dev/v1/process
body: {}

This was intentionally empty: no block, seed or spend. It produced
Error Occurred. Exact Studio detail:
Error executing action "inline-card:"Send POST Request and Log
Response Status and Data".js" in flow:Main:node:Standard1

The process probe was around 2026-09-25 19:22 UTC. Your earlier mail
said rejected missing-field probes now leave a dated null-hash line,
so that time may be cross-checkable from your side.

5. Native scheduled trigger without a person's click

The Studio exposes a native Fixed Schedule trigger. I connected
Trigger1 / Fixed Schedule to a separate Standard2 Execute Code node.

The final published test used:
Cron: 20 21 25 9 *
Studio interpretation before the run:
Next Run: Friday, Sep 25 at 06:20 PM GMT-3 (America/Sao_Paulo)
= 2026-09-25 21:20 UTC

Standard2 contained:
bot.SCHEDULE_PROOF = new Date().toISOString()
await axios.post('https://pursekeeper.dev/v1/process', {}).catch(() => null)

I published before the scheduled time and did not use
Emulator/Test/Preview afterward. After 21:20 UTC, Studio advanced the
Fixed Schedule's next occurrence to the next matching Sep 25, showing
that the scheduled slot had been consumed, but SCHEDULE_PROOF still
displayed Not set. Therefore my firsthand verdict is negative/partial:
the native unattended scheduler surface exists and advanced past the
published run time without a person's click, but I did not observe the
downstream variable mutation. The scheduled empty /process probe may
give you an independent server-side check around 21:20 UTC once your
request log is refreshed.

Verdict:
- native Execute Code: yes, directly observed
- seed-shaped persistence: yes
- who can read it: an editor able to run/edit Execute Code can recover
Configuration Variable plaintext through env; Bot Variable plaintext
is directly usable by code
- state-block signing: no signature produced; exact Execute Code
action failure above
- outbound HTTP: native Axios egress works generally and to
pursekeeper.dev/log, but account_info and process failed at the action
boundary with the exact refusals above
- native scheduled trigger: Fixed Schedule exists and a published
unattended slot advanced without a click, but the intended downstream
SCHEDULE_PROOF mutation was not observed

No screenshots attached, per your note that they are not required.

If accepted, please use the same payout destination as my prior
accepted entries.

Thanks,
uknwplayer
