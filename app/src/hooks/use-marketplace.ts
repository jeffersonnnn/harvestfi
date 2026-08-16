"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { MARKETPLACE_ADDRESS, MARKETPLACE_DEPLOY_BLOCK } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";

const soldEvent = parseAbiItem(
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee)"
);
const listedEvent = parseAbiItem(
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)"
);

export type Activity = {
  kind: "sold" | "listed";
  tokenId: number;
  price: bigint;
  who: Address; // buyer for a sale, seller for a listing
  block: bigint;
  txHash: string;
};

export type MarketplaceData = {
  activity: Activity[]; // newest first, capped
  lastSale: Map<number, bigint>; // tokenId -> last sale price (wei)
  volume: bigint; // total ETH transacted across all sales
  salesCount: number;
  loading: boolean;
};

/** Reads the marketplace's Sold/Listed events (from deploy block) for last-sale prices,
 *  total volume, and a recent-activity feed. Client-side getLogs — swap for an indexer at scale. */
export function useMarketplace(): MarketplaceData {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [data, setData] = useState<MarketplaceData>({
    activity: [],
    lastSale: new Map(),
    volume: 0n,
    salesCount: 0,
    loading: true,
  });

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await client.getBlockNumber();
        const [sold, listed] = await Promise.all([
          client.getLogs({ address: MARKETPLACE_ADDRESS, event: soldEvent, fromBlock: MARKETPLACE_DEPLOY_BLOCK, toBlock: latest }),
          client.getLogs({ address: MARKETPLACE_ADDRESS, event: listedEvent, fromBlock: MARKETPLACE_DEPLOY_BLOCK, toBlock: latest }),
        ]);
        if (cancelled) return;

        const lastSale = new Map<number, bigint>();
        let volume = 0n;
        for (const l of sold) {
          const id = Number(l.args.tokenId);
          const price = (l.args.price as bigint) ?? 0n;
          lastSale.set(id, price); // logs are chronological, so the last write wins
          volume += price;
        }

        const activity: Activity[] = [
          ...sold.map((l) => ({
            kind: "sold" as const,
            tokenId: Number(l.args.tokenId),
            price: (l.args.price as bigint) ?? 0n,
            who: l.args.buyer as Address,
            block: l.blockNumber ?? 0n,
            txHash: l.transactionHash ?? "",
          })),
          ...listed.map((l) => ({
            kind: "listed" as const,
            tokenId: Number(l.args.tokenId),
            price: (l.args.price as bigint) ?? 0n,
            who: l.args.seller as Address,
            block: l.blockNumber ?? 0n,
            txHash: l.transactionHash ?? "",
          })),
        ]
          .sort((a, b) => (b.block > a.block ? 1 : b.block < a.block ? -1 : 0))
          .slice(0, 12);

        setData({ activity, lastSale, volume, salesCount: sold.length, loading: false });
      } catch {
        if (!cancelled) setData((d) => ({ ...d, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  return data;
}
