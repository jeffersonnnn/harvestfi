"use client";

import { useEffect, useState } from "react";
import { SIMULATED_PRICES } from "@/lib/chain";
import { hasSimModel, simPriceE8Now } from "@/lib/sim-price";

/**
 * A live-ticking 1e8-USD price for DISPLAY. For a simulated market with a client model it recomputes
 * the deterministic sim curve every second — the same curve the keeper posts on-chain, just sampled
 * more often — so the UI feels alive between the (now 5-minute) on-chain posts. For any other market,
 * or when the feed is stale, it returns the on-chain oracle price unchanged.
 *
 * DISPLAY ONLY. Trades, entry price, PnL, and liquidation all run on the on-chain oracle value, never
 * this. The live price is the oracle's own curve sampled ahead of the last post, so it stays consistent.
 */
export function useLivePriceE8(symbol: string | undefined, oracleE8: bigint, stale?: boolean): bigint {
  const enabled = SIMULATED_PRICES && !!symbol && hasSimModel(symbol) && !stale;
  const [live, setLive] = useState<bigint>(oracleE8);

  useEffect(() => {
    if (!enabled || !symbol) {
      setLive(oracleE8);
      return;
    }
    const tick = () => {
      const v = simPriceE8Now(symbol);
      if (v != null) setLive(v);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [enabled, symbol, oracleE8]);

  return enabled ? live : oracleE8;
}
