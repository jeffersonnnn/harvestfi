"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** "Launchpad" nav item with a hover dropdown: Launch your token + Explorer. Used in both navbars. */
export function LaunchpadDropdown({ tone = "dark" }: { tone?: "dark" | "hero" }) {
  const pathname = usePathname();
  const active = pathname.startsWith("/launch") || pathname.startsWith("/coins");
  const base =
    tone === "hero"
      ? "text-bone/80 hover:text-bone"
      : active
        ? "text-bone"
        : "text-bone/50 hover:text-bone/80";

  return (
    <div className="relative group">
      <button className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${base}`}>
        Launchpad
        <span className="text-[0.7em] opacity-70">▾</span>
        <span className="rounded-full bg-wheat/20 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-wheat">
          New
        </span>
      </button>
      <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100">
        <div className="w-64 overflow-hidden rounded-xl border border-bone/10 bg-soil-900 p-1.5 shadow-2xl">
          <DropItem href="/launch" title="Launch your token" sub="Paired with our RWAs" />
          <DropItem href="/coins" title="Explorer" sub="Every coin, by market" />
        </div>
      </div>
    </div>
  );
}

function DropItem({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-bone/[0.06]">
      <div className="text-sm font-medium text-bone">{title}</div>
      <div className="text-xs text-bone/50">{sub}</div>
    </Link>
  );
}
