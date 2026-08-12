"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPriceHistory, type PricePoint } from "@/lib/indexer";

export function usePriceHistory(market: number, limit = 48) {
  return useQuery<PricePoint[]>({
    queryKey: ["price-history", market, limit],
    queryFn: () => fetchPriceHistory(market, limit),
    refetchInterval: 60_000,
    staleTime: 45_000,
  });
}
