"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { erc20Abi, type Address, type Hex } from "viem";
import { CHAIN_ID } from "@/lib/chain";
import { fetchCoinStats, type CoinStats } from "@/lib/coin-market";
import { uerc20MetadataAbi, decodeSocials } from "@/lib/launchpad";
import { useEthUsd } from "./use-eth-usd";

/** Live price + swap-history chart + name/symbol for one launched coin. Refreshes every 15s. */
export function useCoin(token?: Address) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const ethUsd = useEthUsd();
  const [stats, setStats] = useState<CoinStats | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: meta } = useReadContracts({
    chainId: CHAIN_ID,
    contracts: token
      ? [
          { address: token, abi: erc20Abi, functionName: "name" as const },
          { address: token, abi: erc20Abi, functionName: "symbol" as const },
          { address: token, abi: uerc20MetadataAbi, functionName: "metadata" as const },
        ]
      : [],
    query: { enabled: !!token },
  });

  const md = meta?.[2]?.result as readonly [string, string, string, Hex] | undefined;
  const socials = decodeSocials(md?.[3]);

  useEffect(() => {
    if (!client || !token) return;
    let cancelled = false;
    const load = () =>
      fetchCoinStats(client, token, ethUsd)
        .then((s) => {
          if (!cancelled) {
            setStats(s);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    setLoading(true);
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, token, ethUsd]);

  return {
    name: meta?.[0]?.result as string | undefined,
    symbol: meta?.[1]?.result as string | undefined,
    description: md?.[0] || undefined,
    website: md?.[1] || undefined,
    image: md?.[2] || undefined,
    twitter: socials.twitter,
    telegram: socials.telegram,
    stats,
    loading,
    ethUsd,
  };
}
