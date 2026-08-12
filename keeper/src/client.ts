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
});

export const publicClient = createPublicClient({chain: robinhoodChain, transport: http(config.rpcUrl)});

export const account = privateKeyToAccount(config.privateKey);

export const walletClient = createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(config.rpcUrl),
});
