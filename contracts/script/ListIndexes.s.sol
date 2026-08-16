// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";

/// Lists the 3 synthetic INDEX markets onto an existing registry (ids 68-70, appended after the 68
/// farm + industrial + energy markets). Order MUST match keeper `commodities.ts` ids 68-70 so on-chain
/// ids line up. Each index is a basket the keeper DERIVES from its constituent leaf prices (equal
/// weight, rebased to 100) and posts like any other market; perps + predictions read it by id.
/// Run: REGISTRY_ADDRESS=0x.. forge script script/ListIndexes.s.sol --rpc-url <rpc> --broadcast --private-key <owner> --slow
contract ListIndexes is Script {
    function run() external {
        CommodityRegistry registry = CommodityRegistry(vm.envAddress("REGISTRY_ADDRESS"));
        vm.startBroadcast();
        _list(registry, "ENERGY_INDEX"); // 68 - CRUDE + BRENT + NATGAS + GASOLINE + HEATING OIL
        _list(registry, "METALS_INDEX"); // 69 - COPPER + ALUMINUM + ZINC + NICKEL + PALLADIUM
        _list(registry, "GRAIN_INDEX"); // 70 - CORN + WHEAT + SOYBEANS + SUGAR + COFFEE + COTTON
        vm.stopBroadcast();
    }

    function _list(CommodityRegistry registry, string memory symbol) internal {
        registry.list(
            symbol,
            "idx", // an index level, not a physical unit
            "USD",
            "Index",
            CommodityRegistry.RiskParams({
                maxLeverageX: 10,
                maintenanceMarginBps: 500,
                openFeeBps: 5,
                closeFeeBps: 5,
                maxOpenInterestEth: 300 ether
            })
        );
    }
}
