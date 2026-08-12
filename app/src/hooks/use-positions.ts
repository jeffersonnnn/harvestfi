"use client";

import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { perpEngineAbi, ENGINE_ADDRESS } from "@/lib/contracts";
import { fetchPositions } from "@/lib/indexer";

export interface PositionView {
  id: bigint;
  commodityId: number;
  isLong: boolean;
  collateral: bigint;
  sizeEth: bigint;
  entryPrice: bigint;
  pnl: bigint | null;
  borrowFee: bigint | null;
  liquidatable: boolean | null;
}

export function usePositions() {
  const { address } = useAccount();
  const client = usePublicClient();

  const query = useQuery({
    queryKey: ["positions", address],
    enabled: Boolean(address && client),
    refetchInterval: 12_000,
    queryFn: async (): Promise<PositionView[]> => {
      if (!address || !client) return [];

      // The indexer gives us the OPEN position list fast (no getLogs scan). Live metrics
      // (unrealized PnL, borrow fee, liquidatable) still come from chain, one multicall.
      const indexed = await fetchPositions(address);
      const open = indexed.filter((p) => p.status === "open");
      if (open.length === 0) return [];

      const ids = open.map((p) => BigInt(p.id));
      const metrics = await client.multicall({
        allowFailure: true,
        contracts: ids.flatMap((id) => [
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "unrealizedPnl", args: [id] },
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "pendingBorrowFee", args: [id] },
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "isLiquidatable", args: [id] },
        ]),
      });

      return open.map((p, i) => {
        const pnlR = metrics[i * 3];
        const bfR = metrics[i * 3 + 1];
        const liqR = metrics[i * 3 + 2];
        return {
          id: BigInt(p.id),
          commodityId: p.commodity_id,
          isLong: p.is_long === 1,
          collateral: BigInt(p.collateral),
          sizeEth: BigInt(p.size_eth),
          entryPrice: BigInt(p.entry_price),
          pnl: pnlR.status === "success" ? (pnlR.result as bigint) : null,
          borrowFee: bfR.status === "success" ? (bfR.result as bigint) : null,
          liquidatable: liqR.status === "success" ? (liqR.result as boolean) : null,
        };
      });
    },
  });

  return {
    positions: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
