// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerpEngine} from "../../src/PerpEngine.sol";
import {LiquidityPool} from "../../src/LiquidityPool.sol";
import {FeeManager} from "../../src/FeeManager.sol";
import {PushPriceOracle} from "../../src/PushPriceOracle.sol";

/// @notice Drives randomized sequences of protocol actions for the invariant tests. Every action
///         refreshes the oracle (warp +1s, re-sign) so trades don't fail on staleness, and wraps the
///         real call in try/catch so legitimate reverts (slippage, OI cap, healthy, utilization) just
///         skip rather than abort the run. Ghost sums mirror what the engine should hold.
contract Handler is Test {
    PerpEngine internal engine;
    LiquidityPool internal pool;
    FeeManager internal feeManager;
    PushPriceOracle internal oracle;
    uint256 internal gold;
    uint256 internal signerPk;

    address[3] internal actors = [address(0xA1), address(0xA2), address(0xA3)];
    address internal lp = address(0x11);
    address internal liquidator = address(0xB0B0);

    int256 public lastPrice = 2000e8;

    uint256[] public openIds;
    mapping(uint256 => uint256) internal idxOf;
    mapping(uint256 => bool) internal isOpen;
    mapping(uint256 => uint256) internal idCollateral;
    mapping(uint256 => uint256) internal idNotional;
    mapping(uint256 => address) internal idTrader;

    uint256 public gCollateral; // sum of open positions' collateral
    uint256 public gNotional; // sum of open positions' notional

    constructor(
        PerpEngine engine_,
        LiquidityPool pool_,
        FeeManager feeManager_,
        PushPriceOracle oracle_,
        uint256 gold_,
        uint256 signerPk_
    ) {
        engine = engine_;
        pool = pool_;
        feeManager = feeManager_;
        oracle = oracle_;
        gold = gold_;
        signerPk = signerPk_;
    }

    receive() external payable {}

    function _postPrice(int256 p) internal {
        if (p <= 0) p = 1e8;
        vm.warp(block.timestamp + 1);
        uint64 ts = uint64(block.timestamp);
        bytes32 digest = oracle.priceDigest(gold, p, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        oracle.postPrice(gold, p, ts, abi.encodePacked(r, s, v));
        lastPrice = p;
    }

    function _remove(uint256 id) internal {
        gCollateral -= idCollateral[id];
        gNotional -= idNotional[id];
        uint256 i = idxOf[id];
        uint256 lastId = openIds[openIds.length - 1];
        openIds[i] = lastId;
        idxOf[lastId] = i;
        openIds.pop();
        delete isOpen[id];
        delete idCollateral[id];
        delete idNotional[id];
        delete idTrader[id];
    }

    function deposit(uint256 amtSeed) external {
        _postPrice(lastPrice);
        uint256 amt = bound(amtSeed, 0.1 ether, 100 ether);
        vm.deal(lp, lp.balance + amt);
        vm.prank(lp);
        pool.deposit{value: amt}();
    }

    function withdraw(uint256 seed) external {
        _postPrice(lastPrice);
        uint256 sh = pool.shares(lp);
        if (sh == 0) return;
        uint256 amt = bound(seed, 1, sh);
        vm.prank(lp);
        try pool.withdraw(amt) {} catch {}
    }

    function open(uint256 marginSeed, uint256 levSeed, bool isLong) external {
        _postPrice(lastPrice);
        uint256 margin = bound(marginSeed, 0.01 ether, 5 ether);
        uint16 lev = uint16(bound(levSeed, 1, 20));
        address actor = actors[marginSeed % 3];
        vm.deal(actor, actor.balance + margin);
        vm.prank(actor);
        try engine.openPosition{value: margin}(gold, isLong, lev, 0) returns (uint256 id) {
            PerpEngine.Position memory pos = engine.getPosition(id);
            idCollateral[id] = pos.collateral;
            idNotional[id] = pos.sizeEth;
            idTrader[id] = actor;
            idxOf[id] = openIds.length;
            isOpen[id] = true;
            openIds.push(id);
            gCollateral += pos.collateral;
            gNotional += pos.sizeEth;
        } catch {}
    }

    function close(uint256 seed) external {
        _postPrice(lastPrice);
        if (openIds.length == 0) return;
        uint256 id = openIds[bound(seed, 0, openIds.length - 1)];
        vm.prank(idTrader[id]);
        try engine.closePosition(id, 0) {
            _remove(id);
        } catch {}
    }

    function liquidate(uint256 seed) external {
        _postPrice(lastPrice);
        if (openIds.length == 0) return;
        uint256 id = openIds[bound(seed, 0, openIds.length - 1)];
        vm.prank(liquidator);
        try engine.liquidate(id) {
            _remove(id);
        } catch {}
    }

    function movePrice(uint256 pSeed) external {
        uint256 factorBps = bound(pSeed, 7000, 13000); // -30%..+30% of current
        _postPrice((lastPrice * int256(factorBps)) / 10000);
    }

    function fundInsurance(uint256 amtSeed) external {
        uint256 amt = bound(amtSeed, 0.01 ether, 10 ether);
        vm.deal(address(this), address(this).balance + amt);
        engine.depositInsurance{value: amt}();
    }

    /// FeeManager liabilities that must equal its ETH balance.
    function feeLiabilities() external view returns (uint256 total) {
        total = feeManager.commodityBucket(gold) + feeManager.protocolFees();
        for (uint256 i = 0; i < actors.length; i++) {
            total += feeManager.withdrawable(actors[i]);
        }
        total += feeManager.withdrawable(lp) + feeManager.withdrawable(liquidator);
    }
}
