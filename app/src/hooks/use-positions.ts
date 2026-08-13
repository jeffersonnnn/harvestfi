"use client";

import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { perpEngineAbi, ENGINE_ADDRESS } from "@/lib/contracts";

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

interface PositionStruct {
  trader: string;
  commodityId: bigint;
  isLong: boolean;
  collateral: bigint;
  sizeEth: bigint;
  entryPrice: bigint;
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

      // Read positions DIRECTLY from the chain (not the indexer, which can be rate-limited/sparse):
      // nextPositionId gives the id space, then one multicall reads every position struct. An open
      // position has a non-zero trader and non-zero collateral; closed ones zero out.
      const nextId = Number(
        await client.readContract({ address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "nextPositionId" }),
      );
      if (nextId === 0) return [];

      const structs = await client.multicall({
        allowFailure: true,
        contracts: Array.from({ length: nextId }, (_, id) => ({
          address: ENGINE_ADDRESS,
          abi: perpEngineAbi,
          functionName: "positions",
          args: [BigInt(id)],
        })),
      });

      const mine = structs.flatMap((r, id) => {
        if (r.status !== "success") return [];
        const p = r.result as unknown as PositionStruct;
        if (p.trader?.toLowerCase() !== address.toLowerCase() || p.collateral === 0n) return [];
        return [
          {
            id: BigInt(id),
            commodityId: Number(p.commodityId),
            isLong: p.isLong,
            collateral: p.collateral,
            sizeEth: p.sizeEth,
            entryPrice: p.entryPrice,
          },
        ];
      });
      if (mine.length === 0) return [];

      // Live metrics: unrealized PnL, borrow fee, liquidatable - one multicall.
      const metrics = await client.multicall({
        allowFailure: true,
        contracts: mine.flatMap((m) => [
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "unrealizedPnl", args: [m.id] },
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "pendingBorrowFee", args: [m.id] },
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "isLiquidatable", args: [m.id] },
        ]),
      });

      return mine.map((m, i) => {
        const pnlR = metrics[i * 3];
        const bfR = metrics[i * 3 + 1];
        const liqR = metrics[i * 3 + 2];
        return {
          ...m,
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
