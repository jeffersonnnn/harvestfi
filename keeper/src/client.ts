import {createPublicClient, createWalletClient, http, defineChain} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "./config.js";

export const robinhoodChain = defineChain({
    id: config.chainId,
    name: "Robinhood Chain",
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [config.rpcUrl]}},
    blockExplorers: {
        default: {name: "Blockscout", url: "https://robinhoodchain.blockscout.com"},
    },
    // Canonical Multicall3 (verified deployed) — lets the keeper batch its many registry/oracle reads
    // into a single eth_call, which is essential under Cloudflare Workers' 50-subrequest/invocation cap.
    contracts: {multicall3: {address: "0xcA11bde05977b3631167028862bE2a173976CA11"}},
});

export const publicClient = createPublicClient({chain: robinhoodChain, transport: http(config.rpcUrl)});

export const account = privateKeyToAccount(config.privateKey);

export const walletClient = createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(config.rpcUrl),
});
