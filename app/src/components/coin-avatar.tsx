"use client";

import { ipfsToHttp } from "@/lib/launchpad";
import { marketMeta } from "@/lib/commodities-meta";

/** Coin image (or a commodity-glyph fallback) with a small market badge, so every coin visibly
 *  shows which HarvestFi commodity market it is paired to. */
export function CoinAvatar({
  image,
  marketSymbol,
  size = 44,
}: {
  image?: string;
  marketSymbol?: string;
  size?: number;
}) {
  const glyph = marketSymbol ? marketMeta(marketSymbol).glyph : "•";
  const src = ipfsToHttp(image);
  const badge = Math.round(size * 0.46);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full rounded-full border border-wheat/30 object-cover"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center rounded-full border border-wheat/30 bg-soil-800"
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          {glyph}
        </div>
      )}
      <span
        title={marketSymbol ? `paired to ${marketSymbol}` : undefined}
        className="absolute -bottom-1 -right-1 grid place-items-center rounded-full border-2 border-soil-950 bg-soil-850"
        style={{ width: badge, height: badge, fontSize: Math.round(badge * 0.6) }}
      >
        {glyph}
      </span>
    </div>
  );
}
