"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { PREDICTION_MARKET_ADDRESS, PREDICTION_DEPLOY_BLOCK } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { INDEXER_URL } from "@/lib/indexer";

const betEvent = parseAbiItem(
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, uint256 amount)"
);
const resolvedEvent = parseAbiItem(
  "event MarketResolved(uint256 indexed marketId, bool outcomeYes, uint256 price, uint256 fee)"
);

export type PredictionEvent = {
  kind: "bet" | "resolved";
  marketId: number;
  isYes: boolean;
  amount: bigint;
  who: Address;
  block: bigint;
  txHash: string;
};

export type PredictionActivity = {
  events: PredictionEvent[]; // newest first, capped
  volume: bigint; // total ETH staked across all bets
  betCount: number;
  bettors: number; // unique bettor addresses
  bettorsByMarket: Map<number, number>; // marketId -> unique bettor count
  loading: boolean;
};

const EMPTY: PredictionActivity = {
  events: [],
  volume: 0n,
  betCount: 0,
  bettors: 0,
  bettorsByMarket: new Map(),
  loading: true,
};

/**
 * Reads the prediction market's on-chain activity: bets placed and resolutions. Powers the volume
 * stats and the live activity feed. Tries the indexer first (scale); falls back to a bounded getLogs
 * scan from the deploy block, which works on this chain today.
 */
export function usePredictionActivity(refreshKey = 0): PredictionActivity {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [data, setData] = useState<PredictionActivity>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    function summarize(events: PredictionEvent[]): PredictionActivity {
      let volume = 0n;
      let betCount = 0;
      const uniq = new Set<string>();
      const byMarket = new Map<number, Set<string>>();
      for (const e of events) {
        if (e.kind !== "bet") continue;
        volume += e.amount;
        betCount += 1;
        uniq.add(e.who.toLowerCase());
        const m = byMarket.get(e.marketId) ?? new Set<string>();
        m.add(e.who.toLowerCase());
        byMarket.set(e.marketId, m);
      }
      const bettorsByMarket = new Map<number, number>();
      byMarket.forEach((set, id) => bettorsByMarket.set(id, set.size));
      const sorted = [...events].sort((a, b) =>
        b.block > a.block ? 1 : b.block < a.block ? -1 : 0
      );
      return {
        events: sorted.slice(0, 15),
        volume,
        betCount,
        bettors: uniq.size,
        bettorsByMarket,
        loading: false,
      };
    }

    async function fromIndexer(): Promise<PredictionEvent[] | null> {
      try {
        const r = await fetch(`${INDEXER_URL}/prediction-activity?limit=500`, { cache: "no-store" });
        if (!r.ok) return null;
        const rows = (await r.json()) as Array<{
          kind: string;
          market_id: number;
          is_yes: number;
          amount: string;
          who: string;
          block: number;
          tx_hash: string;
        }>;
        if (!Array.isArray(rows)) return null;
        return rows.map((x) => ({
          kind: x.kind === "resolved" ? "resolved" : "bet",
          marketId: Number(x.market_id),
          isYes: Boolean(x.is_yes),
          amount: BigInt(x.amount ?? "0"),
          who: x.who as Address,
          block: BigInt(x.block ?? 0),
          txHash: x.tx_hash ?? "",
        }));
      } catch {
        return null;
      }
    }

    async function fromLogs(): Promise<PredictionEvent[]> {
      if (!client) return [];
      const latest = await client.getBlockNumber();
      const [bets, resolves] = await Promise.all([
        client.getLogs({
          address: PREDICTION_MARKET_ADDRESS,
          event: betEvent,
          fromBlock: PREDICTION_DEPLOY_BLOCK,
          toBlock: latest,
        }),
        client.getLogs({
          address: PREDICTION_MARKET_ADDRESS,
          event: resolvedEvent,
          fromBlock: PREDICTION_DEPLOY_BLOCK,
          toBlock: latest,
        }),
      ]);
      return [
        ...bets.map((l) => ({
          kind: "bet" as const,
          marketId: Number(l.args.marketId),
          isYes: Boolean(l.args.isYes),
          amount: (l.args.amount as bigint) ?? 0n,
          who: l.args.bettor as Address,
          block: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? "",
        })),
        ...resolves.map((l) => ({
          kind: "resolved" as const,
          marketId: Number(l.args.marketId),
          isYes: Boolean(l.args.outcomeYes),
          amount: 0n,
          who: "0x0000000000000000000000000000000000000000" as Address,
          block: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? "",
        })),
      ];
    }

    (async () => {
      try {
        const indexed = await fromIndexer();
        const events = indexed && indexed.length > 0 ? indexed : await fromLogs();
        if (!cancelled) setData(summarize(events));
      } catch {
        if (!cancelled) setData((d) => ({ ...d, loading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, refreshKey]);

  return data;
}
