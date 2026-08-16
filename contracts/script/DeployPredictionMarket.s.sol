// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Deploy a standalone PredictionMarket wired to the EXISTING oracle + registry (both survive).
///         Parimutuel, oracle-resolved commodity-price binaries. Owner-only creation by default
///         (`permissionlessCreation` stays false until legal clears public launch).
///
/// Env:
///   PRIVATE_KEY   owner/deployer/treasury key
///   ORACLE        existing PushPriceOracle
///   REGISTRY      existing CommodityRegistry
///   FEE_BPS       protocol fee in bps (optional; default 250 = 2.5%, cap 500)
contract DeployPredictionMarket is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        address treasury = owner;
        address oracle = vm.envAddress("ORACLE");
        address registry = vm.envAddress("REGISTRY");
        uint96 feeBps = uint96(vm.envOr("FEE_BPS", uint256(250)));

        vm.startBroadcast(pk);
        PredictionMarket pm = new PredictionMarket(oracle, registry, owner, treasury, feeBps);
        vm.stopBroadcast();

        console2.log("PredictionMarket:", address(pm));
        console2.log("oracle:", oracle);
        console2.log("registry:", registry);
        console2.log("owner/treasury:", owner);
        console2.log("feeBps:", feeBps);
    }
}
