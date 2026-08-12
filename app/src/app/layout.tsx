import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { NetworkBanner } from "@/components/network-banner";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Grain Exchange — Perpetuals on real farm commodities",
  description:
    "Trade perpetual futures on corn, wheat, coffee, cocoa and 19 more real-world crops. Or own a market's license NFT and earn 70% of its fees.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${body.variable} ${mono.variable}`}
    >
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
