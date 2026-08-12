"use client";

import { useMarkets } from "@/hooks/use-markets";
import { LicensesTable } from "@/components/licenses-table";

export default function LicensesPage() {
  const { markets } = useMarkets();
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Market licenses</h1>
        <p className="mt-2 max-w-xl text-sm text-bone/60">
          Each commodity has a single transferable license NFT. Mint it to earn
          70% of that market&apos;s trading fees for as long as you hold it; the
          protocol keeps 30%. Sell the NFT to transfer the fee-right.
        </p>
      </div>
      <LicensesTable markets={markets} />
    </div>
  );
}
