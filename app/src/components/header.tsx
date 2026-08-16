"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./connect-button";
import { AddNetworkButton } from "./add-network-button";
import { IS_TESTNET } from "@/lib/chain";
import { BRAND } from "@/lib/brand";
import { LaunchpadDropdown } from "./launchpad-nav";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/predict", label: "Predict", badge: "New" },
  { href: "/demo", label: "Demo" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/pool", label: "Pool" },
  { href: "/licenses", label: "Licenses" },
  { href: "/how-it-works", label: "How it works" },
];

// Flat list for the mobile drawer (the launchpad dropdown is spelled out on touch).
const MOBILE_NAV: { href: string; label: string; badge?: string }[] = [
  { href: "/markets", label: "Markets" },
  { href: "/predict", label: "Predict", badge: "New" },
  { href: "/launch", label: "Launch a token", badge: "New" },
  { href: "/coins", label: "Explorer" },
  { href: "/demo", label: "Demo" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/pool", label: "Pool" },
  { href: "/licenses", label: "Licenses" },
  { href: "/how-it-works", label: "How it works" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer on route change, and lock body scroll while it's open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // The home page ("/") ships its own full-screen hero navbar - hide the global one there.
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-40 border-b border-bone/10 bg-soil-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-7">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-wheat/15 text-wheat transition-colors group-hover:bg-wheat/25">
              {BRAND.mark}
            </span>
            <span className="font-display text-[1.35rem] font-semibold leading-none tracking-tight">
              {BRAND.short}
            </span>
            {IS_TESTNET && (
              <span className="label rounded-sm border border-wheat/30 px-1.5 py-0.5 text-wheat/90">
                testnet
              </span>
            )}
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.slice(0, 5).map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} badge={n.badge} pathname={pathname} />
            ))}
            <LaunchpadDropdown />
            {NAV.slice(5).map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} badge={n.badge} pathname={pathname} />
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <AddNetworkButton />
          </div>
          <ConnectButton />
          {/* Hamburger - mobile only */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] sm:hidden"
          >
            <span
              className="h-[2px] w-5 rounded-full bg-bone transition-all duration-300"
              style={{ transform: open ? "translateY(7px) rotate(45deg)" : "none" }}
            />
            <span
              className="h-[2px] w-5 rounded-full bg-bone transition-all duration-300"
              style={{ opacity: open ? 0 : 1 }}
            />
            <span
              className="h-[2px] w-5 rounded-full bg-bone transition-all duration-300"
              style={{ transform: open ? "translateY(-7px) rotate(-45deg)" : "none" }}
            />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="sm:hidden">
          <div className="border-t border-bone/10 bg-soil-950/95 backdrop-blur-md">
            <nav className="mx-auto flex max-w-6xl flex-col px-5 py-2">
              {MOBILE_NAV.map((n) => {
                const active = n.href === "/markets"
                  ? pathname.startsWith("/markets") || pathname.startsWith("/trade")
                  : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={
                      "flex items-center gap-2 border-b border-bone/5 py-3 text-base transition-colors " +
                      (active ? "text-bone" : "text-bone/60 hover:text-bone")
                    }
                  >
                    {n.label}
                    {n.badge && (
                      <span className="rounded-full bg-field/20 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-field">
                        {n.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="py-3">
                <AddNetworkButton />
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

function NavLink({
  href,
  label,
  badge,
  pathname,
}: {
  href: string;
  label: string;
  badge?: string;
  pathname: string;
}) {
  const active =
    href === "/markets"
      ? pathname.startsWith("/markets") || pathname.startsWith("/trade")
      : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors " +
        (active ? "text-bone" : "text-bone/50 hover:text-bone/80")
      }
    >
      {label}
      {badge && (
        <span className="rounded-full bg-field/20 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-field">
          {badge}
        </span>
      )}
    </Link>
  );
}
