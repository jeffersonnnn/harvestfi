"use client";

import { useRef, useState } from "react";
import { formatUsdPrice, truncateAddress } from "@/lib/format";

/// Everything a shareable PnL card needs. Realized cards come from a `PositionClosed` event; "open"
/// cards use the live mark as the exit price and the unrealized PnL.
export interface PnlCardData {
  symbol: string;
  unit?: string;
  isLong: boolean;
  leverageX: number; // sizeEth / collateral
  entryPrice: bigint; // 1e8 USD
  exitPrice: bigint; // 1e8 USD (live mark for open positions)
  pnlEth: bigint; // signed, wei
  pnlPct: number; // return on margin, %
  realized: boolean; // true = closed, false = live/open
  liquidated?: boolean;
  handle?: string; // wallet address or @handle, optional
  positionId?: string; // for the shareable /card/[id] unfurl link
}

const fmtEth = (wei: bigint) => {
  const neg = wei < 0n;
  const abs = neg ? -wei : wei;
  const s = (Number(abs) / 1e18).toFixed(4);
  return `${neg ? "−" : "+"}${s}`;
};

const fmtPct = (p: number) => `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}%`;

/// The visual card. Rendered at a fixed 2:3 size so the rasterized PNG is share-ready.
export function PnlCard({ data }: { data: PnlCardData }) {
  const win = data.pnlEth >= 0n && !data.liquidated;
  const accent = data.liquidated ? "#f43f5e" : win ? "#34d399" : "#f87171";

  return (
    <div
      style={{
        width: 440,
        height: 660,
        background:
          "radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.06), transparent 60%), linear-gradient(180deg,#0b0b0e 0%,#050507 100%)",
        color: "#fff",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
      className="relative flex flex-col justify-between rounded-3xl border border-white/10 p-8"
    >
      {/* Header: brand + side/leverage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-black"
            style={{ background: accent }}
          >
            ⛽
          </div>
          <span className="text-sm font-semibold tracking-wide text-white/80">
            RWA&nbsp;PERPS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              color: data.isLong ? "#34d399" : "#f87171",
              background: data.isLong
                ? "rgba(52,211,153,0.12)"
                : "rgba(248,113,113,0.12)",
            }}
          >
            {data.isLong ? "LONG" : "SHORT"}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
            {data.leverageX.toFixed(data.leverageX % 1 === 0 ? 0 : 1)}×
          </span>
        </div>
      </div>

      {/* Commodity */}
      <div>
        <div className="text-5xl font-bold tracking-tight">{data.symbol}</div>
        {data.unit && (
          <div className="mt-1 text-sm text-white/40">per {data.unit}</div>
        )}
      </div>

      {/* Hero PnL */}
      <div>
        <div
          className="text-7xl font-extrabold leading-none tracking-tighter"
          style={{ color: accent }}
        >
          {fmtPct(data.pnlPct)}
        </div>
        <div className="mt-2 text-2xl font-semibold" style={{ color: accent }}>
          {fmtEth(data.pnlEth)} ETH
        </div>
        {data.liquidated && (
          <div className="mt-3 inline-block rounded-md border border-rose-400/40 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-rose-300">
            Liquidated
          </div>
        )}
      </div>

      {/* Entry → Exit */}
      <div className="flex items-end justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/40">Entry</div>
          <div className="mt-1 text-lg font-semibold">
            {formatUsdPrice(data.entryPrice)}
          </div>
        </div>
        <div className="pb-1 text-white/30">→</div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-white/40">
            {data.realized ? "Exit" : "Mark"}
          </div>
          <div className="mt-1 text-lg font-semibold">
            {formatUsdPrice(data.exitPrice)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-white/40">
        <span>{data.handle ? truncateAddress(data.handle) : "rwa-perps"}</span>
        <span>{data.realized ? "realized" : "live"}</span>
      </div>
    </div>
  );
}

/// Overlay that shows the card and rasterizes it to a shareable PNG (download + best-effort copy).
export function PnlCardModal({
  data,
  onClose,
}: {
  data: PnlCardData;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "download" | "copy">(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyLink() {
    if (!data.positionId) return;
    const url = `${window.location.origin}/card/${data.positionId}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  async function render(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    // Dynamic import: modern-screenshot is DOM-only, keep it out of the server bundle.
    const { domToBlob } = await import("modern-screenshot");
    return domToBlob(cardRef.current, { scale: 2, quality: 1 });
  }

  async function download() {
    setBusy("download");
    try {
      const blob = await render();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rwa-perps-${data.symbol.toLowerCase()}-${data.realized ? "pnl" : "live"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    setBusy("copy");
    try {
      const blob = await render();
      if (!blob) return;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard image unsupported in this browser - download still works */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={cardRef}>
          <PnlCard data={data} />
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={busy !== null}
            onClick={download}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-40"
          >
            {busy === "download" ? "Rendering…" : "Download PNG"}
          </button>
          <button
            disabled={busy !== null}
            onClick={copy}
            className="rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
          >
            {copied ? "Copied ✓" : busy === "copy" ? "Rendering…" : "Copy image"}
          </button>
          {data.positionId && (
            <button
              onClick={copyLink}
              className="rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10"
            >
              {linkCopied ? "Link copied ✓" : "Copy link"}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
