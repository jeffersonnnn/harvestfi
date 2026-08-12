"use client";

import { LpPanel } from "@/components/lp-panel";

export default function PoolPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Liquidity pool</h1>
        <p className="mt-2 max-w-xl text-sm text-bone/60">
          Provide ETH as the counterparty to all commodity markets. LPs earn from
          net trader losses and borrow fees; your shares appreciate as the pool
          grows. Withdrawals are capped by open-interest utilization.
        </p>
      </div>
      <LpPanel />
    </div>
  );
}
