"use client";

import { DemoDesk } from "@/components/demo-desk";

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo desk</h1>
        <p className="mt-2 max-w-xl text-sm text-bone/60">
          Try the full flow — open a long or short, watch the PnL move on live prices, close for a
          payout — with fake ETH and no wallet. When you are ready, connect and trade for real.
        </p>
      </div>
      <DemoDesk />
    </div>
  );
}
