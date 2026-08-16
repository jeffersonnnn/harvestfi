"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarkets } from "@/hooks/use-markets";
import { usePredictions } from "@/hooks/use-predictions";
import { usePredictionActivity } from "@/hooks/use-prediction-activity";
import { PredictBoard } from "@/components/predict-board";
import { PredictionActivity } from "@/components/prediction-activity";
import { CreateMarketForm } from "@/components/create-market-form";

export default function PredictPage() {
  const { markets } = useMarkets();
  const { predictions, feeBps, isLoading, refetch } = usePredictions(markets);
  const [activityKey, setActivityKey] = useState(0);
  const activity = usePredictionActivity(activityKey);
  const openCount = predictions.filter((p) => p.phase === "open").length;

  // Refresh both the board reads and the activity feed after a write.
  function refetchAll() {
    refetch();
    setActivityKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-10 sm:px-8">
      <div>
        <p className="label text-wheat">Predict the harvest</p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">Prediction markets</h1>
        <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-bone/65">
          Stake ETH on whether a commodity is <span className="text-field">above</span> or{" "}
          <span className="text-rust">below</span> a price at a set date. It&apos;s{" "}
          <span className="text-bone">parimutuel</span>: everyone&apos;s stake goes into a YES pool or a
          NO pool, and at expiry the winning side splits the whole pot pro-rata — minus a 2.5% protocol
          fee. Every market settles automatically from the same on-chain price oracle the perps use.
        </p>
      </div>

      {/* How it works */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard title="Parimutuel" body="No house, no counterparty. The pot is the market — the winning side splits it." />
        <InfoCard title="Oracle-resolved" body="Real commodity prices settle each market automatically at expiry. No human judge." gold />
        <InfoCard title="Winners split the pot" body="Your payout is your stake plus your pro-rata share of the losing pool." />
        <InfoCard title="Self-funding" body="No liquidity pool needed. If a market can't settle, everyone is refunded in full." />
      </div>

      <CreateMarketForm markets={markets} refetch={refetchAll} />

      {predictions.length > 0 && <PredictionActivity data={activity} predictions={predictions} />}

      {isLoading ? (
        <div className="rounded-2xl border border-bone/10 bg-soil-900/50 p-8 text-center text-bone/50">
          Loading markets…
        </div>
      ) : (
        <>
          {openCount > 0 && (
            <p className="text-sm text-bone/50">
              {openCount} market{openCount === 1 ? "" : "s"} open for betting.
            </p>
          )}
          <PredictBoard
            predictions={predictions}
            feeBps={feeBps}
            bettorsByMarket={activity.bettorsByMarket}
            refetch={refetchAll}
          />
        </>
      )}

      <div className="rounded-xl border border-bone/10 bg-soil-950/40 p-4">
        <p className="text-xs leading-relaxed text-bone/45">
          Prediction markets are settled financial contracts and may not be available in every
          jurisdiction. Participate only where lawful and only if you are of legal age. Outcomes depend
          on real market prices and can result in the total loss of your stake. This is not investment
          advice.{" "}
          <Link href="/how-it-works" className="text-wheat/90 underline-offset-4 hover:underline">
            How settlement works →
          </Link>
        </p>
      </div>
    </div>
  );
}

function InfoCard({ title, body, gold }: { title: string; body: string; gold?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-4 " + (gold ? "border-wheat/25 bg-wheat/[0.06]" : "border-bone/10 bg-soil-900/50")
      }
    >
      <h3 className={"font-display text-lg font-medium tracking-tight " + (gold ? "text-wheat" : "text-bone")}>
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}
