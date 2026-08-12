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

  if (!mounted) return <div className="h-10 w-28 rounded-full bg-white/5" />;

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10 transition-colors"
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
        className="rounded-full bg-emerald-400 px-6 py-2.5 text-sm font-medium text-black hover:bg-emerald-300 transition-colors"
      >
        Connect
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6"
            role="dialog"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Choose a wallet</h3>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4 text-white/60" />
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
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm hover:bg-white/5 disabled:opacity-50"
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
