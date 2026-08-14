// Strategy-coin keeper: discovers StrategyVaults (fee NFT owned by a contract, not an EOA) and cranks
// them - harvest fees, open the leveraged perp at the threshold, and manage (close at take-profit /
// stop-loss -> buy back + burn). Each action is simulated first; a revert just means "condition not
// met" (below threshold / not at target / nothing to harvest) and is skipped. Bounties self-fund the
// buy-and-burn crank, so any funded wallet can run this.
//
//   RPC_URL=... CHAIN_ID=4663 PRIVATE_KEY=0x<cranker> DRY_RUN=false POLL_INTERVAL_MS=60000 \
//     LAUNCH_REGISTRY=0x59a2... npx tsx src/strategy.ts
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    type Address,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

const RPC = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "4663");
const LAUNCH_REGISTRY = (process.env.LAUNCH_REGISTRY ?? "0x59a277ce4Df70540fe06A193c4810e09Be8fe0e7") as Address;
const BENEFICIARY_VAULT = (process.env.BENEFICIARY_VAULT ?? "0xd35E9CA72F64C7F93BE30fad67524323396B36D7") as Address;
const PK = process.env.PRIVATE_KEY as Hex | undefined;
const POLL = Number(process.env.POLL_INTERVAL_MS ?? "60000");
const DRY = (process.env.DRY_RUN ?? "true").toLowerCase() === "true";
const LAUNCH_LIMIT = Number(process.env.LAUNCH_LIMIT ?? "200");

const chain = defineChain({
    id: CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [RPC]}},
    contracts: {multicall3: {address: "0xcA11bde05977b3631167028862bE2a173976CA11"}},
});

const pub = createPublicClient({chain, transport: http(RPC)});
const account = PK ? privateKeyToAccount(PK) : undefined;
const wallet = account ? createWalletClient({account, chain, transport: http(RPC)}) : undefined;

const registryAbi = parseAbi([
    "function recentLaunches(uint256 offset, uint256 limit) view returns ((address token,uint256 marketId,uint256 positionId,address creator,uint64 timestamp)[])",
]);
const benefAbi = parseAbi(["function ownerOf(uint256) view returns (address)"]);
const vaultAbi = parseAbi([
    "function marketId() view returns (uint256)",
    "function openPositionId() view returns (uint256)",
    "function pot() view returns (uint256)",
    "function harvest()",
    "function open(uint256 maxSlippagePrice)",
    "function manage(uint256 maxSlippagePrice)",
]);

/** A launched coin whose fee NFT is now owned by a StrategyVault contract (fee stream -> the strategy). */
async function discoverVaults(): Promise<Address[]> {
    const launches = await pub.readContract({
        address: LAUNCH_REGISTRY,
        abi: registryAbi,
        functionName: "recentLaunches",
        args: [0n, BigInt(LAUNCH_LIMIT)],
    });
    const vaults: Address[] = [];
    for (const l of launches) {
        try {
            const owner = await pub.readContract({
                address: BENEFICIARY_VAULT,
                abi: benefAbi,
                functionName: "ownerOf",
                args: [l.positionId],
            });
            const code = await pub.getCode({address: owner});
            if (!code || code === "0x") continue; // EOA => creator collects fees, not a strategy
            await pub.readContract({address: owner, abi: vaultAbi, functionName: "marketId"}); // must be a vault
            vaults.push(owner);
        } catch {
            /* not a strategy vault */
        }
    }
    return vaults;
}

const CRANK: {fn: "harvest" | "open" | "manage"; args: readonly bigint[]}[] = [
    {fn: "harvest", args: []},
    {fn: "open", args: [0n]},
    {fn: "manage", args: [0n]},
];

async function crank(vault: Address) {
    for (const {fn, args} of CRANK) {
        try {
            const {request} = await pub.simulateContract({
                address: vault,
                abi: vaultAbi,
                functionName: fn,
                args: args as never,
                account,
            });
            if (DRY) {
                console.log(`[dry] ${vault} ${fn}() would send`);
                continue;
            }
            if (!wallet) {
                console.log("[strategy-keeper] no PRIVATE_KEY set; cannot send");
                return;
            }
            const hash = await wallet.writeContract(request);
            console.log(`[strategy-keeper] ${vault} ${fn}() -> ${hash}`);
            await pub.waitForTransactionReceipt({hash});
        } catch {
            /* simulate reverted => condition not met; skip */
        }
    }
}

async function tick() {
    const vaults = await discoverVaults();
    console.log(`[strategy-keeper] ${new Date().toISOString()} · ${vaults.length} strategy vault(s)`);
    for (const v of vaults) await crank(v);
}

console.log(`[strategy-keeper] rpc=${RPC} chain=${CHAIN_ID} dryRun=${DRY} poll=${POLL}ms registry=${LAUNCH_REGISTRY}`);
if (account) console.log(`[strategy-keeper] cranker=${account.address}`);
await tick();
setInterval(() => {
    tick().catch((e) => console.error("[strategy-keeper] tick error:", e));
}, POLL);
