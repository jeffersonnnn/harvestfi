// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";
import {PushPriceOracle} from "../src/PushPriceOracle.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {MarketLicenseNFT} from "../src/MarketLicenseNFT.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {PerpEngine} from "../src/PerpEngine.sol";

/// @notice Deploys and wires the full RWA commodity perps system, then lists a starter basket.
///
/// Env:
///   PRIVATE_KEY       deployer key (also default owner/treasury if the others are unset)
///   OWNER             optional protocol owner (defaults to deployer)
///   TREASURY          optional treasury address (defaults to deployer)
///   ORACLE_SIGNER     optional trusted price signer (defaults to deployer)
///
/// Dry run (no broadcast):
///   forge script script/Deploy.s.sol --rpc-url robinhood
/// Broadcast:
///   forge script script/Deploy.s.sol --rpc-url robinhood --broadcast
contract Deploy is Script {
    uint64 internal constant MAX_PRICE_AGE = 1 hours;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address owner = vm.envOr("OWNER", deployer);
        address treasury = vm.envOr("TREASURY", deployer);
        address signer = vm.envOr("ORACLE_SIGNER", deployer);

        vm.startBroadcast(pk);

        CommodityRegistry registry = new CommodityRegistry(owner);
        PushPriceOracle oracle = new PushPriceOracle(owner, signer, MAX_PRICE_AGE);
        FeeManager feeManager = new FeeManager(owner, treasury);
        MarketLicenseNFT nft = new MarketLicenseNFT(owner, address(registry), address(feeManager), treasury);
        LiquidityPool pool = new LiquidityPool(owner);
        PerpEngine engine =
            new PerpEngine(owner, address(registry), address(oracle), address(pool), address(feeManager));

        // One-time wiring (deployer is temporarily owner-equivalent only if owner == deployer;
        // when OWNER differs, run these three from the owner account instead).
        if (owner == deployer) {
            feeManager.setNFT(address(nft));
            feeManager.setPerpEngine(address(engine));
            pool.setPerpEngine(address(engine));
            _seedCommodities(registry);
        }

        vm.stopBroadcast();

        console2.log("CommodityRegistry:", address(registry));
        console2.log("PushPriceOracle:  ", address(oracle));
        console2.log("FeeManager:       ", address(feeManager));
        console2.log("MarketLicenseNFT: ", address(nft));
        console2.log("LiquidityPool:    ", address(pool));
        console2.log("PerpEngine:       ", address(engine));
    }

    /// @dev The market set: all 23 agricultural markets (this is a farm-commodities perp DEX).
    ///      Order MUST match keeper commodities.ts ids 0–22. Lower leverage, OI-capped (thin markets).
    ///      Fighters first (ids 0–6), then the rest. Prices are posted later by the keeper (1e8 USD).
    function _seedCommodities(CommodityRegistry registry) internal {
        // Launch fighters.
        _list(registry, "CORN", "Bu", "Agricultural", 10, 500, 500 ether);
        _list(registry, "WHEAT", "Bu", "Agricultural", 10, 500, 500 ether);
        _list(registry, "RICE", "cwt", "Agricultural", 10, 500, 300 ether);
        _list(registry, "SOYBEANS", "Bu", "Agricultural", 10, 500, 500 ether);
        _list(registry, "COFFEE", "Lbs", "Agricultural", 10, 500, 300 ether);
        _list(registry, "SUGAR", "Lbs", "Agricultural", 10, 500, 300 ether);
        _list(registry, "COTTON", "Lbs", "Agricultural", 10, 500, 300 ether);
        // Rest of agricultural.
        _list(registry, "OAT", "Bu", "Agricultural", 10, 500, 300 ether);
        _list(registry, "ORANGE_JUICE", "Lbs", "Agricultural", 10, 500, 300 ether);
        _list(registry, "CHEESE", "Lbs", "Agricultural", 10, 500, 300 ether);
        _list(registry, "COCOA", "T", "Agricultural", 10, 500, 300 ether);
        _list(registry, "LUMBER", "board-ft", "Agricultural", 10, 500, 300 ether);
        _list(registry, "MILK", "cwt", "Agricultural", 10, 500, 300 ether);
        _list(registry, "RUBBER", "Kg", "Agricultural", 10, 500, 300 ether);
        _list(registry, "BUTTER", "T", "Agricultural", 10, 500, 300 ether);
        _list(registry, "POTATOES", "100kg", "Agricultural", 10, 500, 300 ether);
        _list(registry, "RAPESEED", "T", "Agricultural", 10, 500, 300 ether);
        _list(registry, "CANOLA", "T", "Agricultural", 10, 500, 300 ether);
        _list(registry, "BARLEY", "T", "Agricultural", 10, 500, 300 ether);
        _list(registry, "SUNFLOWER_OIL", "10kg", "Agricultural", 10, 500, 300 ether);
        _list(registry, "TEA", "Kg", "Agricultural", 10, 500, 300 ether);
        _list(registry, "PALM_OIL", "T", "Agricultural", 10, 500, 300 ether);
        _list(registry, "WOOL", "100kg", "Agricultural", 10, 500, 300 ether);
    }

    function _list(
        CommodityRegistry registry,
        string memory symbol,
        string memory unit,
        string memory category,
        uint16 maxLev,
        uint16 mmBps,
        uint256 oiCap
    ) internal {
        registry.list(
            symbol,
            unit,
            "USD",
            category,
            CommodityRegistry.RiskParams({
                maxLeverageX: maxLev,
                maintenanceMarginBps: mmBps,
                openFeeBps: 5, // 0.05% — mid of GMX's ~4-6bps general band (see DECISIONS.md)
                closeFeeBps: 5,
                maxOpenInterestEth: oiCap
            })
        );
    }
}
