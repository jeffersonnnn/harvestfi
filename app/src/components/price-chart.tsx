"use client";

import { useRef, useState } from "react";

export interface ChartPoint {
  t: number; // unix seconds
  v: number; // price (USD)
}

const W = 820;
const H = 340;
const PAD = { top: 18, right: 66, bottom: 26, left: 12 };

function fmtUsd(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
}
function fmtTime(t: number) {
  return new Date(t * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** On-brand area chart of a market's price history, with a hover crosshair. */
export function PriceChart({ points }: { points: ChartPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="grid h-[280px] place-items-center rounded-2xl border border-bone/10 bg-soil-900/40 text-sm text-bone/40">
        Gathering price history…
      </div>
    );
  }

  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const range = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  const up = vs[vs.length - 1] >= vs[0];
  const color = up ? "var(--color-field)" : "var(--color-rust)";
  const last = points[points.length - 1];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((vx - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const hp = hover != null ? points[hover] : null;

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/40 p-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* hi / lo guide lines */}
        {[max, min].map((v, k) => (
          <g key={k}>
            <line x1={PAD.left} y1={y(v)} x2={PAD.left + innerW} y2={y(v)} stroke="var(--color-bone)" strokeOpacity="0.07" strokeDasharray="3 4" />
            <text x={W - PAD.right + 8} y={y(v) + 4} fill="var(--color-bone)" fillOpacity="0.4" fontSize="13" fontFamily="var(--font-mono)">
              {fmtUsd(v)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#area)" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {/* last price marker */}
        <circle cx={x(points.length - 1)} cy={y(last.v)} r="3" fill={color} />
        <line x1={PAD.left} y1={y(last.v)} x2={PAD.left + innerW} y2={y(last.v)} stroke={color} strokeOpacity="0.25" />

        {/* x-axis endpoints */}
        <text x={PAD.left} y={H - 6} fill="var(--color-bone)" fillOpacity="0.35" fontSize="12" fontFamily="var(--font-mono)">
          {fmtTime(points[0].t)}
        </text>
        <text x={PAD.left + innerW} y={H - 6} textAnchor="end" fill="var(--color-bone)" fillOpacity="0.35" fontSize="12" fontFamily="var(--font-mono)">
          {fmtTime(last.t)}
        </text>

        {/* hover crosshair */}
        {hp && hover != null && (
          <g>
            <line x1={x(hover)} y1={PAD.top} x2={x(hover)} y2={PAD.top + innerH} stroke="var(--color-bone)" strokeOpacity="0.2" />
            <circle cx={x(hover)} cy={y(hp.v)} r="3.5" fill="var(--color-bone)" />
            <g transform={`translate(${Math.min(x(hover) + 8, W - PAD.right - 96)}, ${PAD.top + 4})`}>
              <rect width="120" height="42" rx="6" fill="var(--color-soil-800)" stroke="var(--color-bone)" strokeOpacity="0.12" />
              <text x="8" y="18" fill="var(--color-bone)" fontSize="14" fontFamily="var(--font-mono)">{fmtUsd(hp.v)}</text>
              <text x="8" y="34" fill="var(--color-bone)" fillOpacity="0.45" fontSize="11" fontFamily="var(--font-mono)">{fmtTime(hp.t)}</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}
