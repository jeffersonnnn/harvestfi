#!/usr/bin/env bash
# HarvestFi Launchpad - collect creator fees for a launched coin.
# The holder of the beneficiary NFT (positionId) claims accrued ETH + token fees.
#
#   PRIVATE_KEY=0x<holder> POSITION_ID=<id> ./collect-fees.sh                # dry run (default)
#   PRIVATE_KEY=0x<holder> POSITION_ID=<id> DRY_RUN=false ./collect-fees.sh  # real claim
set -euo pipefail
command -v cast >/dev/null || { echo "cast (foundry) required on PATH"; exit 1; }

RPC=${RPC:-https://rpc.mainnet.chain.robinhood.com}
VAULT=0xd35E9CA72F64C7F93BE30fad67524323396B36D7   # BeneficiaryVault
: "${PRIVATE_KEY:?set PRIVATE_KEY (the beneficiary NFT holder)}"
: "${POSITION_ID:?set POSITION_ID (from the launch output)}"
DRY_RUN=${DRY_RUN:-true}

WALLET=$(cast wallet address --private-key "$PRIVATE_KEY")
OWNER=$(cast call "$VAULT" 'ownerOf(uint256)(address)' "$POSITION_ID" --rpc-url "$RPC")
echo "positionId=$POSITION_ID  owner=$OWNER  you=$WALLET"
[ "$(echo "$OWNER" | tr 'A-Z' 'a-z')" = "$(echo "$WALLET" | tr 'A-Z' 'a-z')" ] \
  || { echo "you do not hold this beneficiary NFT; only the holder can claim"; exit 1; }

# claim(tokenId, minCurrency0Amount, minCurrency1Amount) -> pays native ETH + token to the holder.
# 0/0 = no slippage floor (fine for a first claim; set minimums in production).
if [ "$DRY_RUN" != "false" ]; then
  echo "--- DRY RUN ---"
  echo "to:       $VAULT"
  echo "calldata: $(cast calldata 'claim(uint256,uint256,uint256)' "$POSITION_ID" 0 0)"
  exit 0
fi

echo "claiming..."
cast send "$VAULT" "claim(uint256,uint256,uint256)" "$POSITION_ID" 0 0 --private-key "$PRIVATE_KEY" --rpc-url "$RPC"
echo "claimed. ETH + token sent to $WALLET"
