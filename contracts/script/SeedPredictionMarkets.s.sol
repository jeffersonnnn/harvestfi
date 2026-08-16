// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Seed a spread of prediction markets so the board looks intentional on day one. Creates a
///         variety of commodities, directions (above/below), thresholds near live prices, and
///         durations. Owner-only (createMarket is gated until permissionlessCreation). These are REAL
///         markets — no fake activity, just a populated board. Run with the owner key.
///
/// Env:
///   PM_ADDRESS   deployed PredictionMarket
///   PRIVATE_KEY  owner key (passed via --private-key)
///
///   PM_ADDRESS=0xF8Ba... forge script script/SeedPredictionMarkets.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --private-key <owner>
///
/// Thresholds below are 1e8 USD, chosen near the commodities' recent prices (2026-08-16). Adjust to
/// taste before running. commodityIds match the mainnet registry (0 CORN already has market #0).
contract SeedPredictionMarkets is Script {
    function run() external {
        PredictionMarket pm = PredictionMarket(vm.envAddress("PM_ADDRESS"));
        uint64 t = uint64(block.timestamp);

        vm.startBroadcast();
        //   commodityId, thresholdE8,     expiry,             isAbove
        _mk(pm, 1, 640_000000, t + 3 days, true); // WHEAT above $6.40
        _mk(pm, 2, 1400_000000, t + 3 days, true); // RICE above $14.00
        _mk(pm, 3, 1150_000000, t + 7 days, true); // SOYBEANS above $11.50
        _mk(pm, 4, 310_000000, t + 2 days, false); // COFFEE below $3.10
        _mk(pm, 5, 15_000000, t + 5 days, true); // SUGAR above $0.15
        _mk(pm, 6, 82_000000, t + 7 days, true); // COTTON above $0.82
        _mk(pm, 7, 375_000000, t + 2 days, false); // OAT below $3.75
        vm.stopBroadcast();

        console2.log("Seeded 7 markets. Total now:", pm.marketCount());
    }

    function _mk(PredictionMarket pm, uint256 commodityId, uint256 thresholdE8, uint64 expiry, bool isAbove)
        internal
    {
        uint256 id = pm.createMarket(commodityId, thresholdE8, expiry, isAbove);
        console2.log("  market", id, "commodity", commodityId);
    }
}
