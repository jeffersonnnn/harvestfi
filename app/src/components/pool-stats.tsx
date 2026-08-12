"use client";

import { usePoolStats } from "@/hooks/use-pool-stats";
import { formatETH } from "@/lib/format";

export function PoolStats() {
  const { totalAssets, openNotional, insuranceFund, utilizationBps } =
    usePoolStats();

  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Stat label="Pool liquidity" value={`${formatETH(totalAssets)} ETH`} />
      <Stat label="Open interest" value={`${formatETH(openNotional)} ETH`} />
      <Stat label="Utilization" value={`${(utilizationBps / 100).toFixed(1)}%`} />
      <Stat label="Insurance fund" value={`${formatETH(insuranceFund)} ETH`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs text-white/40">{label}</div>
      <div className="mt-1 text-lg font-medium">{value}</div>
    </div>
  );
}
