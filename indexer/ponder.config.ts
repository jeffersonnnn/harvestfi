import {createConfig} from "ponder";
import {http} from "viem";
import {PerpEngineAbi} from "./abis/PerpEngineAbi";

// Index the PerpEngine's position lifecycle on Robinhood Chain. Fill the env vars (see .env.local.example):
// mainnet = 4663, testnet = 46630. PERP_ENGINE_START_BLOCK = the deploy block (don't scan from 0).
export default createConfig({
    networks: {
        robinhood: {
            chainId: Number(process.env.CHAIN_ID ?? "4663"),
            transport: http(process.env.PONDER_RPC_URL),
        },
    },
    contracts: {
        PerpEngine: {
            network: "robinhood",
            abi: PerpEngineAbi,
            address: process.env.PERP_ENGINE_ADDRESS as `0x${string}`,
            startBlock: Number(process.env.PERP_ENGINE_START_BLOCK ?? "0"),
        },
    },
});
