"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { useMarkets } from "@/hooks/use-markets";
import { CHAIN_ID, EXPLORER_URL } from "@/lib/chain";
import { prettyName, marketMeta } from "@/lib/commodities-meta";
import { truncateAddress } from "@/lib/format";
import {
  LAUNCHER,
  LAUNCH_REGISTRY,
  BENEFICIARY_VAULT,
  launcherAbi,
  launchRegistryAbi,
  beneficiaryVaultAbi,
  buildCreateToken,
  buildDistributeToken,
  encodeConfigData,
  encodeTokenData,
  predictTokenAddress,
  positionIdFromReceipt,
  randomSalt,
  hasRegistry,
  ipfsToHttp,
} from "@/lib/launchpad";
import { STRATEGY_VAULT_BYTECODE, strategyVaultAbi, buildStrategyConfig } from "@/lib/strategy-vault";

const LEVERAGE_OPTIONS = [2, 5, 10];

type Phase = "idle" | "working" | "done" | "error";

export function LaunchForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const { markets } = useMarkets();

  const [marketId, setMarketId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState(""); // ipfs:// URI after upload
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Strategy mode
  const [strategyOn, setStrategyOn] = useState(false);
  const [isLong, setIsLong] = useState(true);
  const [leverageX, setLeverageX] = useState(2);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    if (file.size > 4 * 1024 * 1024) {
      setUploadError("Image must be 4MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setImage(json.uri as string);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    token: Address;
    positionId?: bigint;
    hash: string;
    registered: boolean;
    strategyVault?: Address;
  } | null>(null);

  const selectedMarket = useMemo(
    () => (marketId === null ? undefined : markets.find((m) => m.id === marketId)),
    [markets, marketId]
  );
  const canSubmit =
    isConnected && !!publicClient && marketId !== null && name.trim().length > 0 && symbol.trim().length > 0;

  async function launch() {
    if (!canSubmit || !publicClient || !address || marketId === null) return;
    setPhase("working");
    setError("");
    setResult(null);
    try {
      const tokenData = encodeTokenData({
        description: name.trim(),
        image: image.trim() || undefined,
        website: website.trim() || undefined,
        twitter: twitter.trim() || undefined,
      });
      const createTokenData = buildCreateToken(name.trim(), symbol.trim().toUpperCase(), tokenData);

      setStep("Predicting token address...");
      const token = await predictTokenAddress(publicClient, address, createTokenData);

      const distributeData = buildDistributeToken(token, encodeConfigData(address), randomSalt());

      setStep("Confirm the launch in your wallet...");
      const hash = await writeContractAsync({
        address: LAUNCHER,
        abi: launcherAbi,
        functionName: "multicall",
        args: [[createTokenData, distributeData]],
        chainId: CHAIN_ID,
      });

      setStep("Launching on Robinhood Chain...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const positionId = positionIdFromReceipt(receipt, address);

      let registered = false;
      if (hasRegistry() && positionId !== undefined) {
        setStep("Confirm the market pairing in your wallet...");
        const regHash = await writeContractAsync({
          address: LAUNCH_REGISTRY,
          abi: launchRegistryAbi,
          functionName: "register",
          args: [token, BigInt(marketId), positionId],
          chainId: CHAIN_ID,
        });
        await publicClient.waitForTransactionReceipt({ hash: regHash });
        registered = true;
      }

      // Strategy mode: deploy a StrategyVault and lock the fee NFT into it (fees now run the strategy).
      let strategyVault: Address | undefined;
      if (strategyOn && positionId !== undefined && walletClient) {
        setStep("Deploy the strategy vault (confirm in your wallet)...");
        const config = buildStrategyConfig(token, positionId, marketId, { isLong, leverageX });
        const deployHash = await walletClient.deployContract({
          abi: strategyVaultAbi,
          bytecode: STRATEGY_VAULT_BYTECODE,
          args: [config],
        });
        const deployRcpt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
        strategyVault = deployRcpt.contractAddress ?? undefined;
        if (strategyVault) {
          setStep("Lock the fee stream into the strategy (confirm in your wallet)...");
          const lockHash = await writeContractAsync({
            address: BENEFICIARY_VAULT,
            abi: beneficiaryVaultAbi,
            functionName: "safeTransferFrom",
            args: [address, strategyVault, positionId],
            chainId: CHAIN_ID,
          });
          await publicClient.waitForTransactionReceipt({ hash: lockHash });
        }
      }

      setResult({ token, positionId, hash, registered, strategyVault });
      setPhase("done");
      // Auto-open the new coin's page (chart + stats + trade panel).
      router.push(`/coins/${token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Launch failed");
      setPhase("error");
    }
  }

  if (phase === "done" && result) {
    return (
      <div className="rounded-2xl border border-field/25 bg-soil-900/50 p-6">
        <p className="label text-field">Launched</p>
        <h2 className="mt-1 font-display text-2xl">{name} is live</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Token" value={truncateAddress(result.token)} href={`${EXPLORER_URL}/address/${result.token}`} />
          {result.positionId !== undefined && (
            <Row label="Fee NFT (positionId)" value={`#${result.positionId.toString()}`} />
          )}
          <Row label="Launch tx" value={truncateAddress(result.hash)} href={`${EXPLORER_URL}/tx/${result.hash}`} />
          <Row label="Paired market" value={selectedMarket ? prettyName(selectedMarket.symbol) : "-"} />
          <Row label="Explorer listing" value={result.registered ? "registered" : "registry not deployed yet"} />
          {result.strategyVault && (
            <Row
              label="Strategy vault"
              value={truncateAddress(result.strategyVault)}
              href={`${EXPLORER_URL}/address/${result.strategyVault}`}
            />
          )}
        </dl>
        <p className="mt-4 text-sm text-bone/60">
          {result.strategyVault
            ? `Fees now run a ${leverageX}x ${isLong ? "long" : "short"} on ${selectedMarket ? prettyName(selectedMarket.symbol) : "the market"} and buy back + burn the coin.`
            : "You hold the coin's creator-fee NFT. As it trades, collect your fees any time from the coin's page."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={`/coins/${result.token}`}
            className="rounded-full bg-wheat px-5 py-2 text-xs font-semibold text-soil-950 hover:bg-wheat/90"
          >
            View your coin →
          </Link>
          <Link
            href="/coins"
            className="rounded-full border border-bone/15 px-5 py-2 text-xs font-semibold text-bone/80 hover:bg-bone/10"
          >
            Explore all coins
          </Link>
          <button
            onClick={() => {
              setPhase("idle");
              setName("");
              setSymbol("");
              setImage("");
              setWebsite("");
              setTwitter("");
              setMarketId(null);
              setStrategyOn(false);
            }}
            className="text-xs font-semibold text-bone/50 hover:text-bone/80"
          >
            Launch another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/40 p-6">
      <div className="space-y-4">
        <Field label="Market">
          <select
            value={marketId ?? ""}
            onChange={(e) => setMarketId(e.target.value === "" ? null : Number(e.target.value))}
            className="w-full rounded-lg border border-bone/15 bg-soil-950 px-3 py-2.5 text-sm outline-none focus:border-wheat/50"
          >
            <option value="">Pick a commodity market...</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {marketMeta(m.symbol).glyph} {prettyName(m.symbol)} ({m.symbol})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Coin name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CornCoin"
              maxLength={40}
              className="w-full rounded-lg border border-bone/15 bg-soil-950 px-3 py-2.5 text-sm outline-none focus:border-wheat/50"
            />
          </Field>
          <Field label="Ticker">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="CORNCOIN"
              maxLength={12}
              className="tnum w-full rounded-lg border border-bone/15 bg-soil-950 px-3 py-2.5 text-sm uppercase outline-none focus:border-wheat/50"
            />
          </Field>
        </div>

        <Field label="Image (optional)">
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-bone/15 bg-soil-950 px-3 py-2.5 text-sm text-bone/80 hover:border-wheat/50">
              {uploading ? "Uploading..." : image ? "Change image" : "Choose image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={onPickImage}
              />
            </label>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ipfsToHttp(image)}
                alt="token"
                className="h-10 w-10 rounded-md border border-bone/10 object-cover"
              />
            )}
            {uploadError && <span className="text-xs text-rust">{uploadError}</span>}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Website (optional)">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-bone/15 bg-soil-950 px-3 py-2.5 text-sm outline-none focus:border-wheat/50"
            />
          </Field>
          <Field label="X / Twitter (optional)">
            <input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@handle or https://x.com/..."
              className="w-full rounded-lg border border-bone/15 bg-soil-950 px-3 py-2.5 text-sm outline-none focus:border-wheat/50"
            />
          </Field>
        </div>

        {/* Strategy mode */}
        <div className="rounded-lg border border-bone/10 bg-soil-950/50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={strategyOn}
              onChange={(e) => setStrategyOn(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-wheat"
            />
            <span className="text-sm">
              <span className="font-medium">Run a strategy</span>{" "}
              <span className="label ml-1 rounded-full bg-wheat/20 px-1.5 py-0.5 text-[0.6rem] text-wheat">Advanced</span>
              <span className="mt-1 block text-xs leading-relaxed text-bone/55">
                Instead of collecting fees, the coin&apos;s creator fees run a leveraged perp on{" "}
                {selectedMarket ? prettyName(selectedMarket.symbol) : "the market"}; profits buy back and burn the coin.
              </span>
            </span>
          </label>

          {strategyOn && (
            <div className="mt-4 space-y-3 border-t border-bone/10 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Direction">
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-soil-950 p-1">
                    <button
                      type="button"
                      onClick={() => setIsLong(true)}
                      className={`rounded-md py-2 text-sm ${isLong ? "bg-field/20 text-field" : "text-bone/50"}`}
                    >
                      Long
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLong(false)}
                      className={`rounded-md py-2 text-sm ${!isLong ? "bg-rust/20 text-rust" : "text-bone/50"}`}
                    >
                      Short
                    </button>
                  </div>
                </Field>
                <Field label="Leverage">
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-soil-950 p-1">
                    {LEVERAGE_OPTIONS.map((lv) => (
                      <button
                        type="button"
                        key={lv}
                        onClick={() => setLeverageX(lv)}
                        className={`rounded-md py-2 text-sm ${leverageX === lv ? "bg-wheat/20 text-wheat" : "text-bone/50"}`}
                      >
                        {lv}x
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <p className="rounded-md border border-rust/25 bg-rust/[0.06] px-3 py-2 text-xs leading-relaxed text-rust/90">
                Trade-off: you give up the creator-fee stream — it funds the strategy. Leverage can be
                liquidated, so the fees can be lost. Take-profit closes at 2x, with a stop-loss.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-bone/10 bg-soil-950/60 px-4 py-3 text-xs leading-relaxed text-bone/55">
          Fixed 1B supply, liquidity locked in a Uniswap v4 pool.{" "}
          {strategyOn ? (
            <>
              <span className="text-wheat">Strategy mode</span>: creator fees run a {leverageX}x{" "}
              {isLong ? "long" : "short"} on{" "}
              <span className="text-bone/80">{selectedMarket ? prettyName(selectedMarket.symbol) : "the market"}</span>{" "}
              and buy back + burn the coin.
            </>
          ) : (
            <>
              <span className="text-wheat">Creator fees are on</span>, so you receive the coin&apos;s trading fees and
              can collect them any time. The coin is themed on{" "}
              <span className="text-bone/80">{selectedMarket ? prettyName(selectedMarket.symbol) : "the market you pick"}</span>{" "}
              and shows that market&apos;s live price. It is not funded by that market&apos;s revenue.
            </>
          )}
        </div>

        {phase === "error" && <p className="text-sm text-rust">{error}</p>}
        {phase === "working" && <p className="text-sm text-wheat">{step}</p>}

        <button
          disabled={!canSubmit || phase === "working" || uploading}
          onClick={launch}
          className="w-full rounded-full bg-wheat px-4 py-3 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90 disabled:opacity-40"
        >
          {phase === "working" ? "Working..." : !isConnected ? "Connect wallet to launch" : "Launch coin"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label text-bone/50">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-bone/5 pb-2 last:border-0">
      <dt className="text-bone/50">{label}</dt>
      <dd className="tnum">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-wheat hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
