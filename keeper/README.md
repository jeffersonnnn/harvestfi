# RWA Perps - Price Keeper (Phase 2)

Off-chain service that pushes commodity prices to the on-chain `PushPriceOracle`. It pulls quotes,
**normalizes them to USD × 1e8**, signs `(chainId, oracle, commodityId, price, timestamp)`, and calls
`postPrices`. The oracle verifies the ECDSA signature against its `trustedSigner` and enforces
monotonic, non-future, non-stale timestamps.

## Why normalization is the hard part

Trading Economics quotes commodities in **mixed units and currencies**. The critical trap: grains and
softs are in **US cents** (`USd`, e.g. Corn `441.71 USd/Bu` = $4.4171), while metals/rice/energy are in
**dollars** (`USD`). Miss this and every grain price is 100× wrong. The authoritative per-commodity
currency table lives in `src/commodities.ts`; conversion is in `src/normalize.ts`. See also
`../contracts/KEEPER.md`.

## Layout

| File | Role |
|---|---|
| `src/commodities.ts` | `commodityId → {symbol, teSlug, currency, unit}` - source of truth for cents/dollars |
| `src/normalize.ts` | raw quote → 1e8 USD (handles `USd` cents, `GBp` pence, FX) |
| `src/fx.ts` | foreign→USD rates (only used once non-USD commodities are listed) |
| `src/sign.ts` | contract-matching digest + EIP-191 signature |
| `src/sources.ts` | `static` fixture source (dev/dry-run) + Trading Economics API adapter |
| `src/index.ts` | main loop: fetch → normalize → sign → `postPrices` |

## Run

```bash
npm install
cp .env.example .env      # then edit
npm test                  # normalization + signature round-trip
npm run typecheck
npm start                 # runs the loop (DRY_RUN=true by default: logs, no txs)
```

Dry-run works with no configuration (uses a static price fixture + the Anvil dev key placeholder).
For live posting, set `DRY_RUN=false`, a real `ORACLE_ADDRESS`, `RPC_URL`, and the real signer
`PRIVATE_KEY` (must equal `PushPriceOracle.trustedSigner()`).

## Key decisions / caveats

- **Signer key custody.** The signer key is the entire system's price-integrity trust anchor. This MVP
  reads it from an env var (matching the sibling keepers); production should use a KMS/HSM signer. See
  `../contracts/DECISIONS.md`.
- **Data source.** `PRICE_SOURCE=static` ships a last-observed fixture so the pipeline is runnable and
  tested offline. `PRICE_SOURCE=tradingeconomics` uses the official TE API (`TE_API_KEY` required) -
  verify the response field mapping against your plan. Scraping the public page is fragile and may
  violate TE's ToS; not the default.
- **Signature compatibility.** `signPrice` builds `keccak256(abi.encode(...))` with the exact field
  order/types as `PushPriceOracle.priceDigest` and signs it with the EIP-191 personal prefix - the same
  scheme the contract's Foundry tests already prove the Solidity side accepts. `test/sign.test.ts`
  additionally checks the signature recovers to the signer.
