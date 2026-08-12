export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 84;
  const h = 26;

  if (values.length < 2) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
        <line
          x1="0"
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / range) * (h - 4);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--color-field)" : "var(--color-rust)";
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} fill="none" aria-hidden>
      <path d={line} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="1.7" fill={color} />
    </svg>
  );
}
