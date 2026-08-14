"use client";

import Link from "next/link";

/** Bold site-wide announcement of the launchpad milestone + value prop. */
export function LaunchpadBanner() {
  return (
    <Link
      href="/launch"
      className="group block border-b border-wheat/20 bg-gradient-to-r from-wheat/[0.14] via-wheat/[0.08] to-field/[0.10]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-5 py-2 text-center text-sm">
        <span className="rounded-full bg-wheat px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-soil-950">
          New
        </span>
        <span className="text-bone/85">
          <span className="font-semibold text-wheat">The first launchpad pairing memecoins with real-world assets.</span>{" "}
          Launch a token backed by a real commodity market.
        </span>
        <span className="font-medium text-wheat underline-offset-2 group-hover:underline">Launch yours →</span>
      </div>
    </Link>
  );
}
