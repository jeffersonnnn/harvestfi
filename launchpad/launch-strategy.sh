#!/usr/bin/env bash
# End-to-end STRATEGY coin launch on Robinhood Chain (4663). Does the whole 4-tx flow from your wallet,
# then seeds the vault a touch so the strategy keeper can open a position immediately:
#   1. launch the coin (creator-fee mode)       2. register the market pairing
#   3. deploy a StrategyVault (your direction/leverage, tiny open threshold for the demo)
#   4. lock the fee NFT into the vault           5. seed the vault so open() can fire
#
#   PRIVATE_KEY=0x<throwaway> NAME="StratTest" SYMBOL="STRATTEST" DIRECTION=long LEVERAGE=2 \
#     DRY_RUN=false ./launch-strategy.sh
set -euo pipefail
command -v cast >/dev/null && command -v forge >/dev/null || { echo "need foundry (cast + forge)"; exit 1; }

RPC=${RPC:-https://rpc.mainnet.chain.robinhood.com}
LAUNCHER=0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0
FACTORY=0x000000e200088D55C39a11F609E5F667729ad49b
STRATEGY=0x23f8209572b4a1C2AD88A42749E830791Fb027f1
VAULT=0xd35E9CA72F64C7F93BE30fad67524323396B36D7        # BeneficiaryVault
REGISTRY=0x59a277ce4Df70540fe06A193c4810e09Be8fe0e7     # LaunchRegistry
PERP=0x343635C6602169993DA969A1E813093ba19A074a
ROUTER=0x8876789976dEcBfCbBbe364623C63652db8C0904
STATEVIEW=0xF3334192D15450CdD385c8B70e03f9A6bD9E673b
SUPPLY=1000000000000000000000000000

: "${PRIVATE_KEY:?set PRIVATE_KEY (throwaway)}"; : "${NAME:?set NAME}"; : "${SYMBOL:?set SYMBOL}"
MARKET=${MARKET:-0}            # 0 = CORN
DIRECTION=${DIRECTION:-long}   # long | short
LEVERAGE=${LEVERAGE:-2}
THRESHOLD=${THRESHOLD:-300000000000000}   # 0.0003 ETH open threshold (small so the demo fires)
SEED=${SEED:-0.0005ether}     # seed the vault so open() can fire without waiting for real fee volume
DRY_RUN=${DRY_RUN:-true}
ISLONG=$([ "$DIRECTION" = "short" ] && echo false || echo true)
WALLET=$(cast wallet address --private-key "$PRIVATE_KEY")

echo "wallet=$WALLET  name='$NAME'  $SYMBOL  market=$MARKET  ${DIRECTION} ${LEVERAGE}x  dryRun=$DRY_RUN"

# minimal tokenData: metadata() = (description, website, image, bytes extraData). Description = name.
# tokenData = abi.encode((description, website, image, bytes extraData)) all empty - deterministic and
# robust (the ERC20 name/symbol are set separately in createToken). Metadata can be edited later.
Z=0000000000000000000000000000000000000000000000000000000000000000
TOKENDATA="0x${Z:0:62}20${Z:0:62}80${Z:0:62}a0${Z:0:62}c0${Z:0:62}e0${Z}${Z}${Z}${Z}"

CREATE_CD=$(cast calldata "createToken(address,string,string,uint8,uint128,address,bytes)" \
  "$FACTORY" "$NAME" "$SYMBOL" 18 "$SUPPLY" "$LAUNCHER" "$TOKENDATA")
PRED=$(cast call "$LAUNCHER" "$(cast calldata 'multicall(bytes[])' "[$CREATE_CD]")" --from "$WALLET" --rpc-url "$RPC")
TOKEN=$(cast abi-decode "x(bytes[])(bytes[])" "$PRED" | grep -oE '0x[0-9a-fA-F]{64}' | head -1 | sed 's/^0x0\{24\}/0x/')
echo "predicted token: $TOKEN"

CONFIG=$(cast abi-encode "f(address)" "$WALLET")
SALT=$(cast keccak "hf-strat-${SYMBOL}-$(date +%s)-${RANDOM}-${WALLET}")
DISTR_CD=$(cast calldata "distributeToken(address,(address,uint128,bytes),bytes32)" "$TOKEN" "($STRATEGY,$SUPPLY,$CONFIG)" "$SALT")
FULL=$(cast calldata "multicall(bytes[])" "[$CREATE_CD,$DISTR_CD]")
cast call "$LAUNCHER" "$FULL" --from "$WALLET" --rpc-url "$RPC" >/dev/null && echo "launch simulation OK"

if [ "$DRY_RUN" != "false" ]; then echo "--- DRY RUN (set DRY_RUN=false) ---"; echo "token=$TOKEN"; exit 0; fi

echo "1/5 launching..."
RCPT=$(cast send "$LAUNCHER" "$FULL" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" --json)
PID=$(echo "$RCPT" | python3 -c "
import sys,json;r=json.load(sys.stdin);V='${VAULT}'.lower();B='${WALLET}'.lower()
T='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
for l in r['logs']:
  if l['address'].lower()==V and l['topics'] and l['topics'][0].lower()==T and len(l['topics'])==4:
    if int('0x'+l['topics'][1][-40:],16)==0 and ('0x'+l['topics'][2][-40:]).lower()==B: print(int(l['topics'][3],16)); break")
echo "    token=$TOKEN  positionId=$PID"

echo "2/5 registering..."
cast send "$REGISTRY" "register(address,uint256,uint256)" "$TOKEN" "$MARKET" "$PID" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" >/dev/null

echo "3/5 deploying StrategyVault..."
CTR="($PERP,$VAULT,$ROUTER,$STATEVIEW,$TOKEN,$PID,$MARKET,$ISLONG,$LEVERAGE,$THRESHOLD,10000,5000,1000,1500)"
SV=$(cd "$(dirname "$0")/../contracts" && forge create src/StrategyVault.sol:StrategyVault \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast --evm-version cancun \
  --constructor-args "$CTR" 2>&1 | grep -i "Deployed to" | awk '{print $NF}')
echo "    vault=$SV"

echo "4/5 locking fee NFT into the vault..."
cast send "$VAULT" "safeTransferFrom(address,address,uint256)" "$WALLET" "$SV" "$PID" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" >/dev/null

echo "5/5 seeding the vault ($SEED) so open() can fire..."
cast send "$SV" --value "$SEED" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" >/dev/null

echo ""
echo "DONE. token=$TOKEN  positionId=$PID  vault=$SV"
echo "The running strategy keeper will discover this vault and open->manage->burn on schedule."
echo "Watch: cast call $SV 'openPositionId()(uint256)' --rpc-url $RPC ; cast call $SV 'totalBurned()(uint256)' --rpc-url $RPC"
