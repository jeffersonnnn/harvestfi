import Link from "next/link";
import { ConnectButton } from "./connect-button";
import { AddNetworkButton } from "./add-network-button";
import { IS_TESTNET } from "@/lib/chain";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">RWA Perps</span>
          {IS_TESTNET && (
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
              testnet
            </span>
          )}
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-white/60 sm:flex">
          <Link href="/" className="hover:text-white">
            Markets
          </Link>
          <Link href="/pool" className="hover:text-white">
            Pool
          </Link>
          <Link href="/licenses" className="hover:text-white">
            Licenses
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <AddNetworkButton />
        <ConnectButton />
      </div>
    </header>
  );
}
