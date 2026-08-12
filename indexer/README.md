# RWA Perps position indexer (Ponder)

Watches the `PerpEngine` and keeps a queryable `position` table (open → closed), so the frontend can
ask "this trader's positions" instantly instead of scanning `getLogs` on every load. **You do not
need this until scale** — the app works without it. It's here so it's a fast deploy when you do.

## Run
```bash
cd indexer
cp .env.local.example .env.local     # fill PERP_ENGINE_ADDRESS + PERP_ENGINE_START_BLOCK + RPC
npm install
npm run dev                          # serves a GraphQL/SQL API at http://localhost:42069
```
Then point the frontend's position query at the indexer instead of the `getLogs` scan in
`app/src/hooks/use-positions.ts`.

## Deploy (when needed)
Any Node host works — Railway/Fly (bundle Postgres) or a $5 VPS + Neon/Supabase Postgres. Set the same
env vars + `DATABASE_URL`, run `npm start`.

## ⚠️ Un-run scaffold — verify before relying on it
This was written from the verified **event/data model** (PerpEngine `PositionOpened` / `PositionClosed`,
see `abis/PerpEngineAbi.ts`) but has **not been installed or run**. Ponder's framework API (schema
`onchainTable`, `ponder:registry` / `ponder:schema` virtual modules, config shape) shifts between minor
versions. Before trusting it: `npm install`, then `npm run codegen && npm run dev`, and adapt the
config/schema syntax to your installed Ponder version if it complains. The **event → column mapping in
`src/index.ts` is the source of truth**; the framework glue around it is adjustable.

> **Superseded** by `../indexer-cf/` (Cloudflare Worker + D1) — the always-on, no-VPS indexer. Kept for reference.
