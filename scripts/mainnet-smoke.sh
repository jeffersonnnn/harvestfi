#!/usr/bin/env bash
# HarvestFi mainnet smoke-test — READ-ONLY health check of every feature's on-chain state.
# No keys, no writes. Prints a pass/fail table. Run anytime, especially after a deploy.
#
#   ./scripts/mainnet-smoke.sh
#
# Requires: foundry `cast`. Override RPC with RPC_URL=... if needed.
set -uo pipefail
command -v cast >/dev/null || { echo "need foundry (cast)"; exit 1; }

RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
REGISTRY=0xB56AB31fb1F1559c435A72B5Fd3c7E63baea3D96
ORACLE=0x43F4B3E880437De908f418B199daE8F326F0F41A
FEEMGR=0x7B855d15B55a94F76DCE93EeD7fD6bA2eE4bb247
LICENSE=0x1298D8591E5F5d53C15c46D25C6f0304F90D5FB1
POOL=0x67f707191497CEe11886BcD2cC23208367b7AFA5
ENGINE=0x343635C6602169993DA969A1E813093ba19A074a
LAUNCHREG=0x59a277ce4Df70540fe06A193c4810e09Be8fe0e7
MARKET=0xbE50c0003a60726385d517a9188E51e5FD444ef7
OWNER=0xa9f284296ac48cd3f88fa1355c6f598b1963721b

PASS=0; WARN=0; FAIL=0
row() { printf "  %-1s  %-26s %s\n" "$1" "$2" "$3"; }
ok()   { row "✅" "$1" "$2"; PASS=$((PASS+1)); }
warn() { row "⚠️ " "$1" "$2"; WARN=$((WARN+1)); }
bad()  { row "❌" "$1" "$2"; FAIL=$((FAIL+1)); }
has_code() { local c; c=$(cast code "$1" --rpc-url "$RPC" 2>/dev/null); [ -n "$c" ] && [ "$c" != "0x" ]; }

echo ""; echo "HarvestFi mainnet smoke-test  ·  $(date '+%Y-%m-%d %H:%M:%S')  ·  chain 4663"
echo "────────────────────────────────────────────────────────────"

# 1. RPC + core contracts deployed
BLK=$(cast block-number --rpc-url "$RPC" 2>/dev/null)
if [ -n "$BLK" ]; then ok "RPC reachable" "block $BLK"; else bad "RPC reachable" "no response from $RPC"; echo; exit 1; fi

for pair in "Registry:$REGISTRY" "Oracle:$ORACLE" "FeeManager:$FEEMGR" "LicenseNFT:$LICENSE" "Pool:$POOL" "Engine:$ENGINE" "LaunchRegistry:$LAUNCHREG" "Marketplace:$MARKET"; do
  name=${pair%%:*}; addr=${pair##*:}
  if has_code "$addr"; then ok "$name deployed" "$addr"; else bad "$name deployed" "no bytecode at $addr"; fi
done

# 2. Markets listed
CNT=$(cast call "$REGISTRY" 'count()(uint256)' --rpc-url "$RPC" 2>/dev/null)
CNT=${CNT%% *}
if [ -n "$CNT" ] && [ "$CNT" -gt 0 ] 2>/dev/null; then ok "Markets listed" "$CNT markets"; else bad "Markets listed" "count=$CNT"; fi

# 3. Oracle freshness (keeper liveness) — price for market 0 must be fresh (< 1h)
RAW=$(cast call "$ORACLE" 'getPrice(uint256)(int256,uint64)' 0 --rpc-url "$RPC" 2>/dev/null)
PRICE=$(echo "$RAW" | sed -n '1p' | awk '{print $1}')
TS=$(echo "$RAW" | sed -n '2p' | awk '{print $1}')
NOW=$(date +%s)
if [ -n "$TS" ] && [ "$TS" -gt 0 ] 2>/dev/null; then
  AGE=$((NOW - TS))
  if [ "$AGE" -lt 3600 ]; then ok "Oracle fresh (keeper live)" "CORN price age ${AGE}s"; else warn "Oracle STALE" "CORN price ${AGE}s old — keeper may be down"; fi
else
  bad "Oracle price" "no price for market 0"
fi

# 4. Pool liquidity
BAL=$(cast balance "$POOL" --rpc-url "$RPC" 2>/dev/null)
if [ -n "$BAL" ] && [ "$BAL" != "0" ]; then ok "Pool liquidity" "$(cast from-wei "$BAL") ETH"; else warn "Pool liquidity" "pool is empty"; fi

# 5. Licenses minted (scan 0..count-1, capped 40)
MAX=$CNT; [ "$MAX" -gt 40 ] 2>/dev/null && MAX=40
minted=0; listed=0
for i in $(seq 0 $((MAX-1)) 2>/dev/null); do
  [ "$(cast call "$LICENSE" 'exists(uint256)(bool)' "$i" --rpc-url "$RPC" 2>/dev/null)" = "true" ] && minted=$((minted+1))
  [ "$(cast call "$MARKET" 'isListed(uint256)(bool)' "$i" --rpc-url "$RPC" 2>/dev/null)" = "true" ] && listed=$((listed+1))
done
if [ "$minted" -gt 0 ]; then ok "Licenses minted" "$minted of first $MAX"; else warn "Licenses minted" "none minted yet"; fi

# 6. Launchpad
LC=$(cast call "$LAUNCHREG" 'launchCount()(uint256)' --rpc-url "$RPC" 2>/dev/null); LC=${LC%% *}
if [ -n "$LC" ] && [ "$LC" -gt 0 ] 2>/dev/null; then ok "Launchpad coins" "$LC launched"; else warn "Launchpad coins" "none launched yet"; fi

# 7. Marketplace config + live listings
FEE=$(cast call "$MARKET" 'feeBps()(uint96)' --rpc-url "$RPC" 2>/dev/null); FEE=${FEE%% *}
MOWNER=$(cast call "$MARKET" 'owner()(address)' --rpc-url "$RPC" 2>/dev/null | tr 'A-Z' 'a-z')
if [ "$FEE" -le 500 ] 2>/dev/null && [ "$MOWNER" = "$OWNER" ]; then ok "Marketplace config" "fee ${FEE}bps · owner ok"; else warn "Marketplace config" "fee=$FEE owner=$MOWNER"; fi
ok "Marketplace listings" "$listed active in first $MAX"

echo "────────────────────────────────────────────────────────────"
echo "  $PASS passed · $WARN warnings · $FAIL failed"
echo ""
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
