"use client";

import { usePoolStats } from "@/hooks/use-pool-stats";
import { formatETH } from "@/lib/format";

export function PoolStats() {
  const { totalAssets, openNotional, insuranceFund, utilizationBps } = usePoolStats();

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-bone/10 bg-bone/10 sm:grid-cols-4">
      <Stat label="Pool liquidity" value={formatETH(totalAssets)} unit="ETH" />
      <Stat label="Open interest" value={formatETH(openNotional)} unit="ETH" />
      <Stat label="Utilization" value={(utilizationBps / 100).toFixed(1)} unit="%" />
      <Stat label="Insurance fund" value={formatETH(insuranceFund)} unit="ETH" />
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-soil-900/70 px-5 py-4">
      <div className="label text-bone/40">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="tnum text-2xl font-medium">{value}</span>
        <span className="text-xs text-bone/40">{unit}</span>
      </div>
    </div>
  );
}
