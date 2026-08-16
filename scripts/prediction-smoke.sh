#!/usr/bin/env bash
# HarvestFi PredictionMarket smoke-test — READ-ONLY health check of the prediction-market contract.
# No keys, no writes. Prints a pass/fail table. Chain-agnostic: override any address via env.
#
#   ./scripts/prediction-smoke.sh                       # defaults to TESTNET (chain 46630)
#   PM=0x... ORACLE=0x... REGISTRY=0x... RPC_URL=https://rpc.mainnet.chain.robinhood.com \
#     OWNER=0x... ./scripts/prediction-smoke.sh          # point at mainnet after deploy
#
# Requires: foundry `cast`.
set -uo pipefail
command -v cast >/dev/null || { echo "need foundry (cast)"; exit 1; }

# Defaults target the testnet deployment (chain 46630).
RPC=${RPC_URL:-https://rpc.testnet.chain.robinhood.com}
PM=${PM:-0xB58c33F560deED608ae7Aef3E7Ebf931Ff4e6924}
ORACLE=${ORACLE:-0x6600F79803ef134A1d2f66311E11b2446ED6CEA5}
REGISTRY=${REGISTRY:-0x768Ff6b2FC0fE84F58C54bd1782dA857C1654bb5}
OWNER=${OWNER:-0x914c931de0b67354614c4a7e7309a1841aa18efb}

PASS=0; WARN=0; FAIL=0
row() { printf "  %-1s  %-28s %s\n" "$1" "$2" "$3"; }
ok()   { row "✅" "$1" "$2"; PASS=$((PASS+1)); }
warn() { row "⚠️ " "$1" "$2"; WARN=$((WARN+1)); }
bad()  { row "❌" "$1" "$2"; FAIL=$((FAIL+1)); }
has_code() { local c; c=$(cast code "$1" --rpc-url "$RPC" 2>/dev/null); [ -n "$c" ] && [ "$c" != "0x" ]; }
call() { cast call "$@" --rpc-url "$RPC" 2>/dev/null; }
first() { echo "$1" | sed -n '1p' | awk '{print $1}'; }

echo ""; echo "HarvestFi PredictionMarket smoke-test  ·  $(date '+%Y-%m-%d %H:%M:%S')"
echo "  PM $PM"
echo "────────────────────────────────────────────────────────────"

# 1. RPC + contract deployed
BLK=$(cast block-number --rpc-url "$RPC" 2>/dev/null)
if [ -n "$BLK" ]; then ok "RPC reachable" "block $BLK"; else bad "RPC reachable" "no response from $RPC"; echo; exit 1; fi
if has_code "$PM"; then ok "PredictionMarket deployed" "$PM"; else bad "PredictionMarket deployed" "no bytecode"; echo; exit 1; fi

# 2. Wiring: oracle + registry match the expected addresses
PMORACLE=$(first "$(call "$PM" 'oracle()(address)')" | tr 'A-Z' 'a-z')
PMREG=$(first "$(call "$PM" 'registry()(address)')" | tr 'A-Z' 'a-z')
[ "$PMORACLE" = "$(echo "$ORACLE" | tr 'A-Z' 'a-z')" ] && ok "Oracle wired" "$PMORACLE" || warn "Oracle wired" "got $PMORACLE"
[ "$PMREG" = "$(echo "$REGISTRY" | tr 'A-Z' 'a-z')" ] && ok "Registry wired" "$PMREG" || warn "Registry wired" "got $PMREG"

# 3. Owner + fee within cap
POWNER=$(first "$(call "$PM" 'owner()(address)')" | tr 'A-Z' 'a-z')
[ "$POWNER" = "$(echo "$OWNER" | tr 'A-Z' 'a-z')" ] && ok "Owner" "$POWNER" || warn "Owner" "got $POWNER"
FEE=$(first "$(call "$PM" 'feeBps()(uint96)')")
if [ -n "$FEE" ] && [ "$FEE" -le 500 ] 2>/dev/null; then ok "Fee within cap" "${FEE}bps (cap 500)"; else bad "Fee within cap" "feeBps=$FEE"; fi

# 4. Params sane (maxDuration >= minDuration, grace > 0)
MIND=$(first "$(call "$PM" 'minDuration()(uint64)')")
MAXD=$(first "$(call "$PM" 'maxDuration()(uint64)')")
GRACE=$(first "$(call "$PM" 'resolveGracePeriod()(uint64)')")
if [ -n "$MAXD" ] && [ "$MAXD" -ge "${MIND:-0}" ] 2>/dev/null && [ "$MAXD" -gt 0 ] 2>/dev/null; then
  ok "Durations sane" "min ${MIND}s · max ${MAXD}s · grace ${GRACE}s"
else bad "Durations sane" "min=$MIND max=$MAXD"; fi

# 5. Paused state + creation gate
PAUSED=$(first "$(call "$PM" 'paused()(bool)')")
[ "$PAUSED" = "false" ] && ok "Not paused" "live" || warn "Paused" "betting halted"
PERM=$(first "$(call "$PM" 'permissionlessCreation()(bool)')")
if [ "$PERM" = "false" ]; then ok "Creation gate" "owner-only (pre-legal)"; else warn "Creation gate" "PERMISSIONLESS — legal cleared?"; fi

# 6. Markets + per-market snapshot (cap 10)
MC=$(first "$(call "$PM" 'marketCount()(uint256)')")
if [ -n "$MC" ] && [ "$MC" -gt 0 ] 2>/dev/null; then
  ok "Markets created" "$MC total"
  MAX=$MC; [ "$MAX" -gt 10 ] 2>/dev/null && MAX=10
  NOW=$(date +%s)
  for i in $(seq 0 $((MAX-1))); do
    RAW=$(call "$PM" 'getMarket(uint256)((uint256,uint256,uint64,bool,uint8,bool,uint256,uint256,uint256,uint256,uint256,address))' "$i")
    # status is field 5 (index 4): 0 Open, 1 Resolved, 2 Cancelled. cast prints big numbers as
    # "1786935460 [1.786e9]" — take the first token so numeric compares work.
    ST=$(echo "$RAW" | tr -d '()' | awk -F', ' '{print $5}' | awk '{print $1}')
    EXP=$(echo "$RAW" | tr -d '()' | awk -F', ' '{print $3}' | awk '{print $1}')
    ODDS=$(call "$PM" 'odds(uint256)(uint256,uint256)' "$i")
    YB=$(first "$ODDS")
    case "$ST" in
      0) [ "${EXP:-0}" -gt "$NOW" ] 2>/dev/null && s="OPEN (betting)" || s="OPEN (awaiting resolve)";;
      1) s="RESOLVED";; 2) s="CANCELLED";; *) s="status=$ST";;
    esac
    row "•" "market #$i" "$s · YES ${YB:-0}bps"
  done
else
  warn "Markets created" "none yet (deploy is fresh)"
fi

echo "────────────────────────────────────────────────────────────"
echo "  $PASS passed · $WARN warnings · $FAIL failed"
echo ""
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
