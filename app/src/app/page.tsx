import Link from "next/link";
import { HomeHero } from "@/components/home-hero";
import { IS_TESTNET } from "@/lib/chain";

export default function Home() {
  return (
    <>
      {/* Full-screen video hero (ships its own navbar + mobile menu) */}
      <HomeHero />

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Two ways in */}
        <section className="grid gap-3 pt-16 sm:grid-cols-2">
          <PitchCard
            eyebrow="For traders"
            title="Leverage on real crops"
            body="Native ETH collateral, oracle-priced, up to 10×, with live PnL you can share the second you close."
          />
          <PitchCard
            eyebrow="For owners"
            title="Be the house, keep the fees"
            body="One transferable license per market. Its holder earns 70% of that market's fees, forever."
            gold
          />
        </section>

        {/* What we're doing - the thesis */}
        <section className="border-t border-bone/10 py-16">
          <p className="label mb-8 text-wheat">What we&apos;re building</p>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <h2 className="font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              Real-world markets,
              <br />
              rebuilt as open infrastructure.
            </h2>
            <div className="space-y-4 text-[1.02rem] leading-relaxed text-bone/70">
              <p>
                Commodities move the real economy: the grain in your bread, the metal in your phone,
                the fuel in your tank. Yet the markets that price them sit behind brokers, minimums, and
                closing bells. We think they should be open, always-on, and ownable by the people who
                use them.
              </p>
              <p>
                HarvestFi is that market, rebuilt on-chain. A signed oracle brings real prices to the
                chain every minute. A shared <span className="text-bone">liquidity pool</span> is the
                counterparty to every trade, so anyone can go long or short with leverage in native ETH,
                no order book, no counterparty hunt.
              </p>
              <p>
                The twist is ownership. Every market has a single{" "}
                <span className="text-bone">license NFT</span>, and its holder earns 70% of that
                market&apos;s trading fees. The protocol keeps 30%. It turns a market into an asset you
                can own, operate, and sell, not just trade.
              </p>
              <Link href="/how-it-works" className="inline-block pt-1 text-sm text-wheat/90 underline-offset-4 hover:underline">
                Read the full mechanism →
              </Link>
            </div>
          </div>
        </section>

        {/* How it works - three steps */}
        <section className="border-t border-bone/10 py-16">
          <p className="label mb-8 text-wheat">How it works</p>
          <div className="grid gap-8 sm:grid-cols-3">
            <Step n="01" title="Fund your wallet" body="Log in with email or a wallet, then bring ETH onto Robinhood Chain. The app settles in native ETH." />
            <Step n="02" title="Open a position" body="Pick a commodity, go long or short with leverage. The LP pool takes the other side; your PnL moves on the live chart." />
            <Step n="03" title="Close & share" body="Close for your payout from the pool, then share a PnL card, or hold a market's license and earn its fees." />
          </div>
        </section>

        {/* License flywheel */}
        <section className="border-t border-bone/10 py-16">
          <div className="grid gap-6 rounded-2xl border border-wheat/20 bg-wheat/[0.05] p-8 sm:grid-cols-[1.4fr_1fr] sm:items-center">
            <div>
              <p className="label mb-2 text-wheat">Own a market</p>
              <h2 className="font-display text-3xl font-medium tracking-tight">
                One license per commodity. 70% of its fees, forever.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-bone/65">
                Every market has a single transferable license NFT. Hold it and you collect 70% of that
                market&apos;s trading fees; the protocol keeps 30%. Sell the NFT to transfer the
                fee-right. The more your market trades, the more it pays.
              </p>
            </div>
            <div className="flex sm:justify-end">
              <Link
                href="/licenses"
                className="rounded-full bg-wheat px-6 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
              >
                Browse licenses →
              </Link>
            </div>
          </div>
        </section>

        {/* Where this goes - expansion roadmap */}
        <section className="border-t border-bone/10 py-16">
          <p className="label mb-3 text-wheat">Where this goes</p>
          <h2 className="mb-3 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            One engine. Every real-world market.
          </h2>
          <p className="mb-10 max-w-2xl text-[1.02rem] leading-relaxed text-bone/65">
            The same machine (signed oracle, LP-pool counterparty, ownable license) generalizes far
            past the farm. We start where clean price data already exists and widen from there. Each new
            market ships with its own license, so the community can own the surface it expands onto.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Phase tag="Live" live title="Farm commodities" body="23 agricultural markets (grains, oilseeds, softs, dairy, materials), priced on-chain every minute." />
            <Phase tag="Next" title="Metals & energy" body="Gold, silver, copper, platinum, crude. Clean spot feeds already exist; list them through the same registry." />
            <Phase tag="Then" title="Livestock & industrials" body="Cattle, hogs, lumber, rubber, broadening the real-world catalog as feeds and liquidity mature." />
            <Phase tag="Beyond" title="Any real-world asset" body="FX, rates, carbon, and more. If it has a trustworthy price, it can become an ownable HarvestFi market." />
          </div>

          {/* Surfaces */}
          <div className="mt-10 rounded-2xl border border-bone/10 bg-soil-900/40 p-6">
            <p className="label mb-3 text-bone/45">And onto more surfaces</p>
            <p className="max-w-3xl text-[0.98rem] leading-relaxed text-bone/65">
              The web app is the first surface, not the only one. Next come a{" "}
              <span className="text-bone">mobile app</span>, <span className="text-bone">embeddable widgets</span>{" "}
              so any site can host a market, and a <span className="text-bone">public API</span> so other
              builders can plug HarvestFi markets into their own products. The protocol stays the same
              underneath; the ways to reach it multiply.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-bone/10 py-16 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            The harvest is open. Come trade it.
          </h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/markets"
              className="rounded-full bg-wheat px-7 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
            >
              Enter the markets →
            </Link>
            <Link
              href="/licenses"
              className="rounded-full border border-bone/20 px-7 py-3 text-sm font-medium text-bone/90 transition-colors hover:border-bone/40 hover:bg-bone/5"
            >
              Own a market
            </Link>
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-bone/10 py-10 text-sm text-bone/50">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/how-it-works" className="hover:text-bone/80">How it works</Link>
            <Link href="/markets" className="hover:text-bone/80">Markets</Link>
            <Link href="/pool" className="hover:text-bone/80">Pool</Link>
            <Link href="/licenses" className="hover:text-bone/80">Licenses</Link>
          </div>
          <p className="mt-2 max-w-3xl">
            Live on Robinhood Chain {IS_TESTNET ? "Testnet" : "Mainnet"}. Contracts hardened, 70 tests;
            external audit before mainnet. Leveraged derivatives carry risk of total loss; availability
            may be geo-restricted.
          </p>
        </footer>
      </div>
    </>
  );
}

function PitchCard({ eyebrow, title, body, gold }: { eyebrow: string; title: string; body: string; gold?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-5 transition-colors " +
        (gold ? "border-wheat/25 bg-wheat/[0.06] hover:border-wheat/40" : "border-bone/10 bg-soil-900/60 hover:border-bone/20")
      }
    >
      <p className={"label mb-2 " + (gold ? "text-wheat" : "text-bone/40")}>{eyebrow}</p>
      <h3 className="font-display text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="tnum mb-3 text-3xl font-medium text-wheat/70">{n}</div>
      <h3 className="font-display text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}

function Phase({ tag, title, body, live }: { tag: string; title: string; body: string; live?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-5 " +
        (live ? "border-field/30 bg-field/[0.05]" : "border-bone/10 bg-soil-900/50")
      }
    >
      <span
        className={
          "label inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 " +
          (live ? "bg-field/15 text-field" : "border border-bone/15 text-bone/45")
        }
      >
        {live && <span className="h-1 w-1 rounded-full bg-field" />}
        {tag}
      </span>
      <h3 className="mt-3 font-display text-lg font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-bone/60">{body}</p>
    </div>
  );
}
