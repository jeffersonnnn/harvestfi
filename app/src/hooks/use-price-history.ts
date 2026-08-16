"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { pushPriceOracleAbi, ORACLE_ADDRESS } from "@/lib/contracts";
import { fetchPriceHistory, type PricePoint } from "@/lib/indexer";
import { SIMULATED_PRICES } from "@/lib/chain";
import { hasSimModel, simBackfill, simPriceUsdAt } from "@/lib/sim-price";

/// Price history for the chart.
///
/// The on-chain indexer provides backfill, but it can be sparse (it reads the chain on a schedule and
/// may lag). So on top of the indexer seed we poll the live oracle price every few seconds and keep a
/// client-side buffer keyed by the on-chain publish timestamp (one point per real update). This keeps
/// the chart populated and advancing regardless of indexer coverage, and behaves the same for real or
/// simulated price sources. The buffer resets when the market changes.
export function usePriceHistory(market: number, symbol?: string, _limit = 200) {
  const client = usePublicClient();
  const buf = useRef<Map<number, number>>(new Map()); // ts (unix sec) -> price (1e8 USD)
  const [points, setPoints] = useState<PricePoint[]>([]);

  const flush = () => {
    const arr = [...buf.current.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ts, price]) => ({ ts, price: String(price) }));
    setPoints(arr);
  };

  // Reset the buffer when switching markets.
  useEffect(() => {
    buf.current = new Map();
    setPoints([]);
  }, [market]);

  // Seed the backfill. Simulated markets with a client model get an instant, dense, accurate curve
  // (it matches what the keeper posted, since both use the same deterministic model). Everything else
  // seeds from the on-chain indexer.
  useEffect(() => {
    if (market < 0) return;
    if (SIMULATED_PRICES && symbol && hasSimModel(symbol)) {
      for (const p of simBackfill(symbol)) buf.current.set(p.ts, Number(p.price));
      flush();
      return;
    }
    let cancelled = false;
    fetchPriceHistory(market, 200).then((hist) => {
      if (cancelled) return;
      for (const p of hist) {
        const v = Number(p.price);
        if (v > 0) buf.current.set(p.ts, v);
      }
      flush();
    });
    return () => {
      cancelled = true;
    };
  }, [market, symbol]);

  // Simulated markets: advance the chart's leading edge live from the client model every 2s (the same
  // deterministic curve the keeper posts). This keeps the chart moving between the 5-minute on-chain
  // posts AND skips the per-row oracle polling below, cutting RPC load.
  const isSim = SIMULATED_PRICES && !!symbol && hasSimModel(symbol);
  useEffect(() => {
    if (market < 0 || !isSim || !symbol) return;
    let stop = false;
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const usd = simPriceUsdAt(symbol, now);
      if (usd != null && !stop) {
        buf.current.set(now, Math.round(usd * 1e8));
        if (buf.current.size > 500) {
          const keys = [...buf.current.keys()].sort((a, b) => a - b);
          for (const k of keys.slice(0, keys.length - 500)) buf.current.delete(k);
        }
        flush();
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [market, symbol, isSim]);

  // Poll the live oracle price and accumulate (non-simulated markets only — sim markets use the model above).
  useEffect(() => {
    if (market < 0 || !client || isSim) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = (await client.readContract({
          address: ORACLE_ADDRESS,
          abi: pushPriceOracleAbi,
          functionName: "getPrice",
          args: [BigInt(market)],
        })) as readonly [bigint, bigint];
        const price = Number(res[0]);
        const ts = Number(res[1]);
        if (!stop && price > 0 && ts > 0) {
          buf.current.set(ts, price);
          if (buf.current.size > 500) {
            const keys = [...buf.current.keys()].sort((a, b) => a - b);
            for (const k of keys.slice(0, keys.length - 500)) buf.current.delete(k);
          }
          flush();
        }
      } catch {
        /* transient RPC hiccup - try again next tick */
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [market, client, isSim]);

  return { data: points };
}
