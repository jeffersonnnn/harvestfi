// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";

/// Lists the 17 Energy markets onto an existing registry (ids 51-67, appended after the 51 farm +
/// industrial markets). Order MUST match keeper `commodities.ts` ids 51-67 so on-chain ids line up.
/// Run: REGISTRY_ADDRESS=0x.. forge script script/ListEnergy.s.sol --rpc-url <rpc> --broadcast --private-key <owner> --slow
contract ListEnergy is Script {
    function run() external {
        CommodityRegistry registry = CommodityRegistry(vm.envAddress("REGISTRY_ADDRESS"));
        vm.startBroadcast();
        _list(registry, "CRUDE_OIL", "Bbl"); // 51 - WTI
        _list(registry, "BRENT_CRUDE", "Bbl"); // 52
        _list(registry, "NATURAL_GAS", "MMBtu"); // 53 - US Henry Hub
        _list(registry, "GASOLINE", "Gal"); // 54 - RBOB
        _list(registry, "HEATING_OIL", "Gal"); // 55
        _list(registry, "GASOIL", "T"); // 56 - ICE low-sulphur gasoil
        _list(registry, "TTF_GAS", "MWh"); // 57 - EU natural gas
        _list(registry, "UK_GAS", "thm"); // 58
        _list(registry, "ETHANOL", "Gal"); // 59
        _list(registry, "NAPHTHA", "T"); // 60
        _list(registry, "PROPANE", "Gal"); // 61
        _list(registry, "CARBON_EU", "T"); // 62 - EU ETS permits
        _list(registry, "LNG_JKM", "MMBtu"); // 63 - Japan/Korea marker
        _list(registry, "METHANOL", "T"); // 64
        _list(registry, "POWER_DE", "MWh"); // 65 - German baseload electricity
        _list(registry, "POWER_FR", "MWh"); // 66 - French baseload electricity
        _list(registry, "BITUMEN", "T"); // 67
        vm.stopBroadcast();
    }

    function _list(CommodityRegistry registry, string memory symbol, string memory unit) internal {
        registry.list(
            symbol,
            unit,
            "USD",
            "Energy",
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
