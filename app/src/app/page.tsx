"use client";

import Link from "next/link";
import { useMarkets } from "@/hooks/use-markets";
import { PoolStats } from "@/components/pool-stats";
import { MarketsTable } from "@/components/markets-table";
import { PositionsDashboard } from "@/components/positions-dashboard";
import { CHAIN_ID, IS_TESTNET } from "@/lib/chain";

const DATELINE = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function Home() {
  const { markets, isLoading } = useMarkets();
  const liveCount = markets.filter((m) => !m.stale).length;

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      {/* Almanac dateline */}
      <div className="flex items-center justify-between border-b border-bone/10 py-3 text-bone/45">
        <span className="label">Vol. I · No. 1</span>
        <span className="label hidden sm:inline">{DATELINE}</span>
        <span className="label flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-field opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-field" />
          </span>
          {liveCount}/{markets.length} live
        </span>
      </div>

      {/* Hero */}
      <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="fadeup">
          <p className="label mb-5 text-wheat">Perpetual futures · real-world crops</p>
          <h1 className="font-display text-[2.7rem] font-medium leading-[1.02] tracking-tight sm:text-6xl">
            Trade the harvest.
            <br />
            <span className="italic text-wheat">Own the field.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-bone/65">
            Go long or short with leverage on corn, coffee, cocoa and{" "}
            <span className="text-bone">20 more</span> commodities — priced from the real
            market. Or mint a market&apos;s <span className="text-bone">license NFT</span> and
            collect <span className="text-field">70% of every trading fee</span> it earns.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#markets"
              className="rounded-full bg-wheat px-6 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
            >
              Explore markets
            </a>
            <Link
              href="/licenses"
              className="rounded-full border border-bone/20 px-6 py-3 text-sm font-medium text-bone/90 transition-colors hover:border-bone/40 hover:bg-bone/5"
            >
              Own a license →
            </Link>
          </div>
        </div>

        {/* The two-sided pitch card */}
        <div className="fadeup grid gap-3 [animation-delay:120ms]">
          <PitchCard
            eyebrow="For traders"
            title="Leverage on real crops"
            body="Native ETH collateral, oracle-priced, up to 10× — with live PnL you can share the second you close."
          />
          <PitchCard
            eyebrow="For owners"
            title="Be the house, keep the fees"
            body="One transferable license per market. Its holder earns 70% of that market's fees, forever."
            gold
          />
        </div>
      </section>

      {/* Exchange ledger */}
      <PoolStats />

      {/* Markets */}
      <section id="markets" className="scroll-mt-20 py-14">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="label text-wheat">The board</p>
            <h2 className="font-display text-3xl font-medium tracking-tight">Markets</h2>
          </div>
          <p className="hidden max-w-xs text-sm text-bone/45 sm:block">
            Prices post live from the keeper. A market shows{" "}
            <span className="text-wheat">stale</span> if its feed lapses — trading pauses until
            it&apos;s fresh.
          </p>
        </div>
        <MarketsTable markets={markets} isLoading={isLoading} />
      </section>

      <section className="py-6">
        <PositionsDashboard markets={markets} />
      </section>

      {/* Trust / footer */}
      <footer className="mt-10 border-t border-bone/10 py-10">
        <div className="grid gap-6 text-sm text-bone/50 sm:grid-cols-3">
          <div>
            <p className="label mb-2 text-bone/40">Status</p>
            Live on Robinhood Chain {IS_TESTNET ? "Testnet" : "Mainnet"} · chain {CHAIN_ID}.
            Prices posted every minute.
          </div>
          <div>
            <p className="label mb-2 text-bone/40">Security</p>
            Contracts hardened, 70 tests. External audit in progress before mainnet.
          </div>
          <div>
            <p className="label mb-2 text-bone/40">Note</p>
            Leveraged derivatives carry risk of total loss. Availability may be geo-restricted.
          </div>
        </div>
      </footer>
    </div>
  );
}

function PitchCard({
  eyebrow,
  title,
  body,
  gold,
}: {
  eyebrow: string;
  title: string;
  body: string;
  gold?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border p-5 transition-colors " +
        (gold
          ? "border-wheat/25 bg-wheat/[0.06] hover:border-wheat/40"
          : "border-bone/10 bg-soil-900/60 hover:border-bone/20")
      }
    >
      <p className={"label mb-2 " + (gold ? "text-wheat" : "text-bone/40")}>{eyebrow}</p>
      <h3 className="font-display text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}
