// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Seed DISCLOSED protocol liquidity into every open prediction market: places a real bet on
///         both the YES and NO side of each open market so pools are non-empty and payout multiples are
///         meaningful. This is a REAL position by the team (shown as the owner address in the feed), not
///         fabricated activity. Balanced amounts (YES == NO) keep odds ~50/50 and are near cost-free
///         because the protocol fee flows back to the treasury; skew them to create a directional view.
///
/// Env:
///   PM_ADDRESS     deployed PredictionMarket
///   SEED_YES_WEI   wei to stake on YES per market (default 0.002 ETH)
///   SEED_NO_WEI    wei to stake on NO  per market (default 0.002 ETH)
///   PRIVATE_KEY    funded key (passed via --private-key); needs (YES+NO) * openMarkets + gas
///
///   PM_ADDRESS=0xF8Ba... forge script script/SeedLiquidity.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --private-key <owner>
contract SeedLiquidity is Script {
    function run() external {
        PredictionMarket pm = PredictionMarket(vm.envAddress("PM_ADDRESS"));
        uint256 yesWei = vm.envOr("SEED_YES_WEI", uint256(0.002 ether));
        uint256 noWei = vm.envOr("SEED_NO_WEI", uint256(0.002 ether));
        // Cap how many markets to seed (0 = all). Seeds markets [0, MAX_MARKETS). Budget guard: seeding
        // every open market at 0.002/side across a big board can exceed the owner balance, so bound it.
        uint256 maxM = vm.envOr("MAX_MARKETS", uint256(0));
        uint256 count = pm.marketCount();
        if (maxM == 0 || maxM > count) maxM = count;
        // Start offset (default 0): seeds markets [MIN_MARKET, maxM). Lets you fund only a freshly-created
        // block (e.g. energy prediction markets at ids 68+) without re-betting the ones already seeded.
        uint256 minM = vm.envOr("MIN_MARKET", uint256(0));

        vm.startBroadcast();
        uint256 seeded;
        for (uint256 i = minM; i < maxM; i++) {
            PredictionMarket.Market memory m = pm.getMarket(i);
            // Only open markets still accepting bets.
            if (m.status != PredictionMarket.Status.Open || m.expiry <= block.timestamp) continue;
            if (yesWei > 0) pm.bet{value: yesWei}(i, true);
            if (noWei > 0) pm.bet{value: noWei}(i, false);
            seeded++;
            console2.log("  seeded market", i);
        }
        vm.stopBroadcast();

        console2.log("Seeded liquidity into markets:", seeded);
        console2.log("Total ETH staked (wei):", seeded * (yesWei + noWei));
    }
}
