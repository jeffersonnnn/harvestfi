// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {MarketLicenseNFT} from "../src/MarketLicenseNFT.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {PerpEngine} from "../src/PerpEngine.sol";

/// @notice License-NFT cascade redeploy. Registry + Oracle SURVIVE (markets + keeper untouched).
///         Deploys new FeeManager -> Pool -> Engine -> NFT (the immutability chain forces all four),
///         wires them, and sets the launch mint price. Run with the keeper PAUSED (shared nonce).
///
/// Env:
///   PRIVATE_KEY     owner/deployer/treasury key (0xA9f2...721b)
///   REGISTRY        existing CommodityRegistry (survives)
///   ORACLE          existing PushPriceOracle (survives)
///   MINT_PRICE_WEI  launch mint price in wei (e.g. 2000000000000000 = 0.002 ETH)
contract CascadeRedeploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        address treasury = owner;
        address registry = vm.envAddress("REGISTRY");
        address oracle = vm.envAddress("ORACLE");
        uint256 mintPriceWei = vm.envUint("MINT_PRICE_WEI");

        vm.startBroadcast(pk);

        FeeManager feeManager = new FeeManager(owner, treasury);
        LiquidityPool pool = new LiquidityPool(owner);
        PerpEngine engine = new PerpEngine(owner, registry, oracle, address(pool), address(feeManager));
        MarketLicenseNFT nft = new MarketLicenseNFT(owner, registry, address(feeManager), treasury);

        // Wiring (owner == deployer, so these run inline).
        feeManager.setNFT(address(nft));
        feeManager.setPerpEngine(address(engine));
        pool.setPerpEngine(address(engine));

        // Launch mint price (settable later for free).
        nft.setMintPrice(mintPriceWei);

        vm.stopBroadcast();

        console2.log("NEW FeeManager:       ", address(feeManager));
        console2.log("NEW LiquidityPool:    ", address(pool));
        console2.log("NEW PerpEngine:       ", address(engine));
        console2.log("NEW MarketLicenseNFT: ", address(nft));
        console2.log("mintPrice (wei):      ", mintPriceWei);
    }
}
