#!/usr/bin/env bash
# HarvestFi Launchpad - programmatic launch (creator-fee mode) on Robinhood Chain (4663).
# Builds multicall([createToken, distributeToken(configData=feeBeneficiary)]), SIMULATES it,
# and (only if DRY_RUN=false) broadcasts it. Proven end-to-end via eth_call on 2026-08-13.
#
#   PRIVATE_KEY=0x<throwaway> NAME="CornCoin" SYMBOL="CORNCOIN" ./launch.sh            # dry run (default)
#   PRIVATE_KEY=0x<throwaway> NAME="CornCoin" SYMBOL="CORNCOIN" DRY_RUN=false ./launch.sh   # real launch
#
# Optional: FEE_BENEFICIARY=0x... (who collects fees; default = your wallet)
#           TOKENDATA=0x...       (pools.trade display metadata; default = empty; build via viem in the app)
set -euo pipefail
command -v cast >/dev/null || { echo "cast (foundry) required on PATH"; exit 1; }

RPC=${RPC:-https://rpc.mainnet.chain.robinhood.com}
LAUNCHER=0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0     # LiquidityLauncher (multicall entrypoint)
FACTORY=0x000000e200088D55C39a11F609E5F667729ad49b      # UERC20Factory
STRATEGY=0x23f8209572b4a1C2AD88A42749E830791Fb027f1     # creator-fee InstantLaunch strategy
VAULT=0xd35E9CA72F64C7F93BE30fad67524323396B36D7        # BeneficiaryVault (fee claim)
SUPPLY=1000000000000000000000000000                     # 1e27 (1B * 1e18), fixed by pools.trade

: "${PRIVATE_KEY:?set PRIVATE_KEY (use a THROWAWAY wallet, NOT the HarvestFi owner key)}"
: "${NAME:?set NAME (ERC20 name, e.g. CornCoin)}"
: "${SYMBOL:?set SYMBOL (ticker, e.g. CORNCOIN)}"
WALLET=$(cast wallet address --private-key "$PRIVATE_KEY")
FEE_BENEFICIARY=${FEE_BENEFICIARY:-$WALLET}
DRY_RUN=${DRY_RUN:-true}

# tokenData = abi.encode((name,desc,x,image,telegram)) display metadata. Default: 5 empty strings
# (the launch mechanic ignores tokenData). The production app should encode real metadata via viem.
Z=0000000000000000000000000000000000000000000000000000000000000000
MIN_TD="0x${Z:0:62}20${Z:0:62}a0${Z:0:62}c0${Z:0:62}e0${Z:0:61}100${Z:0:61}120$Z$Z$Z$Z$Z"
TOKENDATA=${TOKENDATA:-$MIN_TD}

echo "wallet=$WALLET  feeBeneficiary=$FEE_BENEFICIARY  name='$NAME'  symbol=$SYMBOL  dryRun=$DRY_RUN"

CREATE_CD=$(cast calldata "createToken(address,string,string,uint8,uint128,address,bytes)" \
  "$FACTORY" "$NAME" "$SYMBOL" 18 "$SUPPLY" "$LAUNCHER" "$TOKENDATA")

# Predict the token address by simulating multicall([createToken]) from the wallet (deterministic).
PRED=$(cast call "$LAUNCHER" "$(cast calldata 'multicall(bytes[])' "[$CREATE_CD]")" --from "$WALLET" --rpc-url "$RPC")
TOKEN=$(cast abi-decode "x(bytes[])(bytes[])" "$PRED" | grep -oE '0x[0-9a-fA-F]{64}' | head -1 | sed 's/^0x0\{24\}/0x/')
[ -n "$TOKEN" ] || { echo "could not predict token address (createToken sim failed)"; exit 1; }
echo "predicted token: $TOKEN"

CONFIG=$(cast abi-encode "f(address)" "$FEE_BENEFICIARY")   # configData = the fee beneficiary
SALT=$(cast keccak "hf-${SYMBOL}-$(date +%s)-${RANDOM}-${WALLET}")   # leading "hf-" so cast treats it as a string, not hex
DISTR_CD=$(cast calldata "distributeToken(address,(address,uint128,bytes),bytes32)" \
  "$TOKEN" "($STRATEGY,$SUPPLY,$CONFIG)" "$SALT")
FULL=$(cast calldata "multicall(bytes[])" "[$CREATE_CD,$DISTR_CD]")

echo "simulating full launch..."
cast call "$LAUNCHER" "$FULL" --from "$WALLET" --rpc-url "$RPC" >/dev/null && echo "simulation OK"

if [ "$DRY_RUN" != "false" ]; then
  echo "--- DRY RUN (set DRY_RUN=false to broadcast) ---"
  echo "to:       $LAUNCHER"
  echo "value:    0"
  echo "calldata: $FULL"
  exit 0
fi

echo "broadcasting launch..."
RCPT=$(cast send "$LAUNCHER" "$FULL" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" --json)
TXH=$(echo "$RCPT" | python3 -c "import sys,json;print(json.load(sys.stdin)['transactionHash'])")
echo "launch tx: $TXH"

PID=$(echo "$RCPT" | python3 -c "
import sys,json
r=json.load(sys.stdin); V='${VAULT}'.lower(); B='${FEE_BENEFICIARY}'.lower()
T='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
for l in r['logs']:
    if l['address'].lower()==V and l['topics'] and l['topics'][0].lower()==T and len(l['topics'])==4:
        frm='0x'+l['topics'][1][-40:]; to='0x'+l['topics'][2][-40:]
        if int(frm,16)==0 and to==B: print(int(l['topics'][3],16)); break
")
echo "positionId (beneficiary NFT): $PID"
[ -n "$PID" ] && echo "ownerOf: $(cast call "$VAULT" 'ownerOf(uint256)(address)' "$PID" --rpc-url "$RPC")  (expect $FEE_BENEFICIARY)"
echo ""
echo "SUCCESS. token=$TOKEN  positionId=$PID"
echo "collect fees:  PRIVATE_KEY=0x<beneficiary> POSITION_ID=$PID DRY_RUN=false ./collect-fees.sh"
