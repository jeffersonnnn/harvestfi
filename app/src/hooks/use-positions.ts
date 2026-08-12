"use client";

import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { perpEngineAbi, ENGINE_ADDRESS, DEPLOY_BLOCK } from "@/lib/contracts";

const ZERO = "0x0000000000000000000000000000000000000000";

interface PositionStruct {
  trader: Address;
  commodityId: bigint;
  isLong: boolean;
  collateral: bigint;
  sizeEth: bigint;
  entryPrice: bigint;
  entryFundingIndex: bigint;
  entryBorrowingIndex: bigint;
  openedAt: bigint;
}

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

      const logs = await client.getContractEvents({
        address: ENGINE_ADDRESS,
        abi: perpEngineAbi,
        eventName: "PositionOpened",
        args: { trader: address },
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      });

      const ids = Array.from(
        new Set(logs.map((l) => (l.args as { positionId: bigint }).positionId))
      );
      if (ids.length === 0) return [];

      const posResults = await client.multicall({
        allowFailure: true,
        contracts: ids.map((id) => ({
          address: ENGINE_ADDRESS,
          abi: perpEngineAbi,
          functionName: "getPosition",
          args: [id],
        })),
      });

      const openIds: bigint[] = [];
      const openPos: PositionStruct[] = [];
      ids.forEach((id, i) => {
        const r = posResults[i];
        if (r.status === "success") {
          const p = r.result as unknown as PositionStruct;
          if (p.trader && p.trader.toLowerCase() !== ZERO) {
            openIds.push(id);
            openPos.push(p);
          }
        }
      });
      if (openIds.length === 0) return [];

      const metrics = await client.multicall({
        allowFailure: true,
        contracts: openIds.flatMap((id) => [
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "unrealizedPnl", args: [id] },
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "pendingBorrowFee", args: [id] },
          { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "isLiquidatable", args: [id] },
        ]),
      });

      return openIds.map((id, i) => {
        const p = openPos[i];
        const pnlR = metrics[i * 3];
        const bfR = metrics[i * 3 + 1];
        const liqR = metrics[i * 3 + 2];
        return {
          id,
          commodityId: Number(p.commodityId),
          isLong: p.isLong,
          collateral: p.collateral,
          sizeEth: p.sizeEth,
          entryPrice: p.entryPrice,
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
