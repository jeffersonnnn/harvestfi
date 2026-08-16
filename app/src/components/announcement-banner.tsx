"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Site-wide announcement banner that celebrates our two headline features and rotates between them.
 * Prediction markets lead (the newest launch); the launchpad follows. Each slide links to its product.
 *
 * Mobile: shows a SHORT, length-matched line per slide so both slides occupy the same height — a
 * fixed-height, vertically-centred row means the swap never reflows the page (no glitch/jump).
 */
const SLIDES = [
  {
    href: "/predict",
    short: "Prediction markets are live",
    lead: "Prediction markets are live.",
    body: "Stake ETH on whether real commodities clear a price by a date.",
    cta: "Predict now →",
    grad: "from-field/[0.14] via-field/[0.08] to-wheat/[0.10]",
    border: "border-field/25",
    accent: "text-field",
    badgeBg: "bg-field",
  },
  {
    href: "/launch",
    short: "Launch a token on a real market",
    lead: "The first launchpad pairing memecoins with real-world assets.",
    body: "Launch a token backed by a real commodity market.",
    cta: "Launch yours →",
    grad: "from-wheat/[0.14] via-wheat/[0.08] to-field/[0.10]",
    border: "border-wheat/25",
    accent: "text-wheat",
    badgeBg: "bg-wheat",
  },
];

export function AnnouncementBanner() {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setShow(false); // fade fully out first
      setTimeout(() => {
        setI((n) => (n + 1) % SLIDES.length); // swap content while invisible
        setShow(true); // then fade the next slide in
      }, 320);
    }, 5200);
    return () => clearInterval(t);
  }, []);

  const s = SLIDES[i];
  return (
    <Link href={s.href} className={`group block border-b ${s.border} bg-gradient-to-r ${s.grad}`}>
      {/* Fixed height + vertical centering => the rotate never changes the banner's height. */}
      <div
        className="mx-auto flex h-11 max-w-6xl items-center justify-center gap-2.5 px-5 text-center text-sm transition-opacity duration-300"
        style={{ opacity: show ? 1 : 0 }}
      >
        <span className={`shrink-0 rounded-full ${s.badgeBg} px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-soil-950`}>
          New
        </span>
        {/* Mobile: one short line. Desktop: full lead + body. */}
        <span className="min-w-0 truncate text-bone/85 sm:hidden">
          <span className={`font-semibold ${s.accent}`}>{s.short}</span>
        </span>
        <span className="hidden text-bone/85 sm:inline">
          <span className={`font-semibold ${s.accent}`}>{s.lead}</span> {s.body}
        </span>
        <span className={`shrink-0 font-medium ${s.accent} underline-offset-2 group-hover:underline`}>{s.cta}</span>
      </div>
    </Link>
  );
}
