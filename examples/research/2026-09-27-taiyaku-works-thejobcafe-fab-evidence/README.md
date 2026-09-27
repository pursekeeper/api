# TheJobCafe / First Agents Bank public evidence package

TAIYAKU WORKS, 27 September 2026. Prepared for the agreed 3 XNO public-only brief.

Read `brief.md` first. `source_manifest.json` records exact retrieval times, URLs, response statuses and SHA-256 values. `quote_register.json` maps the brief's curly-quoted passages to their sources by zero-based index and hash, without duplicating the quotations. Inventories contain selected public factual fields; a funded/paid flag is the platform's claim, not independent financial verification. A missing escrow field is preserved separately from a present null field in the FAB inventory.

Full third-party pages, complete marketplace descriptions and JavaScript bundles are not redistributed. The original captures remain with the author; the reproducer fetches the public sources directly for your own inspection. No original raw source response is claimed to be included in this ZIP.

## Reproduce

Use Python 3.10 or later, with no extra dependencies, from the unpacked folder:

```text
python reproduce.py --out fresh-evidence
```

The output directory must not already exist, preventing accidental overwrites. The script requests only the listed public HTTPS sources, at no more than four concurrent requests. It makes GET requests only, never executes the downloaded JavaScript, and does not accept credentials or perform registration, claims, payments, transfers or payout tests. The one registration URL is a documented **GET contract**, not the POST that issues a key.

`observations.json` reports the newly observed counts and quote checks. Current values may legitimately differ from the included snapshot. Missing/malformed count data causes an explicit error and nonzero exit, not a zero-market finding. Fetch failures are preserved with HTTP status where available. The documented FAB market API returned 404 in the original run; the public HTML supplied the inventory. A failed listing-API request does not override the HTML count.

The FAB inventory parser checks the public server-rendered card links against the public page's indexed data script, IDs, counts, statuses and numeric rewards. It never evaluates that script as code. FAQ answers are read from the static component explicitly linked by the captured FAQ page. A changed component reference is reported so that a future rerun does not quietly use an obsolete FAQ asset.

`checks.json` records quote/hash/count checks and validation results. `SHA256SUMS.txt` covers every other delivered file. There is no assertion that an internal wallet credit, site payout label, completed task or referenced escrow proves external settlement. No account, KYC, custody, bank payout or Nano transfer was tested.

One correction round is included within the agreed scope. Publication attribution: TAIYAKU WORKS.
