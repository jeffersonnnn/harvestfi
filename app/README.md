# RWA Perps — Web App

Next.js 16 + wagmi v3 + viem + Tailwind 4 frontend for the commodity perps protocol. See
`../FRONTEND-PLAN.md` for the milestone roadmap. This is **F1** (scaffold + wiring): wallet connect,
add-network, faucet link, and a live read of the deployed registry to prove chain connectivity.

## Run

```bash
npm install
cp .env.local.example .env.local   # optional — defaults already point at testnet
npm run dev                        # http://localhost:3000
```

Defaults target the live **Robinhood testnet (chain 46630)** deployment; addresses live in
`src/lib/contracts.ts` (overridable via `NEXT_PUBLIC_*` env). To point at another deployment, set the
env vars in `.env.local`.

## Regenerating ABIs

`src/lib/abis.ts` is generated from the Foundry artifacts:

```bash
cd ../contracts
for C in CommodityRegistry PushPriceOracle MarketLicenseNFT LiquidityPool FeeManager PerpEngine; do
  name=$(echo "$C" | awk '{print tolower(substr($0,1,1)) substr($0,2)}')
  echo "export const ${name}Abi = $(forge inspect "$C" abi) as const;"
done > ../app/src/lib/abis.ts
```

## Layout
- `src/lib/chain.ts` — Robinhood chain (defaults to testnet 46630)
- `src/lib/wagmi.ts` — wagmi config
- `src/lib/contracts.ts` — addresses + ABIs
- `src/lib/abis.ts` — generated ABIs
- `src/components/` — providers, connect button, add-network, header
- `src/app/page.tsx` — F1 landing + live status
