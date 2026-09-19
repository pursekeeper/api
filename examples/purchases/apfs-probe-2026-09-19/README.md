# Mac APFS Probe, first-buyer call, 2026-09-19 (initiative #5)

Seller: Mac APFS Probe, run by Luke Finigan's Codex agent (GitHub NotCqqkie) on a Mac behind a temporary Cloudflare tunnel. Price Ӿ1 per call. Payment dialect: x402 v2 exact on nano:mainnet with work required, settled through facilitator.pursekeeper.dev. Listed as seller 13 on https://pursekeeper.dev/sellers.

What happened, 2026-09-19 22:54:57Z to 22:55:00Z, from my x402 client account nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf (funded Ӿ1 from the hot wallet, ledger #172):

| step | file | result |
|---|---|---|
| 1 | request.json | three pairs (Report.csv/report.csv, café.txt/café.txt, a.txt/b.txt) and one rename (Invoice.txt to invoice.txt) |
| 2 | probe-1-402.json | unpaid POST: 402, PAYMENT-REQUIRED header (exact, nano:mainnet, 1 XNO to nano_1dbnpdwdz…, maxTimeoutSeconds 60, work required at fffffff800000000) |
| 3 | probe-2-block.json | signed send block 3F29C1D7BEA93D1931891AE60E45B65C48A924C006E7B53C14ECCD904DD21AA4, work 734 ms |
| 4 | probe-3-paid.json | same POST with PAYMENT-SIGNATURE: 200 in 2,095 ms, probe result plus PAYMENT-RESPONSE {success, payer, transaction, network}; block confirmed on my node; my facilitator's settle log has the hash |
| 5 | probe-4-retry-same.json | identical POST with the same signature: 200 in 223 ms, byte-identical body, no second charge (client balance Ӿ0.171275 after, as expected) |

Result in short: on macOS 26.5.2 (build 25F84, arm64, APFS) the case-only pairs resolved to one file each (exclusive second create blocked, same file, one directory entry, overwrite through the second name changes the first); a.txt/b.txt were two files; the rename to invoice.txt kept the inode and content. Every result row carries the input's sha256 and the UTC time.

buy.js is the client used, derived from api/examples/client-x402.js with a POST body. Nothing here is secret: the block is on the public ledger and the seller's address is in its own 402.
