// Reusable single-pass strategy crank, shared by the CLI loop (`strategy.ts`) and the Cloudflare
// Worker (`worker/worker.ts`). Discovers StrategyVaults (fee NFT owned by a contract, not an EOA) and
// cranks each - harvest fees, open the leveraged perp at the threshold, manage (close at take-profit /
// stop-loss -> buy back + burn). Each action is simulated first; a revert just means "condition not met"
// and is skipped. Config is read from process.env at import time (the Worker injects env before import).
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
// The strategy cranker key is distinct from the price signer, so prefer CRANKER_KEY; fall back to
// PRIVATE_KEY so the existing `npm run strategy` invocation keeps working. Normalize it: a secret pasted
// without the 0x prefix (or with a stray newline) would otherwise crash privateKeyToAccount at import.
function normKey(k?: string): Hex | undefined {
    if (!k) return undefined;
    const t = k.trim();
    return (t.startsWith("0x") ? t : "0x" + t) as Hex;
}
const PK = normKey(process.env.CRANKER_KEY ?? process.env.PRIVATE_KEY);
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

export const cranker = account?.address;
export const strategyConfig = {RPC, CHAIN_ID, DRY, LAUNCH_REGISTRY};

const registryAbi = parseAbi([
    "function recentLaunches(uint256 offset, uint256 limit) view returns ((address token,uint256 marketId,uint256 positionId,address creator,uint64 timestamp)[])",
]);
const benefAbi = parseAbi([
    "function ownerOf(uint256) view returns (address)",
    "function claim(uint256 tokenId, uint256 minCurrency0Amount, uint256 minCurrency1Amount)",
]);
const vaultAbi = parseAbi([
    "function marketId() view returns (uint256)",
    "function positionNftId() view returns (uint256)",
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

/** True only if the vault has claimable ETH creator fees: a 1-wei ETH-floor claim, simulated AS the
 *  vault (the fee-NFT holder), succeeds. This skips the pointless empty harvests that dead/untraded
 *  coins would otherwise send every tick. */
async function harvestable(vault: Address): Promise<boolean> {
    try {
        const positionId = await pub.readContract({address: vault, abi: vaultAbi, functionName: "positionNftId"});
        await pub.simulateContract({
            address: BENEFICIARY_VAULT,
            abi: benefAbi,
            functionName: "claim",
            args: [positionId, 1n, 0n], // require >= 1 wei of currency0 (ETH); reverts if nothing to claim
            account: vault, // simulate as the NFT owner so the ownerOf check passes
        });
        return true;
    } catch {
        return false;
    }
}

async function crank(vault: Address) {
    // open() and manage() are self-gating (they revert when below threshold / not at target, so the
    // simulate skips them). harvest() always succeeds, so gate it on real claimable fees.
    const actions: {fn: "harvest" | "open" | "manage"; args: readonly bigint[]}[] = [
        {fn: "open", args: [0n]},
        {fn: "manage", args: [0n]},
    ];
    if (await harvestable(vault)) actions.unshift({fn: "harvest", args: []});

    for (const {fn, args} of actions) {
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
                console.log("[strategy-keeper] no cranker key set; cannot send");
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

/** One full pass: discover every strategy vault and crank it. Safe to call on a cron. */
export async function crankOnce(): Promise<void> {
    const vaults = await discoverVaults();
    console.log(`[strategy-keeper] ${new Date().toISOString()} · ${vaults.length} strategy vault(s)`);
    for (const v of vaults) await crank(v);
}
