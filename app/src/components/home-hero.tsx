"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarkets } from "@/hooks/use-markets";
import { ConnectButton } from "./connect-button";
import { BRAND } from "@/lib/brand";
import { IS_TESTNET } from "@/lib/chain";

// Web-optimized (faststart) local copy of the supplied hero video — served same-origin
// so it streams instantly. Poster paints a still frame until the first video frame is ready.
const HERO_VIDEO = "/hero.mp4";
const HERO_POSTER = "/hero-poster.jpg";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/pool", label: "Pool" },
  { href: "/licenses", label: "Licenses" },
  { href: "/how-it-works", label: "How it works" },
];

const EASE = "cubic-bezier(0.76,0,0.24,1)";

function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function Play({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function HomeHero() {
  const { markets } = useMarkets();
  const liveCount = markets.filter((m) => !m.stale).length;
  const [open, setOpen] = useState(false);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <section className="relative h-screen w-full overflow-hidden font-inter">
      {/* Background video */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={HERO_VIDEO}
        poster={HERO_POSTER}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
      />
      {/* Legibility + blend-into-page overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-soil-950/60 via-soil-950/35 to-soil-950/95" />
      <div className="absolute inset-0 bg-soil-950/20" />

      {/* Content layer */}
      <div className="relative z-10 flex h-full flex-col">
        {/* Navbar */}
        <nav className="flex items-center justify-between px-6 py-5 md:px-12 md:py-6 lg:px-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-white/10 text-lg text-wheat backdrop-blur-sm">
                {BRAND.mark}
              </span>
              <span className="text-lg font-semibold tracking-tight text-white">{BRAND.short}</span>
              {IS_TESTNET && (
                <span className="label rounded-sm border border-white/25 px-1.5 py-0.5 text-white/70">
                  testnet
                </span>
              )}
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-sm font-light text-white/80 transition-colors duration-200 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <ConnectButton />
            </div>
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex h-10 w-10 flex-col items-center justify-center gap-[6px] md:hidden"
            >
              <span
                className="h-[2px] w-6 rounded-full bg-white transition-all duration-500"
                style={{ transitionTimingFunction: EASE, transform: open ? "translateY(8px) rotate(45deg)" : "none" }}
              />
              <span
                className="h-[2px] w-4 rounded-full bg-white transition-all duration-500"
                style={{ transitionTimingFunction: EASE, opacity: open ? 0 : 1 }}
              />
              <span
                className="h-[2px] w-6 rounded-full bg-white transition-all duration-500"
                style={{ transitionTimingFunction: EASE, transform: open ? "translateY(-8px) rotate(-45deg)" : "none" }}
              />
            </button>
          </div>
        </nav>

        {/* Hero content — our copy, Atelier layout */}
        <div className="flex flex-1 flex-col items-center justify-start px-6 pt-6 text-center sm:pt-8 md:pt-10 lg:pt-12">
          <p className="label mb-5 text-white/70">Perpetual futures · real-world commodities</p>

          <h1 className="max-w-5xl font-instrument text-4xl leading-[1.08] text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Trade the harvest.
            <br />
            <span className="italic text-wheat">Own the field.</span>
          </h1>

          <p className="mt-5 max-w-xl text-sm font-light leading-relaxed text-white/75 md:mt-6 md:text-base">
            HarvestFi brings the world&apos;s commodity markets on-chain as perpetual futures —
            starting with 23 farm commodities. Trade them with leverage in native ETH, or mint a
            market&apos;s license NFT and collect 70% of every fee it earns.
          </p>

          <div className="mt-7 flex flex-col items-center gap-4 sm:flex-row md:mt-8">
            <Link
              href="/markets"
              className="group flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-medium text-soil-950 transition-colors hover:bg-white/90"
            >
              Enter the markets
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/how-it-works"
              className="flex items-center gap-2 rounded-full border border-white/40 px-7 py-3 text-sm font-medium text-white transition-colors hover:border-white/60 hover:bg-white/10"
            >
              <Play className="h-3.5 w-3.5" />
              How it works
            </Link>
          </div>

          {liveCount > 0 && (
            <p className="label mt-7 flex items-center gap-2 text-white/60">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-field opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-field" />
              </span>
              {liveCount} of {markets.length} markets live right now
            </p>
          )}
        </div>

        {/* Trust strip pinned near the bottom of the hero */}
        <div className="hidden flex-wrap justify-center gap-x-5 gap-y-2 px-6 pb-8 sm:flex">
          {["70 tests · fuzz + invariant", "Non-upgradeable", "Price-deviation circuit breaker", "Native-ETH collateral", "Audit before mainnet"].map((t) => (
            <span key={t} className="label flex items-center gap-1.5 text-white/55">
              <span className="h-1 w-1 rounded-full bg-field/80" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Mobile menu overlay */}
      <div
        className={
          "fixed inset-0 z-50 md:hidden " + (open ? "pointer-events-auto" : "pointer-events-none")
        }
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0 bg-black/90 backdrop-blur-xl transition-opacity duration-700"
          style={{ transitionTimingFunction: EASE, opacity: open ? 1 : 0 }}
          onClick={() => setOpen(false)}
        />
        <div
          className="relative flex h-full flex-col transition-opacity duration-700"
          style={{ transitionTimingFunction: EASE, opacity: open ? 1 : 0 }}
        >
          {/* Menu header */}
          <div className="flex items-center justify-between px-6 py-5">
            <span className="text-lg font-semibold tracking-tight text-white">{BRAND.short}</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center"
            >
              <span className="relative h-6 w-6">
                <span className="absolute left-0 top-1/2 h-[2px] w-6 rounded-full bg-white" style={{ transform: "rotate(45deg)" }} />
                <span className="absolute left-0 top-1/2 h-[2px] w-6 rounded-full bg-white" style={{ transform: "rotate(-45deg)" }} />
              </span>
            </button>
          </div>

          {/* Links */}
          <div className="flex flex-1 flex-col justify-center px-6">
            {NAV.map((n, i) => (
              <div
                key={n.href}
                style={{
                  transition: `transform 700ms ${EASE}, opacity 700ms ${EASE}`,
                  transitionDelay: `${150 + i * 80}ms`,
                  transform: open ? "translateY(0)" : "translateY(2rem)",
                  opacity: open ? 1 : 0,
                }}
              >
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-white/10 py-4 font-instrument text-4xl text-white transition-all duration-300 hover:pl-4 sm:text-5xl"
                >
                  {n.label}
                </Link>
              </div>
            ))}
          </div>

          {/* Footer — wallet + CTA */}
          <div
            className="flex flex-col gap-3 px-6 pb-10"
            style={{
              transition: `transform 700ms ${EASE}, opacity 700ms ${EASE}`,
              transitionDelay: "550ms",
              transform: open ? "translateY(0)" : "translateY(2rem)",
              opacity: open ? 1 : 0,
            }}
          >
            <div onClick={() => setOpen(false)} className="[&>*]:w-full">
              <ConnectButton />
            </div>
            <Link
              href="/markets"
              onClick={() => setOpen(false)}
              className="block w-full rounded-full bg-white py-4 text-center text-sm font-medium text-soil-950"
            >
              Enter the markets
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
