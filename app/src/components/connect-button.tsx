"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { truncateAddress } from "@/lib/format";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/**
 * Wallet button. With Privy configured, one click opens Privy's login modal (email / Google /
 * external wallet) and provisions a self-custodial embedded wallet for users without one. Without a
 * Privy App ID the button is disabled so the rest of the app still renders.
 */
export function ConnectButton() {
  if (!PRIVY_APP_ID) return <DisabledConnect />;
  return <PrivyConnect />;
}

function PrivyConnect() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !ready) return <div className="h-10 w-28 rounded-full bg-bone/5" />;

  if (authenticated) {
    return (
      <button
        onClick={() => logout()}
        className="tnum rounded-full border border-bone/15 bg-bone/5 px-5 py-2.5 text-sm transition-colors hover:bg-bone/10"
      >
        {address ? truncateAddress(address) : "Sign out"}
      </button>
    );
  }

  return (
    <button
      onClick={() => login()}
      className="rounded-full bg-wheat px-6 py-2.5 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
    >
      Connect
    </button>
  );
}

function DisabledConnect() {
  return (
    <button
      disabled
      title="Set NEXT_PUBLIC_PRIVY_APP_ID to enable wallet login"
      className="cursor-not-allowed rounded-full bg-wheat/40 px-6 py-2.5 text-sm font-semibold text-soil-950/70"
    >
      Connect
    </button>
  );
}
