import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { NetworkBanner } from "@/components/network-banner";

export const metadata: Metadata = {
  title: "RWA Perps | Commodity Perpetuals on Robinhood Chain",
  description:
    "Trade perpetual futures on real-world commodities. Own the market license, earn the fees.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Providers>
          <Header />
          <NetworkBanner />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
