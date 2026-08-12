"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./connect-button";
import { AddNetworkButton } from "./add-network-button";
import { IS_TESTNET } from "@/lib/chain";
import { BRAND } from "@/lib/brand";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/pool", label: "Pool" },
  { href: "/licenses", label: "Licenses" },
];

export function Header() {
  const pathname = usePathname();
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
            {NAV.map((n) => {
              const active =
                n.href === "/markets"
                  ? pathname.startsWith("/markets") || pathname.startsWith("/trade")
                  : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={
                    "rounded-md px-3 py-1.5 text-sm transition-colors " +
                    (active ? "text-bone" : "text-bone/50 hover:text-bone/80")
                  }
                >
                  {n.label}
                </Link>
              );
            })}
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
