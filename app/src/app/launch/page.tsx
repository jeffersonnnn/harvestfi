"use client";

import { LaunchForm } from "@/components/launch-form";
import { hasRegistry } from "@/lib/launchpad";

export default function LaunchPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-5 py-10 sm:px-8">
      <div>
        <p className="label text-wheat">Launch a coin</p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">Launchpad</h1>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-bone/65">
          Launch a coin paired to a real commodity market, right here. Fixed 1B supply, liquidity locked in a
          Uniswap v4 pool, and <span className="text-field">creator fees are on</span>, so you collect the
          coin&apos;s trading fees. It shows the market&apos;s live price and lists in the HarvestFi explorer.
        </p>
      </div>

      <LaunchForm />

      <div className="grid gap-3 sm:grid-cols-3">
        <Note title="Themed on a market" body="Each coin is paired to one of the 51 markets and shows its live price. It is not funded by that market's revenue." />
        <Note title="You keep the fees" body="Creator fees flow to your wallet via a transferable NFT. Collect them any time; sell the NFT to pass them on." />
        <Note title="Launched on HarvestFi" body="One transaction from this page launches the coin on Robinhood Chain. No pools.trade detour." />
      </div>

      {!hasRegistry() && (
        <p className="rounded-lg border border-wheat/20 bg-wheat/[0.06] px-4 py-3 text-xs text-wheat/80">
          Note: the explorer registry is not deployed yet, so launches will not list in the explorer until it is.
          The launch + creator fees still work fully.
        </p>
      )}

      {/* <p className="text-xs text-bone/40">
        Prices shown across HarvestFi are simulated for now. Nothing here is investment advice.
      </p> */}
    </div>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-bone/10 bg-soil-900/40 p-4">
      <p className="font-display text-sm">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-bone/55">{body}</p>
    </div>
  );
}
