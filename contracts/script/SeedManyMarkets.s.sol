// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {PushPriceOracle} from "../src/PushPriceOracle.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";

/// @notice Curate a RICH board of prediction markets across every listed commodity that has a fresh
///         price. For each such commodity it reads the live oracle price and creates near-the-money
///         markets at several thresholds/horizons, so every market is meaningful (not an arbitrary
///         number). Owner-only (creation stays curated, like the market leaders). Gas-only — no deposit,
///         no per-market liquidity (bettors fund the pools; optionally pre-seed with SeedLiquidity).
///
///         Default matrix per commodity (3 markets): +2% in 7d, -2% in 7d, +5% in 30d. Skips any
///         commodity whose price is missing or stale (it could not resolve).
///
/// Env:
///   PM_ADDRESS   deployed PredictionMarket
///   ORACLE       PushPriceOracle
///   REGISTRY     CommodityRegistry
///   PRIVATE_KEY  owner key (passed via --private-key)
///
///   PM_ADDRESS=0xF8Ba... ORACLE=0x43F4... REGISTRY=0xB56A... \
///     forge script script/SeedManyMarkets.s.sol --rpc-url <mainnet> --broadcast --private-key <owner>
contract SeedManyMarkets is Script {
    function run() external {
        PredictionMarket pm = PredictionMarket(vm.envAddress("PM_ADDRESS"));
        PushPriceOracle oracle = PushPriceOracle(vm.envAddress("ORACLE"));
        CommodityRegistry registry = CommodityRegistry(vm.envAddress("REGISTRY"));

        uint256 count = registry.count();
        // Optional cap: only consider commodity ids [0, MAX_COMMODITIES). 0 = all. Lets you bound the
        // board size (the first ids are the flagship grains/softs). Default 20 keeps it curated.
        uint256 maxC = vm.envOr("MAX_COMMODITIES", uint256(20));
        if (maxC == 0 || maxC > count) maxC = count;
        // Optional start offset: only consider commodity ids [MIN_COMMODITY, maxC). Default 0. Lets you
        // seed a newly-appended block (e.g. energy at ids 51-67) without duplicating existing markets.
        uint256 minC = vm.envOr("MIN_COMMODITY", uint256(0));
        uint64 maxAge = oracle.maxPriceAge();
        uint64 t = uint64(block.timestamp);

        vm.startBroadcast();
        uint256 created;
        uint256 skipped;
        for (uint256 i = minC; i < maxC; i++) {
            if (!registry.isListed(i)) {
                skipped++;
                continue;
            }
            (int256 price, uint64 ts) = oracle.getPrice(i);
            // Skip commodities we can't resolve: no price, or a stale feed.
            if (price <= 0 || ts == 0 || t - ts > maxAge) {
                skipped++;
                continue;
            }
            uint256 p = uint256(price);

            // Near-the-money matrix. Thresholds are 1e8 USD derived from the live price.
            pm.createMarket(i, (p * 102) / 100, t + 7 days, true); // above +2%, 1 week
            pm.createMarket(i, (p * 98) / 100, t + 7 days, false); // below -2%, 1 week
            pm.createMarket(i, (p * 105) / 100, t + 30 days, true); // above +5%, 1 month
            created += 3;
            console2.log("  commodity", i, "-> +3 markets @ price", p);
        }
        vm.stopBroadcast();

        console2.log("Commodities skipped (unlisted/stale):", skipped);
        console2.log("Markets created this run:", created);
        console2.log("Total markets now:", pm.marketCount());
    }
}
