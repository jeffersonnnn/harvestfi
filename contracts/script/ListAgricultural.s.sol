// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";

/// Lists the remaining 16 agricultural markets (beyond the 7 launch fighters) onto an existing
/// registry. Order MUST match keeper `commodities.ts` ids 13-28 so on-chain ids line up.
/// Run: REGISTRY_ADDRESS=0x.. forge script script/ListAgricultural.s.sol --rpc-url <rpc> --broadcast --private-key <owner>
contract ListAgricultural is Script {
    function run() external {
        CommodityRegistry registry = CommodityRegistry(vm.envAddress("REGISTRY_ADDRESS"));
        vm.startBroadcast();
        _list(registry, "OAT", "Bu"); // 13
        _list(registry, "ORANGE_JUICE", "Lbs"); // 14
        _list(registry, "CHEESE", "Lbs"); // 15
        _list(registry, "COCOA", "T"); // 16
        _list(registry, "LUMBER", "board-ft"); // 17
        _list(registry, "MILK", "cwt"); // 18
        _list(registry, "RUBBER", "Kg"); // 19
        _list(registry, "BUTTER", "T"); // 20
        _list(registry, "POTATOES", "100kg"); // 21
        _list(registry, "RAPESEED", "T"); // 22
        _list(registry, "CANOLA", "T"); // 23
        _list(registry, "BARLEY", "T"); // 24
        _list(registry, "SUNFLOWER_OIL", "10kg"); // 25
        _list(registry, "TEA", "Kg"); // 26
        _list(registry, "PALM_OIL", "T"); // 27
        _list(registry, "WOOL", "100kg"); // 28
        vm.stopBroadcast();
    }

    function _list(CommodityRegistry registry, string memory symbol, string memory unit) internal {
        registry.list(
            symbol,
            unit,
            "USD",
            "Agricultural",
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
