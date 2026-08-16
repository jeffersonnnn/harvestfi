"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { predictionMarketAbi, PREDICTION_MARKET_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatUsdPrice } from "@/lib/format";
import { prettyName, marketMeta } from "@/lib/commodities-meta";
import { type MarketInfo } from "@/hooks/use-markets";

const DURATIONS = [
  { label: "1 day", secs: 86_400 },
  { label: "3 days", secs: 259_200 },
  { label: "7 days", secs: 604_800 },
  { label: "30 days", secs: 2_592_000 },
];

/**
 * Owner/creator form to open a new prediction market. Visible only to the contract owner, or to anyone
 * once `permissionlessCreation` is enabled on-chain. Collapsible to keep the board clean.
 */
export function CreateMarketForm({ markets, refetch }: { markets: MarketInfo[]; refetch: () => void }) {
  const { address } = useAccount();
  const { data: owner } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "owner",
    chainId: CHAIN_ID,
  });
  const { data: permissionless } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "permissionlessCreation",
    chainId: CHAIN_ID,
  });

  const isOwner = !!address && !!owner && address.toLowerCase() === (owner as string).toLowerCase();
  const canCreate = isOwner || permissionless === true;

  const [open, setOpen] = useState(false);
  const [commodityId, setCommodityId] = useState<number | null>(null);
  const [isAbove, setIsAbove] = useState(true);
  const [threshold, setThreshold] = useState("");
  const [durationSecs, setDurationSecs] = useState(DURATIONS[1].secs);
  const [err, setErr] = useState("");

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();

  // Default the picker to the first market and prefill the threshold with its live price.
  const selected = useMemo(
    () => markets.find((m) => m.id === commodityId) ?? markets[0],
    [markets, commodityId]
  );
  useEffect(() => {
    if (commodityId === null && markets.length > 0) setCommodityId(markets[0].id);
  }, [markets, commodityId]);

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      refetch();
      setThreshold("");
      setOpen(false);
      reset();
    }
  }, [isSuccess, queryClient, refetch, reset]);

  if (!canCreate) return null;

  const busy = isPending || confirming;
  const preview =
    selected && threshold.trim()
      ? `Will ${prettyName(selected.symbol)} be ${isAbove ? "above" : "below"} ${fmtThreshold(threshold)} at close?`
      : null;

  function submit() {
    setErr("");
    if (selected == null) {
      setErr("Pick a commodity");
      return;
    }
    let thresholdE8: bigint;
    try {
      thresholdE8 = parseUnits(threshold.trim(), 8);
    } catch {
      setErr("Enter a valid USD threshold");
      return;
    }
    if (thresholdE8 <= 0n) {
      setErr("Threshold must be above 0");
      return;
    }
    const expiry = Math.floor(Date.now() / 1000) + durationSecs;
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "createMarket",
      args: [BigInt(selected.id), thresholdE8, BigInt(expiry), isAbove],
      chainId: CHAIN_ID,
    });
  }

  return (
    <div className="rounded-2xl border border-wheat/20 bg-wheat/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="label text-wheat">{isOwner ? "Owner" : "Create"}</p>
          <h3 className="font-display text-lg font-medium tracking-tight">Create a market</h3>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-wheat/30 bg-wheat/10 px-3 py-1.5 text-sm text-wheat transition-colors hover:bg-wheat/20"
        >
          {open ? "Close" : "New market"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {/* commodity */}
          <div>
            <label className="label text-bone/45">Commodity</label>
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setCommodityId(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-bone/15 bg-soil-950/60 px-3 py-2 font-mono text-sm outline-none focus:border-wheat/40"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {marketMeta(m.symbol).glyph} {prettyName(m.symbol)}
                  {m.priceE8 > 0n ? ` — now ${formatUsdPrice(m.priceE8)}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* direction + threshold */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-bone/45">Direction</label>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-bone/15 bg-soil-950/60 p-1">
                <button
                  onClick={() => setIsAbove(true)}
                  className={
                    "rounded-md py-1.5 text-sm font-semibold transition-colors " +
                    (isAbove ? "bg-field/90 text-soil-950" : "text-bone/50")
                  }
                >
                  Above
                </button>
                <button
                  onClick={() => setIsAbove(false)}
                  className={
                    "rounded-md py-1.5 text-sm font-semibold transition-colors " +
                    (!isAbove ? "bg-rust/90 text-bone" : "text-bone/50")
                  }
                >
                  Below
                </button>
              </div>
            </div>
            <div>
              <label className="label text-bone/45">Threshold (USD)</label>
              <input
                inputMode="decimal"
                placeholder={selected && selected.priceE8 > 0n ? formatUsdPrice(selected.priceE8) : "4.40"}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="mt-1 w-full rounded-lg border border-bone/15 bg-soil-950/60 px-3 py-2 font-mono text-sm outline-none focus:border-wheat/40"
              />
            </div>
          </div>

          {/* duration */}
          <div>
            <label className="label text-bone/45">Closes in</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.secs}
                  onClick={() => setDurationSecs(d.secs)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors " +
                    (durationSecs === d.secs
                      ? "border-wheat/50 bg-wheat/15 text-wheat"
                      : "border-bone/15 text-bone/55 hover:text-bone/80")
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {preview && (
            <p className="rounded-lg border border-bone/10 bg-soil-950/40 px-3 py-2 font-display text-base text-bone/80">
              {preview}
            </p>
          )}
          {err && <p className="text-sm text-rust">{err}</p>}

          <button
            disabled={busy}
            onClick={submit}
            className="w-full rounded-lg bg-wheat px-3 py-2.5 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create market"}
          </button>
        </div>
      )}
    </div>
  );
}

function fmtThreshold(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 4 : 2,
  });
}
