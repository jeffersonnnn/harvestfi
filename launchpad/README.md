# HarvestFi Launchpad - Phase 0 scripts

Programmatic launch of a coin on Robinhood Chain (4663) in **creator-fee mode**, plus a
**collect-fees** claim. Proves the "launch fully from HarvestFi + let people collect their fees"
flow before we build the frontend. Both scripts default to **DRY_RUN** (simulate only).

## Requirements
- Foundry (`cast`) on PATH.
- A **throwaway** wallet key with a little ETH on 4663 (launch tx is value 0; you just need gas).
  Do NOT use the HarvestFi owner key.

## Launch
```bash
PRIVATE_KEY=0x<throwaway> NAME="CornCoin" SYMBOL="CORNCOIN" ./launch.sh              # dry run: prints calldata + simulates
PRIVATE_KEY=0x<throwaway> NAME="CornCoin" SYMBOL="CORNCOIN" DRY_RUN=false ./launch.sh # broadcast the real launch
```
It predicts the token address, builds `multicall([createToken, distributeToken(configData=you)])`,
simulates it, and (if `DRY_RUN=false`) sends it, then prints the token + the beneficiary `positionId`.

Options: `FEE_BENEFICIARY=0x...` (who collects fees, default = your wallet), `TOKENDATA=0x...`
(display metadata; default empty).

## Collect fees
```bash
PRIVATE_KEY=0x<holder> POSITION_ID=<id> DRY_RUN=false ./collect-fees.sh
```
The beneficiary-NFT holder claims accrued ETH + token via `BeneficiaryVault.claim`.

## What this maps to in production
- `launch.sh` -> the frontend Launch form (viem builds the same multicall; `configData` = the user's wallet).
- `collect-fees.sh` -> the "Collect fees" button (`claim`).
See `../LAUNCHPAD-PLAN.md` and `../LAUNCHPAD-PHASE0.md`.
