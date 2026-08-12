"use client";

import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { useMarkets } from "@/hooks/use-markets";
import { usePositions } from "@/hooks/use-positions";
import { useLicenses } from "@/hooks/use-licenses";
import { PositionsDashboard } from "@/components/positions-dashboard";
import { formatETH } from "@/lib/format";
import { marketMeta, prettyName } from "@/lib/commodities-meta";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const { markets, count } = useMarkets();
  const { positions } = usePositions();
  const { licenses } = useLicenses(count || 29);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-2xl">Your portfolio</h1>
        <p className="mt-3 text-bone/55">Connect your wallet to see your balance, positions and license earnings.</p>
      </div>
    );
  }

  const margin = positions.reduce((s, p) => s + p.collateral, 0n);
  const pnl = positions.reduce((s, p) => s + (p.pnl ?? 0n), 0n);
  const myLicenses = licenses.filter((l) => l.holder?.toLowerCase() === address?.toLowerCase());
  const earnings = myLicenses.reduce((s, l) => s + (l.accruedFees ?? 0n), 0n);
  const pnlPos = pnl >= 0n;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <p className="label text-wheat">Account</p>
      <h1 className="mb-6 font-display text-3xl font-medium tracking-tight">Portfolio</h1>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-bone/10 bg-bone/10 lg:grid-cols-4">
        <Tile label="Wallet balance" value={bal ? formatETH(bal.value) : "—"} unit="ETH" />
        <Tile label="Open margin" value={formatETH(margin)} unit="ETH" />
        <Tile
          label="Unrealized PnL"
          value={`${pnlPos ? "+" : ""}${formatETH(pnl, 6)}`}
          unit="ETH"
          tone={pnl === 0n ? undefined : pnlPos ? "field" : "rust"}
        />
        <Tile label="License earnings" value={formatETH(earnings, 6)} unit="ETH" tone={earnings > 0n ? "wheat" : undefined} />
      </div>

      {/* Positions */}
      <section className="mt-10">
        <PositionsDashboard markets={markets} />
      </section>

      {/* License earnings */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-bone/50">Your market licenses</h2>
          <Link href="/licenses" className="label text-wheat hover:underline">
            Manage & claim →
          </Link>
        </div>
        {myLicenses.length === 0 ? (
          <p className="rounded-2xl border border-bone/10 bg-soil-900/40 px-5 py-6 text-sm text-bone/45">
            You don&apos;t hold any market licenses. Each earns 70% of its market&apos;s trading fees —{" "}
            <Link href="/licenses" className="text-wheat hover:underline">
              mint one
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-bone/10">
            {myLicenses.map((l) => {
              const sym = markets.find((m) => m.id === l.id)?.symbol ?? `#${l.id}`;
              const meta = marketMeta(sym);
              return (
                <div key={l.id} className="flex items-center justify-between border-b border-bone/5 px-5 py-3.5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-soil-800 text-base">{meta.glyph}</span>
                    <span className="font-medium">{prettyName(sym)}</span>
                  </div>
                  <span className="tnum text-sm text-field">{formatETH(l.accruedFees ?? 0n, 6)} ETH</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: "field" | "rust" | "wheat" }) {
  const c = tone === "field" ? "text-field" : tone === "rust" ? "text-rust" : tone === "wheat" ? "text-wheat" : "text-bone";
  return (
    <div className="bg-soil-900/70 px-5 py-4">
      <div className="label text-bone/40">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={"tnum text-2xl font-medium " + c}>{value}</span>
        <span className="text-xs text-bone/40">{unit}</span>
      </div>
    </div>
  );
}
