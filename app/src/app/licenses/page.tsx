"use client";

import Link from "next/link";
import { useMarkets } from "@/hooks/use-markets";
import { LicensesTable } from "@/components/licenses-table";

export default function LicensesPage() {
  const { markets } = useMarkets();

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-10 sm:px-8">
      <div>
        <p className="label text-wheat">Own a market</p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">Market licenses</h1>
        <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-bone/65">
          Every commodity has a single transferable license NFT. Hold it and you earn{" "}
          <span className="text-field">70% of that market&apos;s trading fees</span> for as long as
          you hold it; the protocol keeps 30%. The more your market trades, the more it pays. Sell the
          NFT to transfer the fee-right.
        </p>
      </div>

      {/* How the license works */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          title="One per market"
          body="Exactly one license exists per commodity - 23 in all. Minting is first-come; there is no second."
        />
        <InfoCard
          title="70% of the fees"
          body="Each trade pays ~10 bps round-trip. Your 70% share accrues into a bucket you can claim any time."
          gold
        />
        <InfoCard
          title="Transferable"
          body="Sell the NFT and the fee-right goes with it. Your earned fees settle to you at the moment of sale."
        />
        <InfoCard
          title="Pre-mint backlog"
          body="Fees accrue even before a market is minted. The first person to mint that license claims the whole backlog."
        />
      </div>

      <LicensesTable markets={markets} />

      <p className="text-sm text-bone/50">
        New here?{" "}
        <Link href="/how-it-works" className="text-wheat/90 underline-offset-4 hover:underline">
          Read how fees flow to license holders →
        </Link>
      </p>
    </div>
  );
}

function InfoCard({ title, body, gold }: { title: string; body: string; gold?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-4 " +
        (gold ? "border-wheat/25 bg-wheat/[0.06]" : "border-bone/10 bg-soil-900/50")
      }
    >
      <h3 className={"font-display text-lg font-medium tracking-tight " + (gold ? "text-wheat" : "text-bone")}>
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}
