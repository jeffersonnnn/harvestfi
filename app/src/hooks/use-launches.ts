"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { LAUNCH_REGISTRY, launchRegistryAbi, hasRegistry, uerc20MetadataAbi } from "@/lib/launchpad";
import { STATE_VIEW, stateViewAbi, poolIdFor, coinPriceEth } from "@/lib/coin-market";
import { CHAIN_ID } from "@/lib/chain";

// Test coins hidden from the explorer.
const HIDDEN = new Set<string>(["0xd4d059dcde2ff6782547746e9b031db85ba9f11a"]); // SCARPTEST

export type LaunchItem = {
  token: Address;
  marketId: number;
  positionId: bigint;
  creator: Address;
  timestamp: number;
  name?: string;
  symbol?: string;
  priceEth?: number;
  image?: string; // ipfs:// URI from metadata()
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

  const { data: metas } = useReadContracts({
    chainId: CHAIN_ID,
    contracts: launches.map((l) => ({
      address: l.token,
      abi: uerc20MetadataAbi,
      functionName: "metadata" as const,
    })),
    query: { enabled: enabled && launches.length > 0 },
  });

  const items: LaunchItem[] = launches
    .map((l, i) => {
      const slot = slots?.[i]?.result as readonly [bigint, number, number, number] | undefined;
      const md = metas?.[i]?.result as readonly [string, string, string, `0x${string}`] | undefined;
      return {
        token: l.token,
        marketId: Number(l.marketId),
        positionId: l.positionId,
        creator: l.creator,
        timestamp: Number(l.timestamp),
        name: meta?.[i * 2]?.result as string | undefined,
        symbol: meta?.[i * 2 + 1]?.result as string | undefined,
        priceEth: slot ? coinPriceEth(slot[0]) : undefined,
        image: md?.[2] || undefined,
      };
    })
    .filter((it) => !HIDDEN.has(it.token.toLowerCase()));

  return { items, isLoading, enabled, refetch };
}
