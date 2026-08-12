"use client";

import { useReadContract, useReadContracts } from "wagmi";
import {
  commodityRegistryAbi,
  pushPriceOracleAbi,
  perpEngineAbi,
  REGISTRY_ADDRESS,
  ORACLE_ADDRESS,
  ENGINE_ADDRESS,
} from "@/lib/contracts";

export interface MarketInfo {
  id: number;
  symbol: string;
  unit: string;
  category: string;
  maxLeverageX: number;
  maintenanceMarginBps: number;
  openFeeBps: number;
  closeFeeBps: number;
  priceE8: bigint;
  priceTs: number;
  longOI: bigint;
  shortOI: bigint;
  listed: boolean;
  stale: boolean;
}

interface CommodityStruct {
  symbol: string;
  unit: string;
  quoteCurrency: string;
  category: string;
  listed: boolean;
  maxLeverageX: number;
  maintenanceMarginBps: number;
  openFeeBps: number;
  closeFeeBps: number;
  maxOpenInterestEth: bigint;
}

export function useMarkets() {
  const { data: countData } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: commodityRegistryAbi,
    functionName: "count",
  });
  const { data: maxAgeData } = useReadContract({
    address: ORACLE_ADDRESS,
    abi: pushPriceOracleAbi,
    functionName: "maxPriceAge",
  });

  const count = countData ? Number(countData) : 0;
  const maxPriceAge = maxAgeData ? Number(maxAgeData) : 3600;
  const ids = Array.from({ length: count }, (_, i) => i);

  const contracts = ids.flatMap((i) => [
    {
      address: REGISTRY_ADDRESS,
      abi: commodityRegistryAbi,
      functionName: "getCommodity",
      args: [BigInt(i)],
    },
    {
      address: ORACLE_ADDRESS,
      abi: pushPriceOracleAbi,
      functionName: "getPrice",
      args: [BigInt(i)],
    },
    {
      address: ENGINE_ADDRESS,
      abi: perpEngineAbi,
      functionName: "marketsById",
      args: [BigInt(i)],
    },
  ]);

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    query: { enabled: count > 0, refetchInterval: 12_000 },
  });

  const now = Math.floor(Date.now() / 1000);
  const markets: MarketInfo[] = ids.map((i) => {
    const c = data?.[i * 3]?.result as unknown as CommodityStruct | undefined;
    const p = data?.[i * 3 + 1]?.result as unknown as
      | readonly [bigint, bigint]
      | undefined;
    const m = data?.[i * 3 + 2]?.result as unknown as
      | readonly bigint[]
      | undefined;
    const priceE8 = p ? p[0] : 0n;
    const priceTs = p ? Number(p[1]) : 0;
    return {
      id: i,
      symbol: c?.symbol ?? "",
      unit: c?.unit ?? "",
      category: c?.category ?? "",
      maxLeverageX: c ? Number(c.maxLeverageX) : 0,
      maintenanceMarginBps: c ? Number(c.maintenanceMarginBps) : 0,
      openFeeBps: c ? Number(c.openFeeBps) : 0,
      closeFeeBps: c ? Number(c.closeFeeBps) : 0,
      priceE8,
      priceTs,
      longOI: m ? m[0] : 0n,
      shortOI: m ? m[1] : 0n,
      listed: c ? Boolean(c.listed) : false,
      stale: priceTs === 0 || now - priceTs > maxPriceAge,
    };
  });

  // Only surface LISTED markets — delisted ones (e.g. the removed metals/energy) stay hidden.
  return { markets: markets.filter((m) => m.listed), count, maxPriceAge, isLoading, refetch };
}
