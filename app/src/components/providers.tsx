"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { WagmiProvider as BaseWagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { config } from "@/lib/wagmi";
import { robinhoodChain } from "@/lib/chain";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Without a Privy App ID we cannot mount PrivyProvider, so fall back to plain wagmi + query.
  // The app still renders; wallet login is simply unavailable until NEXT_PUBLIC_PRIVY_APP_ID is set.
  if (!PRIVY_APP_ID) {
    if (typeof window !== "undefined") {
      console.warn(
        "[HarvestFi] NEXT_PUBLIC_PRIVY_APP_ID is not set - wallet login is disabled. " +
          "Create an app at dashboard.privy.io and set the env var.",
      );
    }
    return (
      <QueryClientProvider client={queryClient}>
        <BaseWagmiProvider config={config}>{children}</BaseWagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Log in with email or Google in seconds (self-custodial embedded wallet), or an
        // external wallet (MetaMask / Coinbase / WalletConnect) for existing crypto users.
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        // Robinhood Chain is the only chain the app trades on.
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],
        appearance: {
          theme: "dark",
          accentColor: "#e4b24a", // wheat gold - matches the Almanac palette
          walletChainType: "ethereum-only",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
