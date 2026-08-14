"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./connect-button";
import { AddNetworkButton } from "./add-network-button";
import { IS_TESTNET } from "@/lib/chain";
import { BRAND } from "@/lib/brand";
import { LaunchpadDropdown } from "./launchpad-nav";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/demo", label: "Demo" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/pool", label: "Pool" },
  { href: "/licenses", label: "Licenses" },
  { href: "/how-it-works", label: "How it works" },
];

export function Header() {
  const pathname = usePathname();
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
              <NavLink key={n.href} href={n.href} label={n.label} pathname={pathname} />
            ))}
            <LaunchpadDropdown />
            {NAV.slice(5).map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} pathname={pathname} />
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <AddNetworkButton />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active =
    href === "/markets"
      ? pathname.startsWith("/markets") || pathname.startsWith("/trade")
      : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={
        "rounded-md px-3 py-1.5 text-sm transition-colors " +
        (active ? "text-bone" : "text-bone/50 hover:text-bone/80")
      }
    >
      {label}
    </Link>
  );
}
