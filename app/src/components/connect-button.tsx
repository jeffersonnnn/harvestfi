"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";
import { X } from "lucide-react";
import { truncateAddress } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-10 w-28 rounded-full bg-bone/5" />;

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="tnum rounded-full border border-bone/15 bg-bone/5 px-5 py-2.5 text-sm transition-colors hover:bg-bone/10"
      >
        {truncateAddress(address)}
      </button>
    );
  }

  const deduped = dedupe(connectors);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-wheat px-6 py-2.5 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
      >
        Connect
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-soil-950/80 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-bone/10 bg-soil-900 p-6"
            role="dialog"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-medium">Choose a wallet</h3>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4 text-bone/60" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {deduped.map((c) => (
                <button
                  key={c.uid}
                  disabled={isPending}
                  onClick={() => {
                    connect({ connector: c });
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-colors hover:bg-bone/5 disabled:opacity-50"
                >
                  {c.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon} alt="" className="h-6 w-6 rounded-md" />
                  ) : (
                    <div className="h-6 w-6 rounded-md bg-white/10" />
                  )}
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function dedupe(connectors: readonly Connector[]): Connector[] {
  const seen = new Set<string>();
  return connectors.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
}
