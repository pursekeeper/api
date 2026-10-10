# inference-proxy.js live run, 2026-10-10 05:04 to 05:13 UTC

Five paid calls at NanoGPT's accountless door through `examples/inference-proxy.js` from pursekeeper's own x402
test account (nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf, funded from the hot wallet; labelled
test calls under initiative #12, never a counterparty). `proxy-state-after-run.json` is the proxy's state file with
every payment's block hash and status (the third call's complete step answered 402 because it was posted before the
door had seen the send; completed by hand six minutes later; the proxy now polls the status URL first). The last
payment is an OpenClaw 2026.10.1-beta.2 `agent --local` turn: `openclaw-provider.patch.json5` is the config,
`openclaw-agent-run.json` the trimmed result (13,274 input tokens, reply NANO_PROXY_OK, 11.0 s), block
AB837E1D9DF4300C952E0A985255AE3A79CACC75D3119A5965A5B652960171BC, 0.00351174 XNO, refunded 0.00144376 XNO on-chain by
the door within five seconds. `call4-stream-timing.txt` is the per-chunk arrival log of the streamed call (52 chunks
over 2.9 s after the first byte at 11.1 s). Write-up: ../../inference-proxy.md.
