import { http } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { robinhoodChain } from "./chain";

// Privy owns the connectors (embedded wallet + external wallets), so this config carries no
// `connectors` list — Privy injects them. All existing wagmi hooks keep working unchanged.
export const config = createConfig({
  chains: [robinhoodChain],
  transports: { [robinhoodChain.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
