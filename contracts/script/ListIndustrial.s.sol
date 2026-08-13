// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";

/// Lists the 28 Industrial markets onto an existing registry. Order MUST match keeper
/// `commodities.ts` ids 23-50 so on-chain ids line up.
/// Run: REGISTRY_ADDRESS=0x.. forge script script/ListIndustrial.s.sol --rpc-url <rpc> --broadcast --private-key <owner> --slow
contract ListIndustrial is Script {
    function run() external {
        CommodityRegistry registry = CommodityRegistry(vm.envAddress("REGISTRY_ADDRESS"));
        vm.startBroadcast();
        _list(registry, "STEEL", "T"); // 23
        _list(registry, "STEEL_REBAR", "T"); // 24
        _list(registry, "HRC_STEEL", "T"); // 25
        _list(registry, "IRON_ORE", "T"); // 26
        _list(registry, "COPPER", "T"); // 27
        _list(registry, "ALUMINUM", "T"); // 28
        _list(registry, "ZINC", "T"); // 29
        _list(registry, "NICKEL", "T"); // 30
        _list(registry, "LEAD", "T"); // 31
        _list(registry, "TIN", "T"); // 32
        _list(registry, "COBALT", "T"); // 33
        _list(registry, "LITHIUM", "T"); // 34
        _list(registry, "MOLYBDENUM", "T"); // 35
        _list(registry, "MANGANESE", "T"); // 36
        _list(registry, "TITANIUM", "T"); // 37
        _list(registry, "MAGNESIUM", "T"); // 38
        _list(registry, "SILICON", "T"); // 39
        _list(registry, "ANTIMONY", "T"); // 40
        _list(registry, "TUNGSTEN", "T"); // 41
        _list(registry, "VANADIUM", "T"); // 42
        _list(registry, "GRAPHITE", "T"); // 43
        _list(registry, "URANIUM", "Lbs"); // 44
        _list(registry, "COAL", "T"); // 45
        _list(registry, "COKING_COAL", "T"); // 46
        _list(registry, "NEODYMIUM", "Kg"); // 47
        _list(registry, "GERMANIUM", "Kg"); // 48
        _list(registry, "GALLIUM", "Kg"); // 49
        _list(registry, "PALLADIUM", "Oz"); // 50
        vm.stopBroadcast();
    }

    function _list(CommodityRegistry registry, string memory symbol, string memory unit) internal {
        registry.list(
            symbol,
            unit,
            "USD",
            "Industrial",
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
