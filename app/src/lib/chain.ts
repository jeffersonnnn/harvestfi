import { defineChain } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "46630");

const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ??
  "https://robinhoodchain.blockscout.com";
export const FAUCET_URL =
  process.env.NEXT_PUBLIC_FAUCET_URL ??
  "https://faucet.testnet.chain.robinhood.com/";

export const IS_TESTNET = CHAIN_ID !== 4663;

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: IS_TESTNET ? "Robinhood Chain Testnet" : "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: EXPLORER_URL } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});
