"use client";

import Link from "next/link";
import { GROUPS } from "@/lib/commodities-meta";
import { IS_TESTNET } from "@/lib/chain";
import { BRAND } from "@/lib/brand";

const DATELINE = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      {/* Almanac dateline */}
      <div className="flex items-center justify-between border-b border-bone/10 py-3 text-bone/45">
        <span className="label">Vol. I · No. 1</span>
        <span className="label hidden sm:inline">{DATELINE}</span>
        <span className="label">{BRAND.short}</span>
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
            <Link
              href="/markets"
              className="rounded-full bg-wheat px-6 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
            >
              Launch app →
            </Link>
            <Link
              href="/licenses"
              className="rounded-full border border-bone/20 px-6 py-3 text-sm font-medium text-bone/90 transition-colors hover:border-bone/40 hover:bg-bone/5"
            >
              Own a license
            </Link>
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

      {/* How it works */}
      <section className="border-t border-bone/10 py-16">
        <p className="label mb-8 text-wheat">How it works</p>
        <div className="grid gap-8 sm:grid-cols-3">
          <Step n="01" title="Fund your wallet" body="Bring ETH onto Robinhood Chain — the app runs on native ETH collateral." />
          <Step n="02" title="Open a position" body="Pick a commodity, go long or short with leverage, and watch your PnL move on the live chart." />
          <Step n="03" title="Close & share" body="Close for your payout, then share a PnL card — or hold a market's license and earn its fees." />
        </div>
      </section>

      {/* Markets teaser */}
      <section className="border-t border-bone/10 py-16">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="label mb-2 text-wheat">The board</p>
            <h2 className="font-display text-3xl font-medium tracking-tight">23 agricultural markets</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {GROUPS.map((g) => (
                <span key={g} className="label rounded-full border border-bone/15 px-3 py-1 text-bone/55">
                  {g}
                </span>
              ))}
            </div>
          </div>
          <Link
            href="/markets"
            className="rounded-full bg-wheat px-6 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
          >
            Explore markets →
          </Link>
        </div>
      </section>

      <footer className="border-t border-bone/10 py-10 text-sm text-bone/50">
        Live on Robinhood Chain {IS_TESTNET ? "Testnet" : "Mainnet"}. Contracts hardened, 70 tests;
        external audit in progress before mainnet. Leveraged derivatives carry risk of total loss;
        availability may be geo-restricted.
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
