import { SIMULATED_PRICES } from "@/lib/chain";

/// Honest disclosure: when the keeper runs on the simulated source, tell users plainly that the
/// prices are synthetic and not real commodity market data. Rendered on every page.
export function SimulatedBanner() {
  if (!SIMULATED_PRICES) return null;
  return (
    <div className="relative z-50 border-b border-wheat/30 bg-wheat/10 px-4 py-2 text-center text-xs leading-snug text-wheat">
      <span className="font-semibold">Simulated prices.</span> These markets use a synthetic price
      model for testing, not real commodity market data.
    </div>
  );
}
