# Keeper on Cloudflare Workers (no VPS, no laptop)

A Cron Trigger fires the Worker every minute; it runs one price tick (fetch TE → normalize → sign →
post). Always-on in Cloudflare's edge, free tier, and the signing key is an encrypted Worker Secret.

## One-time setup
```bash
cd keeper                      # the Worker reuses ../src (tick.ts + friends)
npm install                    # keeper deps (viem)
npm install -D wrangler        # the Cloudflare CLI
npx wrangler login             # opens the browser - you approve (I can't do this step)
```

## Configure
1. Edit `worker/wrangler.toml` → set `CHAIN_ID`, `RPC_URL`, `ORACLE_ADDRESS`, `REGISTRY_ADDRESS`.
2. Set the two secrets (never in the toml or git):
   ```bash
   cd keeper/worker
   npx wrangler secret put TE_API_KEY     # paste your TE key
   npx wrangler secret put PRIVATE_KEY    # paste the oracle signer key
   ```

## Test, then deploy
```bash
cd keeper/worker
npx wrangler dev --test-scheduled        # local run; hit http://localhost:8787/__scheduled to fire a tick
npx wrangler deploy                      # live - the cron starts firing every minute
npx wrangler tail                        # live logs: "posted N price(s): 0x..."
```

## Notes / caveats
- **One keeper only.** If a Node keeper is also running with the same signer, they collide on nonce.
  Pick Workers OR a host, not both.
- `nodejs_compat` is required (set in wrangler.toml) because the shared modules use `process.env` and
  viem's crypto. If a module hits an unsupported Node API on deploy, that's where to look.
- **Un-verified in the Workers runtime.** The logic is the same `tick.ts` the Node keeper runs and
  passes locally, but it has NOT been executed inside a Worker. Run `wrangler dev --test-scheduled`
  and confirm a tick posts before trusting it in production.
- Security: the key as a Worker Secret is better than plaintext on a laptop, but still not KMS. See
  GO-LIVE.md accepted risks.
