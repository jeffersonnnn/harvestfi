import type { Metadata } from "next";
import Link from "next/link";
import { fetchPosition } from "@/lib/indexer";
import { BRAND } from "@/lib/brand";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${BRAND.short} · PnL card #${id}`,
    description: `A trade on ${BRAND.name}. ${BRAND.tagline}`,
  };
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pos = await fetchPosition(id);
  const closed = pos?.status === "closed" && pos.pnl != null;
  const pnlPct =
    pos && BigInt(pos.collateral) > 0n && closed
      ? Number((BigInt(pos.pnl!) * 10000n) / BigInt(pos.collateral)) / 100
      : null;
  const win = pnlPct != null && pnlPct >= 0 && !pos?.liquidated;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="label text-wheat">{BRAND.short}</p>
      <h1 className="mt-3 font-display text-3xl font-medium tracking-tight">
        {pos
          ? closed
            ? win
              ? "A winning trade."
              : "A trade, closed."
            : "An open position."
          : "Card not found"}
      </h1>
      {pos && closed && pnlPct != null && (
        <div
          className={
            "mt-6 font-display text-6xl font-bold " + (win ? "text-field" : "text-rust")
          }
        >
          {pnlPct >= 0 ? "+" : "−"}
          {Math.abs(pnlPct).toFixed(2)}%
        </div>
      )}
      <p className="mt-6 max-w-sm text-bone/55">
        {pos
          ? "Trade perpetual futures on real farm commodities, or own a market's license and earn 70% of its fees."
          : "This position hasn't been indexed yet, or the id is unknown."}
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-wheat px-7 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
      >
        Trade on {BRAND.short} →
      </Link>
    </div>
  );
}
