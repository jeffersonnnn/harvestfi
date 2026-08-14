"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { LAUNCH_REGISTRY, launchRegistryAbi, hasRegistry } from "@/lib/launchpad";
import { STATE_VIEW, stateViewAbi, poolIdFor, coinPriceEth } from "@/lib/coin-market";
import { CHAIN_ID } from "@/lib/chain";

export type LaunchItem = {
  token: Address;
  marketId: number;
  positionId: bigint;
  creator: Address;
  timestamp: number;
  name?: string;
  symbol?: string;
  priceEth?: number;
};

type RawLaunch = {
  token: Address;
  marketId: bigint;
  positionId: bigint;
  creator: Address;
  timestamp: bigint;
};

/** Reads the newest launches from LaunchRegistry and enriches each with the token's name + symbol. */
export function useLaunches(limit = 60) {
  const enabled = hasRegistry();

  const { data: raw, isLoading, refetch } = useReadContract({
    address: LAUNCH_REGISTRY,
    abi: launchRegistryAbi,
    functionName: "recentLaunches",
    args: [0n, BigInt(limit)],
    chainId: CHAIN_ID,
    query: { enabled },
  });

  const launches = (raw ?? []) as readonly RawLaunch[];

  const { data: meta } = useReadContracts({
    chainId: CHAIN_ID,
    contracts: launches.flatMap((l) => [
      { address: l.token, abi: erc20Abi, functionName: "name" as const },
      { address: l.token, abi: erc20Abi, functionName: "symbol" as const },
    ]),
    query: { enabled: enabled && launches.length > 0 },
  });

  const { data: slots } = useReadContracts({
    chainId: CHAIN_ID,
    contracts: launches.map((l) => ({
      address: STATE_VIEW,
      abi: stateViewAbi,
      functionName: "getSlot0" as const,
      args: [poolIdFor(l.token)],
    })),
    query: { enabled: enabled && launches.length > 0, refetchInterval: 20000 },
  });

  const items: LaunchItem[] = launches.map((l, i) => {
    const slot = slots?.[i]?.result as readonly [bigint, number, number, number] | undefined;
    return {
      token: l.token,
      marketId: Number(l.marketId),
      positionId: l.positionId,
      creator: l.creator,
      timestamp: Number(l.timestamp),
      name: meta?.[i * 2]?.result as string | undefined,
      symbol: meta?.[i * 2 + 1]?.result as string | undefined,
      priceEth: slot ? coinPriceEth(slot[0]) : undefined,
    };
  });

  return { items, isLoading, enabled, refetch };
}
