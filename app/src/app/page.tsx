"use client";

import Link from "next/link";
import { useMarkets } from "@/hooks/use-markets";
import { PoolStats } from "@/components/pool-stats";
import { MarketsTable } from "@/components/markets-table";
import { IS_TESTNET } from "@/lib/chain";
import { BRAND } from "@/lib/brand";

const DATELINE = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const TRUST = [
  "70 tests · fuzz + invariant",
  "Non-upgradeable",
  "Price-deviation circuit breaker",
  "Native-ETH collateral",
  "Audit before mainnet",
];

export default function Home() {
  const { markets, isLoading } = useMarkets();
  const liveCount = markets.filter((m) => !m.stale).length;

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      {/* Almanac dateline */}
      <div className="flex items-center justify-between border-b border-bone/10 py-3 text-bone/45">
        <span className="label">Vol. I · No. 1</span>
        <span className="label hidden sm:inline">{DATELINE}</span>
        <span className="label">{BRAND.short}</span>
      </div>

      {/* Hero — slim, sits directly above the live board */}
      <section className="grid gap-8 py-12 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="fadeup">
          <p className="label mb-4 text-wheat">Perpetual futures · real-world crops</p>
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.02] tracking-tight sm:text-[3.4rem]">
            Trade the harvest.
            <br />
            <span className="italic text-wheat">Own the field.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-bone/65">
            On-chain perpetual futures on <span className="text-bone">23 farm commodities</span> —
            native-ETH collateral, oracle-priced, a shared LP pool as counterparty. Go long or short
            with leverage, or mint a market&apos;s <span className="text-bone">license NFT</span> and
            collect <span className="text-field">70% of every trading fee</span> it earns.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#board"
              className="rounded-full bg-wheat px-6 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
            >
              View live markets ↓
            </a>
            <Link
              href="/how-it-works"
              className="rounded-full border border-bone/20 px-6 py-3 text-sm font-medium text-bone/90 transition-colors hover:border-bone/40 hover:bg-bone/5"
            >
              How it works
            </Link>
          </div>
          {/* Trust strip — facts, not adjectives */}
          <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2">
            {TRUST.map((t) => (
              <span key={t} className="label flex items-center gap-1.5 text-bone/45">
                <span className="h-1 w-1 rounded-full bg-field/70" />
                {t}
              </span>
            ))}
          </div>
        </div>

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

      {/* THE BOARD — live, usable on entry */}
      <section id="board" className="scroll-mt-20 border-t border-bone/10 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label text-wheat">The board</p>
            <h2 className="font-display text-3xl font-medium tracking-tight">Live markets</h2>
            <p className="mt-2 max-w-md text-sm text-bone/55">
              Prices are pushed on-chain every minute. A <span className="text-wheat/90">stale</span>{" "}
              badge means the feed paused — trading auto-disables until it resumes.
            </p>
          </div>
          <span className="label flex items-center gap-1.5 text-bone/50">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-field opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-field" />
            </span>
            {liveCount}/{markets.length} live
          </span>
        </div>

        <div className="mb-8">
          <PoolStats />
        </div>

        <MarketsTable markets={markets} isLoading={isLoading} />
      </section>

      {/* How it works — the real mechanism */}
      <section className="border-t border-bone/10 py-16">
        <p className="label mb-8 text-wheat">How it works</p>
        <div className="grid gap-8 sm:grid-cols-3">
          <Step
            n="01"
            title="Fund your wallet"
            body="Log in with email or a wallet, then bring ETH onto Robinhood Chain — the app settles in native ETH."
          />
          <Step
            n="02"
            title="Open a position"
            body="Pick a commodity, go long or short with leverage. The LP pool takes the other side; your PnL moves on the live chart."
          />
          <Step
            n="03"
            title="Close & share"
            body="Close for your payout from the pool, then share a PnL card — or hold a market's license and earn its fees."
          />
        </div>
        <Link
          href="/how-it-works"
          className="mt-8 inline-block text-sm text-wheat/90 underline-offset-4 hover:underline"
        >
          Read the full mechanism →
        </Link>
      </section>

      {/* License flywheel teaser */}
      <section className="border-t border-bone/10 py-16">
        <div className="grid gap-6 rounded-2xl border border-wheat/20 bg-wheat/[0.05] p-8 sm:grid-cols-[1.4fr_1fr] sm:items-center">
          <div>
            <p className="label mb-2 text-wheat">Own a market</p>
            <h2 className="font-display text-3xl font-medium tracking-tight">
              One license per commodity. 70% of its fees, forever.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-bone/65">
              Every market has a single transferable license NFT. Hold it and you collect 70% of that
              market&apos;s trading fees; the protocol keeps 30%. Sell the NFT to transfer the
              fee-right. The more your market trades, the more it pays.
            </p>
          </div>
          <div className="flex sm:justify-end">
            <Link
              href="/licenses"
              className="rounded-full bg-wheat px-6 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
            >
              Browse licenses →
            </Link>
          </div>
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-bone/10 py-10 text-sm text-bone/50">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/how-it-works" className="hover:text-bone/80">How it works</Link>
          <Link href="/markets" className="hover:text-bone/80">Markets</Link>
          <Link href="/pool" className="hover:text-bone/80">Pool</Link>
          <Link href="/licenses" className="hover:text-bone/80">Licenses</Link>
        </div>
        <p className="mt-2 max-w-3xl">
          Live on Robinhood Chain {IS_TESTNET ? "Testnet" : "Mainnet"}. Contracts hardened, 70 tests;
          external audit before mainnet. Leveraged derivatives carry risk of total loss; availability
          may be geo-restricted.
        </p>
      </footer>
    </div>
  );
}

function PitchCard({ eyebrow, title, body, gold }: { eyebrow: string; title: string; body: string; gold?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-5 transition-colors " +
        (gold ? "border-wheat/25 bg-wheat/[0.06] hover:border-wheat/40" : "border-bone/10 bg-soil-900/60 hover:border-bone/20")
      }
    >
      <p className={"label mb-2 " + (gold ? "text-wheat" : "text-bone/40")}>{eyebrow}</p>
      <h3 className="font-display text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="tnum mb-3 text-3xl font-medium text-wheat/70">{n}</div>
      <h3 className="font-display text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}
