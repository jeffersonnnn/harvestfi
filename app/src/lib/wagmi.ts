import { http, createConfig } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { robinhoodChain } from "./chain";

export const config = createConfig({
  chains: [robinhoodChain],
  connectors: [coinbaseWallet({ appName: "RWA Perps" }), injected()],
  transports: { [robinhoodChain.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
