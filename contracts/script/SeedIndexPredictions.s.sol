// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Create prediction markets on the three synthetic INDEX markets (ids 68 ENERGY_INDEX,
///         69 METALS_INDEX, 70 GRAIN_INDEX). Each index tracks an equal-weight basket rebased to 100,
///         so round thresholds near 100 are the natural questions ("close above 100 this week?").
///
///         These are CREATE-ONLY — NO team stake is placed. Prediction markets are parimutuel: the
///         users bring the liquidity. Owner-only (createMarket is gated). Resolves automatically from
///         the oracle after expiry (the keeper's */15 cron settles expired markets).
///
///         PM_ADDRESS=0xF8Ba8D3F862E6C0fC002e371a08dA9f8119C6482 forge script script/SeedIndexPredictions.s.sol \
///           --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --private-key <owner> --slow
///
/// Thresholds are 1e8 USD (index level). Live at creation: ENERGY ~97, METALS ~100, GRAIN ~99.
contract SeedIndexPredictions is Script {
    uint256 constant ENERGY_INDEX = 68;
    uint256 constant METALS_INDEX = 69;
    uint256 constant GRAIN_INDEX = 70;

    function run() external {
        PredictionMarket pm = PredictionMarket(vm.envAddress("PM_ADDRESS"));
        uint64 t = uint64(block.timestamp);

        vm.startBroadcast();
        //                        id,           thresholdE8,     expiry,      isAbove
        // Three questions per index: near-the-money weekly, a monthly stretch, and a weekly downside.
        _mk(pm, ENERGY_INDEX, 100_00000000, t + 7 days, true); // Energy Index above 100 this week
        _mk(pm, ENERGY_INDEX, 105_00000000, t + 30 days, true); // Energy Index above 105 this month
        _mk(pm, ENERGY_INDEX, 95_00000000, t + 7 days, false); // Energy Index below 95 this week

        _mk(pm, METALS_INDEX, 100_00000000, t + 7 days, true); // Metals Index above 100 this week
        _mk(pm, METALS_INDEX, 105_00000000, t + 30 days, true); // Metals Index above 105 this month
        _mk(pm, METALS_INDEX, 95_00000000, t + 7 days, false); // Metals Index below 95 this week

        _mk(pm, GRAIN_INDEX, 100_00000000, t + 7 days, true); // Grain Index above 100 this week
        _mk(pm, GRAIN_INDEX, 105_00000000, t + 30 days, true); // Grain Index above 105 this month
        _mk(pm, GRAIN_INDEX, 95_00000000, t + 7 days, false); // Grain Index below 95 this week
        vm.stopBroadcast();

        console2.log("Seeded 9 index markets. Total now:", pm.marketCount());
    }

    function _mk(PredictionMarket pm, uint256 commodityId, uint256 thresholdE8, uint64 expiry, bool isAbove)
        internal
    {
        uint256 id = pm.createMarket(commodityId, thresholdE8, expiry, isAbove);
        console2.log("  market", id, "commodity", commodityId);
    }
}
