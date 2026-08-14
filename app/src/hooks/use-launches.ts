"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { LAUNCH_REGISTRY, launchRegistryAbi, hasRegistry } from "@/lib/launchpad";
import { CHAIN_ID } from "@/lib/chain";

export type LaunchItem = {
  token: Address;
  marketId: number;
  positionId: bigint;
  creator: Address;
  timestamp: number;
  name?: string;
  symbol?: string;
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

  const items: LaunchItem[] = launches.map((l, i) => ({
    token: l.token,
    marketId: Number(l.marketId),
    positionId: l.positionId,
    creator: l.creator,
    timestamp: Number(l.timestamp),
    name: meta?.[i * 2]?.result as string | undefined,
    symbol: meta?.[i * 2 + 1]?.result as string | undefined,
  }));

  return { items, isLoading, enabled, refetch };
}
