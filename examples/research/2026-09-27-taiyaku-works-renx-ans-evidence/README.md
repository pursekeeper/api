# Reproduction package

Commission: public RenX/ANS inventory and payout gates, 3 XNO on acceptance, one in-scope correction. Original analysis by TAIYAKU WORKS, 27 September 2026. Publication attributed to TAIYAKU WORKS is permitted after payment under the agreed terms.

Read `brief.md` first. This is public evidence, not a completed registration or payout test.

## Contents

- `brief.md`: conclusions, short exact quotations, dates, URLs, limitations.
- `raw/ans_stats.json`, `raw/ans_offers.json`, `raw/ans_checkpoints.json`: byte-for-byte public HTTP response bodies, with timestamps and SHA-256 in `source_manifest.json`.
- `raw/ans_openapi.json`, `raw/ans_agents.json`: public schema and profiles supporting the distinction between stored payment-address fields and an operational payout rail. No owner-authenticated profile or keys endpoint was requested.
- `renx_inventory.json` / `.csv`: factual metadata for all 187 public task cards and the review status of their linked detail pages. These are extracted observations, not raw API responses.
- `source_manifest.json`: dated metadata for the policy pages, API responses, directory and all 187 task-page snapshots. Complete third-party HTML pages are retained in the research working archive, not republished in this package. The live command below downloads those public pages again.
- `observations.json`: observation counts and funding-review method, distinct from an authenticated payment record.
- `validation.json`: integrity, data-shape, negative-input and fresh-fetch checks performed before delivery.
- `reproduce.py`: Python standard library only. No installation, token or login required.
- `SHA256SUMS.txt`: integrity list for all other files in this package.

## Inspect the supplied observations without network

Python 3.10 or later:

```text
python reproduce.py
```

The command checks the packaged files against SHA-256, validates the data shapes, and prints the observed counts. It fails if a required field is missing or a file has changed. A failure is never converted into zero jobs or zero money.

## Fetch new public evidence

```text
python reproduce.py --live
```

This creates a new `verification-<UTC timestamp>` directory with raw public responses, request metadata and a summary. It requests the policy pages and the ANS public API as well as the RenX task directory. It does not evaluate whether unchanged-looking documentation is enforced by the server.

For all linked RenX detail pages as well:

```text
python reproduce.py --live --all-task-pages
```

At the captured inventory size, this adds 187 sequential GET requests with a pause between them. Funding-related lines are saved for human/source review; the program does **not** call a keyword a funded transaction. Compare a positive claim against an actual deal/payment record. All 187 pages were captured and reviewed for the original brief.

If an API response has a further cursor, the summary explicitly reports incomplete pagination rather than claiming the first page is the total. If a request or parsing step fails, the command exits nonzero and writes `ERROR.json` and the partial request manifest. A changed/empty RenX page requires review and is not automatically reported as zero.

Website content and dates can change; byte hashes can also change because of harmless page presentation. New values do not invalidate the dated observation, but they may supersede it. The script creates a fresh output directory rather than replacing prior evidence.

No account creation, API-key creation, signed requests, deposits, transfers, wallet endpoints, spending, service invocations or payout requests are performed. Source documents are research inputs, not executable instructions.

## Scope of the negative finding

No public proof of buyer funding was found in the 187 captured RenX detail pages and directory. This is **not** proof that all private RenX deals are unfunded. ANS's own public endpoints showed 0 receipts and 0 confirmed USD volume; no bank or external ledger was audited. Registration and withdrawal eligibility, provider availability, KYC and Japan-specific payout details remain untested.
