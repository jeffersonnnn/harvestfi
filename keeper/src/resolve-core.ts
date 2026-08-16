// Reusable single-pass PREDICTION-MARKET resolver, shared by a CLI and the Cloudflare Worker cron.
// Finds expired-but-open markets and settles them: try resolve() (needs a post-expiry oracle price);
// if that isn't possible yet, try cancel() (only valid past the grace period with no settlement price).
// Both are self-gating on-chain — a simulate revert just means "not ready" and is skipped — so this is
// safe to run on a cron. RPC-frugal: one multicall reads every market, then only expired-open markets
// are probed. Config is read from process.env at import time (the Worker injects env before import).
import {createPublicClient, createWalletClient, defineChain, http, parseAbi, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

const RPC = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "4663");
const PREDICTION = (process.env.PREDICTION_ADDRESS ?? "0xF8Ba8D3F862E6C0fC002e371a08dA9f8119C6482") as Address;
const DRY = (process.env.DRY_RUN ?? "true").toLowerCase() === "true";
const RESOLVE_LIMIT = Number(process.env.RESOLVE_LIMIT ?? "20"); // cap settlements per tick (gas/subrequests)

// Prefer a dedicated resolver key; fall back to the price signer (PRIVATE_KEY). resolve()/cancel() are
// permissionless, so any funded account works. Normalize a secret pasted without 0x / with a newline.
function normKey(k?: string): Hex | undefined {
    if (!k) return undefined;
    const t = k.trim();
    return (t.startsWith("0x") ? t : "0x" + t) as Hex;
}
const PK = normKey(process.env.RESOLVE_KEY ?? process.env.PRIVATE_KEY);

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

export const resolver = account?.address;

const predAbi = parseAbi([
    "function marketCount() view returns (uint256)",
    "function getMarket(uint256 marketId) view returns ((uint256 commodityId,uint256 thresholdE8,uint64 expiry,bool isAbove,uint8 status,bool outcomeYes,uint256 yesPool,uint256 noPool,uint256 winnerPool,uint256 netLosingPool,uint256 resolvedPrice,address creator))",
    "function resolve(uint256 marketId)",
    "function cancel(uint256 marketId)",
]);

type Market = {expiry: bigint; status: number};

/** Try resolve() first, then cancel(); both are simulated so a "not ready" revert is skipped safely. */
async function settle(marketId: number): Promise<boolean> {
    for (const fn of ["resolve", "cancel"] as const) {
        try {
            const {request} = await pub.simulateContract({address: PREDICTION, abi: predAbi, functionName: fn, args: [BigInt(marketId)], account});
            if (DRY) {
                console.log(`[resolve-keeper] [dry] market ${marketId} ${fn}() would send`);
                return true;
            }
            if (!wallet) {
                console.log("[resolve-keeper] no key set; cannot send");
                return false;
            }
            const hash = await wallet.writeContract(request);
            console.log(`[resolve-keeper] market ${marketId} ${fn}() -> ${hash}`);
            await pub.waitForTransactionReceipt({hash});
            return true;
        } catch {
            /* not ready via this path; try the next */
        }
    }
    return false;
}

/** One full pass: read every market, settle expired-open ones (up to RESOLVE_LIMIT). Cron-safe. */
export async function resolveOnce(): Promise<void> {
    const count = Number(await pub.readContract({address: PREDICTION, abi: predAbi, functionName: "marketCount"}));
    if (count === 0) return;

    const results = await pub.multicall({
        allowFailure: true,
        contracts: Array.from({length: count}, (_, id) => ({address: PREDICTION, abi: predAbi, functionName: "getMarket", args: [BigInt(id)]})),
    });
    const now = BigInt(Math.floor(Date.now() / 1000));
    const due: number[] = [];
    results.forEach((r, id) => {
        if (r.status !== "success") return;
        const m = r.result as unknown as Market;
        if (Number(m.status) === 0 && m.expiry <= now) due.push(id); // Open + expired
    });

    console.log(`[resolve-keeper] ${new Date().toISOString()} · ${due.length} expired-open of ${count}`);
    let done = 0;
    for (const id of due) {
        if (done >= RESOLVE_LIMIT) break;
        if (await settle(id)) done++;
    }
}
