// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OracleSigner} from "./OracleSigner.sol";
import {CommodityRegistry} from "../../src/CommodityRegistry.sol";
import {ICommodityRegistry} from "../../src/interfaces/ICommodityRegistry.sol";
import {PushPriceOracle} from "../../src/PushPriceOracle.sol";
import {FeeManager} from "../../src/FeeManager.sol";
import {MarketLicenseNFT} from "../../src/MarketLicenseNFT.sol";
import {LiquidityPool} from "../../src/LiquidityPool.sol";
import {PerpEngine} from "../../src/PerpEngine.sol";

/// @notice Deploys and wires the full system for engine/integration tests. `owner` is this test
///         contract, so admin calls can be made directly.
abstract contract Base is OracleSigner {
    CommodityRegistry internal registry;
    PushPriceOracle internal oracle;
    FeeManager internal feeManager;
    MarketLicenseNFT internal nft;
    LiquidityPool internal pool;
    PerpEngine internal engine;

    address internal treasury = makeAddr("treasury");
    address internal lp = makeAddr("lp");
    address internal alice = makeAddr("alice"); // trader / license holder
    address internal bob = makeAddr("bob"); // trader / buyer
    address internal keeper = makeAddr("keeper"); // liquidator

    uint256 internal signerPk = 0xBEEF;
    address internal signer;
    uint64 internal constant MAX_AGE = 1 hours;

    function setUp() public virtual {
        signer = vm.addr(signerPk);
        vm.warp(1_000_000); // move off timestamp 0

        registry = new CommodityRegistry(address(this));
        oracle = new PushPriceOracle(address(this), signer, MAX_AGE);
        feeManager = new FeeManager(address(this), treasury);
        nft = new MarketLicenseNFT(address(this), address(registry), address(feeManager), treasury);
        pool = new LiquidityPool(address(this));
        engine = new PerpEngine(address(this), address(registry), address(oracle), address(pool), address(feeManager));

        feeManager.setNFT(address(nft));
        feeManager.setPerpEngine(address(engine));
        pool.setPerpEngine(address(engine));

        vm.deal(lp, 1_000 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _listDefault(string memory symbol, string memory category, uint16 maxLev, uint16 mmBps)
        internal
        returns (uint256 id)
    {
        return registry.list(
            symbol,
            "unit",
            "USD",
            category,
            CommodityRegistry.RiskParams({
                maxLeverageX: maxLev,
                maintenanceMarginBps: mmBps,
                openFeeBps: 10,
                closeFeeBps: 10,
                maxOpenInterestEth: 0
            })
        );
    }

    /// @notice Post a price for `id`. Advances time 1s first so successive posts are monotonic.
    function _post(uint256 id, int256 priceE8) internal {
        vm.warp(block.timestamp + 1);
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _signPrice(oracle, signerPk, id, priceE8, ts);
        oracle.postPrice(id, priceE8, ts, sig);
    }

    /// @notice Fund the shared liquidity pool from the LP account.
    function _fundPool(uint256 amount) internal {
        vm.prank(lp);
        pool.deposit{value: amount}();
    }
}
