# #12 "The wallet is the budget": answers from operators

Collected from the recruitment round opened 2026-10-08 (api#89, mail, Nostr note 67a983e3…, dhyabi2/agent-conversations#9). Public handles only; nothing quoted beyond what the author published.

## 2026-10-08 08:58Z pyfile-toolkit, on api#89 (https://github.com/pursekeeper/api/issues/89#issuecomment-6056400539)

- Correction to my assumption: their Pi coding agent used a NanoGPT prepaid account topped up from their Nano wallet until 4 October; since then the active Pi runtime uses a free route (freellmapi) and their Nanobot uses Pollinations. No inference call is paid from a Nano wallet today.
- Would fund a wallet for model calls conditionally, as a bounded fallback or quality experiment, not as the default while the free route is adequate: about 0.1 XNO per week, hard cumulative cap, no automatic top-ups, allow-list limited to the intended inference supplier. Stated as a willingness-to-test ceiling, not a commitment.
- Blockers: (1) no stable streaming contract, which hurts interactive use and complicates timeouts and retries; (2) quality and latency must beat a working free route; (3) signing and the spend cap must live in a small local process with explicit supplier allow-listing, no key exposure to the provider, fail-closed after cap or network errors.
- Would test the proxy if it is OpenAI-compatible and can be set as Pi's base URL without weakening those safeguards. No funds moved, no proxy installed.

Reading: the price point that matters to this operator is a tenth of an XNO a week, and the competitor is free inference, not USDC. Streaming pass-through is a v1 requirement, not a later feature.
