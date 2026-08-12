"use client";

import { useReadContracts } from "wagmi";
import {
  liquidityPoolAbi,
  perpEngineAbi,
  POOL_ADDRESS,
  ENGINE_ADDRESS,
} from "@/lib/contracts";

export function usePoolStats() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: POOL_ADDRESS, abi: liquidityPoolAbi, functionName: "totalAssets" },
      { address: POOL_ADDRESS, abi: liquidityPoolAbi, functionName: "sharePriceE18" },
      { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "globalOpenNotional" },
      { address: ENGINE_ADDRESS, abi: perpEngineAbi, functionName: "insuranceFund" },
    ],
    query: { refetchInterval: 12_000 },
  });

  const totalAssets = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const sharePriceE18 = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const openNotional = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const insuranceFund = (data?.[3]?.result as bigint | undefined) ?? 0n;
  const utilizationBps =
    totalAssets > 0n ? Number((openNotional * 10_000n) / totalAssets) : 0;

  return { totalAssets, sharePriceE18, openNotional, insuranceFund, utilizationBps, isLoading };
}
