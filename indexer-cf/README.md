# RWA Perps indexer — Cloudflare Worker + D1

Always-on, no VPS. A cron Worker indexes the chain into **D1** (Cloudflare's SQLite) and serves a
read API the frontend uses for **positions**, **price history/sparklines**, and the **`/card/[id]` OG**
lookup. Replaces the (VPS-bound) Ponder scaffold in `../indexer/`.

## What it does each minute
- **Positions:** reads `PositionOpened` / `PositionClosed` logs incrementally (range-capped, backfills
  over runs) → upserts the `positions` table.
- **Prices:** reads every market's current oracle price in one multicall → appends to the `prices`
  table (one snapshot per market per tick; PK dedupes).

## API (workers.dev URL after deploy)
- `GET /positions?trader=0x…` — a trader's positions (open + closed).
- `GET /position/{id}` — one position (for the OG card).
- `GET /prices?market={id}&limit={n}` — price history, chronological (for sparklines).

## Setup (one time)
```bash
cd indexer-cf
npm install
npx wrangler d1 create rwa-perps          # prints a database_id → paste it into wrangler.toml
npm run schema:remote                      # create tables in the deployed D1
```

## Run / deploy
```bash
npx wrangler dev                           # local: hit http://localhost:8787/health and /__scheduled
npx wrangler deploy                        # live: cron indexes every minute; note the workers.dev URL
npx wrangler tail                          # logs
```
Then set the frontend env `NEXT_PUBLIC_INDEXER_URL` to the deployed workers.dev URL.

## Notes
- Read-only (no private key). Subrequest budget per tick ≈ getBlockNumber + 2×getLogs + ≤24×getBlock +
  count + multicall ≈ under the free 50-cap; tune `MAX_BLOCK_META` / `MAX_RANGE` if needed.
- Mainnet: swap `CHAIN_ID` / `RPC_URL` / addresses / `START_BLOCK` in `wrangler.toml`.
