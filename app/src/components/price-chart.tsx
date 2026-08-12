"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

export interface ChartPoint {
  t: number; // unix seconds
  v: number; // price (USD)
}

const BUCKET = 900; // 15-min candles from the 1/min price snapshots

function toCandles(points: ChartPoint[]): CandlestickData[] {
  const byBucket = new Map<number, ChartPoint[]>();
  for (const p of points) {
    const b = Math.floor(p.t / BUCKET) * BUCKET;
    (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(p);
  }
  return [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, ps]) => {
      const vs = ps.map((p) => p.v);
      return {
        time: b as UTCTimestamp,
        open: ps[0].v,
        high: Math.max(...vs),
        low: Math.min(...vs),
        close: ps[ps.length - 1].v,
      };
    });
}

export function PriceChart({ points }: { points: ChartPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(242,233,214,0.5)",
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(242,233,214,0.05)" },
        horzLines: { color: "rgba(242,233,214,0.05)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(242,233,214,0.25)", labelBackgroundColor: "#282016" },
        horzLine: { color: "rgba(242,233,214,0.25)", labelBackgroundColor: "#282016" },
      },
      rightPriceScale: { borderColor: "rgba(242,233,214,0.08)" },
      timeScale: { borderColor: "rgba(242,233,214,0.08)", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#93c069",
      downColor: "#d16b41",
      borderUpColor: "#93c069",
      borderDownColor: "#d16b41",
      wickUpColor: "#93c069",
      wickDownColor: "#d16b41",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Feed data whenever it changes.
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const candles = toCandles(points);
    seriesRef.current.setData(candles);
    if (candles.length) chartRef.current.timeScale().fitContent();
  }, [points]);

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/40 p-1">
      <div ref={containerRef} className="h-[340px] w-full" />
      {points.length < 2 && (
        <div className="-mt-[186px] mb-[170px] text-center text-sm text-bone/40">Gathering price history…</div>
      )}
    </div>
  );
}
