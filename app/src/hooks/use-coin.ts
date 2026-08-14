"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { CHAIN_ID } from "@/lib/chain";
import { fetchCoinStats, type CoinStats } from "@/lib/coin-market";
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
        ]
      : [],
    query: { enabled: !!token },
  });

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
    stats,
    loading,
    ethUsd,
  };
}
