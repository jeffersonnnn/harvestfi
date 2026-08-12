import { ImageResponse } from "next/og";
import { createPublicClient, http } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { REGISTRY_ADDRESS, commodityRegistryAbi } from "@/lib/contracts";
import { fetchPosition } from "@/lib/indexer";
import { prettyName } from "@/lib/commodities-meta";
import { BRAND } from "@/lib/brand";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${BRAND.short} — PnL card`;

const usd = (e8: bigint) => {
  const n = Number(e8) / 1e8;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pos = await fetchPosition(id);

  let name = pos ? `Market #${pos.commodity_id}` : "Unknown";
  if (pos) {
    try {
      const client = createPublicClient({ chain: robinhoodChain, transport: http() });
      const c = (await client.readContract({
        address: REGISTRY_ADDRESS,
        abi: commodityRegistryAbi,
        functionName: "getCommodity",
        args: [BigInt(pos.commodity_id)],
      })) as { symbol: string };
      name = prettyName(c.symbol);
    } catch {}
  }

  const closed = pos?.status === "closed" && pos.pnl != null;
  const collateral = pos ? BigInt(pos.collateral) : 1n;
  const pnl = closed ? BigInt(pos!.pnl!) : 0n;
  const pnlPct = collateral > 0n ? Number((pnl * 10000n) / collateral) / 100 : 0;
  const pnlEth = Number(pnl) / 1e18;
  const win = pnl >= 0n && !(pos?.liquidated);
  const accent = pos?.liquidated ? "#d16b41" : win ? "#93c069" : "#d16b41";
  const lev = pos && collateral > 0n ? Number(BigInt(pos.size_eth)) / Number(collateral) : 0;

  const pct = `${pnlPct >= 0 ? "+" : "−"}${Math.abs(pnlPct).toFixed(2)}%`;
  const eth = `${pnlEth >= 0 ? "+" : "−"}${Math.abs(pnlEth).toFixed(4)} ETH`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg,#1b1610 0%,#050403 100%)",
          color: "#f2e9d6",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, letterSpacing: 2, color: "#e4b24a" }}>
            {BRAND.mark}&nbsp;&nbsp;{BRAND.short.toUpperCase()}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 26 }}>
            <div style={{ display: "flex", padding: "6px 18px", borderRadius: 999, background: pos?.is_long ? "rgba(147,192,105,0.16)" : "rgba(209,107,65,0.16)", color: pos?.is_long ? "#93c069" : "#d16b41" }}>
              {pos?.is_long ? "LONG" : "SHORT"}
            </div>
            <div style={{ display: "flex", padding: "6px 18px", borderRadius: 999, background: "rgba(242,233,214,0.10)" }}>
              {lev.toFixed(lev % 1 === 0 ? 0 : 1)}×
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 600 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 800, color: accent, lineHeight: 1 }}>{pct}</div>
          <div style={{ display: "flex", fontSize: 40, color: accent, marginTop: 6 }}>{eth}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30, color: "rgba(242,233,214,0.6)" }}>
          <div style={{ display: "flex" }}>
            {pos ? `${usd(BigInt(pos.entry_price))} → ${closed && pos.exit_price ? usd(BigInt(pos.exit_price)) : "open"}` : ""}
          </div>
          <div style={{ display: "flex", color: "rgba(242,233,214,0.4)" }}>{closed ? "realized" : "live"}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
