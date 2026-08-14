import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, IBM_Plex_Mono, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { NetworkBanner } from "@/components/network-banner";
import { LaunchpadBanner } from "@/components/launchpad-banner";
// import { SimulatedBanner } from "@/components/simulated-banner";
import { BRAND } from "@/lib/brand";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
// Atelier-style hero type: Instrument Serif (headings) + Inter (nav/body).
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description:
    "Trade perpetual futures on corn, wheat, coffee, cocoa and 19 more real-world crops. Or own a market's license NFT and earn 70% of its fees.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${body.variable} ${mono.variable} ${instrument.variable} ${inter.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* <SimulatedBanner /> */}
          <LaunchpadBanner />
          <Header />
          <NetworkBanner />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
