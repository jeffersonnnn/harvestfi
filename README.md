# HarvestFi

**On-chain perpetual futures on real-world commodities** — metals, energy, and agriculture — plus
prediction markets, a launchpad, and a market-license marketplace. Built on **Robinhood Chain** (an
Arbitrum Orbit rollup, chain **4663**).

**Live:** https://www.harvestfi.online

> ⚠️ The production domain is served through Vercel. If `harvestfi.online` is unreachable, check the
> domain's ICANN/WHOIS verification status at the registrar (an unverified registrant contact parks
> the domain and takes the site offline). The app itself also stays reachable at its Vercel URL.

---

## What it is

- **Perps.** Go long or short up to **10×** on **71 markets** — 23 agricultural, 28 metals/industrial,
  17 energy, and **3 synthetic index baskets** (Energy, Metals, Grain). Collateral is native **ETH**.
- **Index markets.** Each index is an **equal-weight basket rebased to 100**, derived by the keeper
  from its constituents and posted as a single tradeable price. Perps and predictions work on an index
  because they key off a `commodityId` — no special contract.
- **Prediction markets.** Parimutuel YES/NO markets on where a commodity (or index) closes by a date.
  Oracle-settled, no house; winners split the pot.
- **Market licenses.** Each market has one transferable **license NFT** whose holder earns **70% of
  that market's trading fees** (the protocol keeps 30%). Licenses trade on a built-in marketplace.
- **Launchpad + strategy coins.** Launch a memecoin paired to a real commodity market.
- **Shared LP pool.** A single ETH liquidity pool is the counterparty to all trader PnL, with an
  insurance-fund backstop for bad debt.

## How it works

```
Price sources ──► Keeper (Cloudflare Worker) ──► PushPriceOracle ──► PerpEngine ◄──► LiquidityPool
 (simulated /       normalize → 1e8 USD              (signed,          (open/close,      (ETH counterparty,
  Yahoo / Pyth)     → sign → post every ~5 min)      per-market)        oracle-priced)    insurance fund)
                                                          │
                                                          ├──► PredictionMarket (parimutuel, oracle-resolved)
                                                          └──► MarketLicenseNFT + FeeManager (70/30 fee split)
```

The keeper discovers the active market set from the on-chain registry each tick, so **listing a new
market needs no keeper redeploy** — just an owner `registry.list(...)` and a catalog entry.

## Monorepo layout

| Path | What |
|------|------|
| `contracts/` | Foundry (Solidity 0.8.24): `CommodityRegistry`, `PushPriceOracle`, `PerpEngine`, `LiquidityPool`, `FeeManager`, `MarketLicenseNFT`, `PredictionMarket`, launchpad + deploy/list scripts. |
| `app/` | Next.js + wagmi/viem frontend (the trading UI at harvestfi.online). |
| `keeper/` | TypeScript price keeper (viem). Runs as a Cloudflare Worker on a cron; normalizes prices to 1e8 USD, signs, and posts. |
| `indexer/`, `indexer-cf/` | Position/price indexer (Cloudflare D1). |
| `launchpad/` | Launchpad contracts/tooling. |

## Deployed — Robinhood Mainnet (chain 4663)

RPC: `https://rpc.mainnet.chain.robinhood.com`

| Contract | Address |
|----------|---------|
| CommodityRegistry | `0xB56AB31fb1F1559c435A72B5Fd3c7E63baea3D96` |
| PushPriceOracle | `0x43F4B3E880437De908f418B199daE8F326F0F41A` |
| PerpEngine | `0x343635C6602169993DA969A1E813093ba19A074a` |
| LiquidityPool | `0x67f707191497CEe11886BcD2cC23208367b7AFA5` |
| PredictionMarket | `0xF8Ba8D3F862E6C0fC002e371a08dA9f8119C6482` |
| LaunchRegistry | `0x59a277ce4Df70540fe06A193c4810e09Be8fe0e7` |

## Run it locally

```bash
# Contracts — build + test (64+ unit/invariant tests)
cd contracts && forge test

# Frontend — http://localhost:3000
cd app && npm install && npm run dev

# Keeper — post prices to the oracle (simulated demo feed)
cd keeper && npm install && PRICE_SOURCE=simulated npm start
```

Each package has its own `.env*.example`; copy it to `.env.local` / `.env` and fill in the values.
**Never commit real private keys** — production signing uses Cloudflare Worker secrets, and mainnet
ownership should be a multisig + KMS signer.

## Tech

Solidity 0.8.24 (Foundry) · TypeScript + viem · Next.js + wagmi · Cloudflare Workers + D1 · Vercel.

## License

MIT — see per-package files.
