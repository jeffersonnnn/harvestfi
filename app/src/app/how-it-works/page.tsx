import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works · HarvestFi",
  description:
    "The machinery behind HarvestFi: signed push oracle, LP-pool counterparty, funding and borrow fees, the 70/30 license split, and the safety systems.",
};

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <p className="label text-wheat">Under the hood</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">How HarvestFi works</h1>
      <p className="mt-4 text-[1.05rem] leading-relaxed text-bone/65">
        HarvestFi is an on-chain perpetual-futures exchange for real-world farm commodities. You trade
        with leverage against a shared liquidity pool, prices come from a signed oracle, and each
        market&apos;s trading fees flow to the holder of its license NFT. Here is the whole machine.
      </p>

      {/* Architecture */}
      <Section eyebrow="01" title="The contracts">
        <p>Six non-upgradeable contracts on Robinhood Chain, each with one job:</p>
        <Defs
          items={[
            ["CommodityRegistry", "The market catalog: symbol, unit, leverage cap, fees, and open-interest cap per commodity."],
            ["PushPriceOracle", "Holds the latest signed USD price per market, with a max-age staleness rule and a price-deviation circuit breaker."],
            ["LiquidityPool", "The ETH pool that is the counterparty to every trade. LP shares appreciate as the pool grows; dead-shares block the first-deposit inflation edge."],
            ["PerpEngine", "Opens, closes, and liquidates positions; computes PnL, funding, and the borrow fee; settles everything against the pool."],
            ["FeeManager", "Splits each trading fee 70% to the market's license holder, 30% to the protocol."],
            ["MarketLicenseNFT", "One transferable NFT per market. The holder earns that market's 70% fee share."],
          ]}
        />
      </Section>

      {/* Price path */}
      <Section eyebrow="02" title="How prices reach the chain">
        <p>
          A keeper reads a real commodity feed, normalizes every quote to a common 1e8 USD format,
          signs it, and posts it on-chain. The engine reads only that on-chain price.
        </p>
        <Flow steps={["Market feed", "Normalize to 1e8 USD", "Sign", "Post on-chain", "Engine reads price"]} />
        <p>
          If a market&apos;s price goes stale (the feed pauses on a weekend or overnight), the oracle
          marks it stale and the app auto-disables trading on it until a fresh price arrives. A new
          price that jumps too far from the last one is rejected by the circuit breaker.
        </p>
      </Section>

      {/* Counterparty */}
      <Section eyebrow="03" title="The pool is the counterparty">
        <p>
          There is no order book and no matched taker. When you open a position, the{" "}
          <span className="text-bone">liquidity pool</span> takes the other side. Your profit is paid
          from the pool; your loss is paid into it. LPs therefore profit when traders lose in
          aggregate, and they also earn the <span className="text-bone">borrow fee</span>.
        </p>
        <p>
          <span className="text-bone">Funding</span> keeps the market balanced: when one side is
          heavier, it pays the lighter side, which pulls open interest back toward neutral. The{" "}
          <span className="text-bone">borrow fee</span> is paid by the heavier side and scales with how
          much of the pool is in use, so crowded trades cost more to hold.
        </p>
        <p className="text-bone/55">
          Because the pool backs every payout, a market can only support as much open interest as the
          pool can cover. That is why open-interest caps start conservative and widen as liquidity
          grows.
        </p>
      </Section>

      {/* Fees */}
      <Section eyebrow="04" title="Fees and the 70/30 split">
        <p>
          Each trade pays a small fee on open and on close: 5 bps each, about 0.10% round-trip on
          notional. Every fee is split the same way:
        </p>
        <div className="my-4 grid grid-cols-2 gap-3">
          <Stat big="70%" label="to the market's license holder" gold />
          <Stat big="30%" label="to the protocol treasury" />
        </div>
        <p>
          Fees accrue into a per-market bucket that the current license holder can claim at any time.
          When a license is sold, the seller&apos;s earned fees settle to them and the buyer earns
          cleanly from the sale forward. Fees also accrue <span className="text-bone">before</span> a
          market is minted, so the first person to mint that license can claim the whole backlog.
        </p>
        <Link href="/licenses" className="text-sm text-wheat/90 underline-offset-4 hover:underline">
          Browse market licenses →
        </Link>
      </Section>

      {/* Safety */}
      <Section eyebrow="05" title="Safety systems">
        <Defs
          items={[
            ["Insurance fund", "Backstops bad debt so a losing position that blows through its margin does not drain the pool."],
            ["Flat liquidation fee", "A liquidator is paid a fixed reward from collateral, keeping under-margined positions closed promptly."],
            ["Guardian pause", "A guardian can pause trading in an emergency without being able to touch user funds."],
            ["Circuit breaker", "The oracle rejects a price that deviates too far from the previous one, blocking a single bad print."],
            ["Non-upgradeable", "The contracts cannot be changed after deploy; no admin key can rewrite the logic under you."],
          ]}
        />
      </Section>

      {/* Risk */}
      <div className="mt-12 rounded-2xl border border-rust/25 bg-rust/[0.06] p-6 text-sm leading-relaxed text-bone/70">
        <p className="label mb-2 text-rust">Risk</p>
        Leverage can lose your entire margin. Prices come from a single signed oracle today;
        decentralizing it is planned. The pool&apos;s depth caps position size. Leveraged commodity
        derivatives are regulated in many places, so availability may be geo-restricted. Trade only
        what you can afford to lose.
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/markets"
          className="rounded-full bg-wheat px-6 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
        >
          Go to markets →
        </Link>
        <Link
          href="/pool"
          className="rounded-full border border-bone/20 px-6 py-3 text-sm font-medium text-bone/90 transition-colors hover:border-bone/40 hover:bg-bone/5"
        >
          Provide liquidity
        </Link>
      </div>
    </div>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t border-bone/10 pt-8">
      <div className="flex items-baseline gap-3">
        <span className="tnum text-sm text-wheat/70">{eyebrow}</span>
        <h2 className="font-display text-2xl font-medium tracking-tight">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-[0.98rem] leading-relaxed text-bone/70">{children}</div>
    </section>
  );
}

function Defs({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-2 divide-y divide-bone/5 rounded-2xl border border-bone/10 bg-soil-900/40">
      {items.map(([term, def]) => (
        <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[0.9fr_1.6fr] sm:gap-4">
          <dt className="font-display text-[0.98rem] font-medium text-bone">{term}</dt>
          <dd className="text-sm text-bone/60">{def}</dd>
        </div>
      ))}
    </dl>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="my-3 flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          <span className="label rounded-full border border-bone/15 bg-soil-900/60 px-3 py-1.5 text-bone/70">
            {s}
          </span>
          {i < steps.length - 1 && <span className="text-wheat/60">→</span>}
        </span>
      ))}
    </div>
  );
}

function Stat({ big, label, gold }: { big: string; label: string; gold?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-4 " +
        (gold ? "border-wheat/25 bg-wheat/[0.06]" : "border-bone/10 bg-soil-900/50")
      }
    >
      <div className={"font-display text-3xl font-medium " + (gold ? "text-wheat" : "text-bone")}>{big}</div>
      <div className="mt-1 text-xs text-bone/55">{label}</div>
    </div>
  );
}
