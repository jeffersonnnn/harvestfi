"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface ChartPoint {
  t: number; // unix seconds
  v: number; // price (USD)
}

export function PriceChart({ points }: { points: ChartPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

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
      rightPriceScale: { borderColor: "rgba(242,233,214,0.08)", scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: "rgba(242,233,214,0.08)", timeVisible: true, secondsVisible: false },
      handleScale: { axisPressedMouseMove: false },
    });
    const series = chart.addAreaSeries({
      lineWidth: 2,
      lineType: LineType.Curved,
      lineColor: "#e4b24a",
      topColor: "rgba(228,178,74,0.22)",
      bottomColor: "rgba(228,178,74,0)",
      priceLineColor: "rgba(242,233,214,0.35)",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    // Dedupe by time + sort ascending (lightweight-charts requires strictly increasing time).
    const byTime = new Map<number, number>();
    for (const p of points) if (p.v > 0) byTime.set(p.t, p.v);
    const data = [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));

    // Trend colour: green if up over the window, terracotta if down.
    const up = data.length > 1 && data[data.length - 1].value >= data[0].value;
    const rgb = up ? "147,192,105" : "209,107,65";
    seriesRef.current.applyOptions({
      lineColor: `rgb(${rgb})`,
      topColor: `rgba(${rgb},0.22)`,
      bottomColor: `rgba(${rgb},0)`,
    });
    seriesRef.current.setData(data);
    if (data.length) chartRef.current.timeScale().fitContent();
  }, [points]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-bone/10 bg-soil-900/40 p-1">
      <div ref={containerRef} className="h-[300px] w-full sm:h-[340px]" />
      {points.length < 2 && (
        <div className="absolute inset-0 grid place-items-center text-sm text-bone/40">Gathering price history…</div>
      )}
    </div>
  );
}
