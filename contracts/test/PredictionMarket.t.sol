// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OracleSigner} from "./helpers/OracleSigner.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";
import {PushPriceOracle} from "../src/PushPriceOracle.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract PredictionMarketTest is OracleSigner {
    CommodityRegistry internal registry;
    PushPriceOracle internal oracle;
    PredictionMarket internal pm;

    uint256 internal signerPk = 0xBEEF;
    address internal signer;
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint64 internal constant MAX_AGE = 1 hours;
    uint96 internal constant FEE_BPS = 250; // 2.5%
    uint256 internal cornId;

    function setUp() public {
        signer = vm.addr(signerPk);
        vm.warp(1_000_000);

        registry = new CommodityRegistry(address(this));
        oracle = new PushPriceOracle(address(this), signer, MAX_AGE);
        pm = new PredictionMarket(address(oracle), address(registry), address(this), treasury, FEE_BPS);

        cornId = registry.list(
            "CORN",
            "Bu",
            "USD",
            "Agricultural",
            CommodityRegistry.RiskParams({
                maxLeverageX: 10,
                maintenanceMarginBps: 500,
                openFeeBps: 10,
                closeFeeBps: 10,
                maxOpenInterestEth: 0
            })
        );

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ------------------------- helpers ------------------------- //

    function _postAt(uint256 id, int256 priceE8, uint64 ts) internal {
        bytes memory sig = _signPrice(oracle, signerPk, id, priceE8, ts);
        oracle.postPrice(id, priceE8, ts, sig);
    }

    function _newMarket(uint256 thresholdE8, bool isAbove, uint64 dt) internal returns (uint256 id) {
        return pm.createMarket(cornId, thresholdE8, uint64(block.timestamp) + dt, isAbove);
    }

    function _bet(address who, uint256 mid, bool isYes, uint256 amt) internal {
        vm.prank(who);
        pm.bet{value: amt}(mid, isYes);
    }

    // ------------------------- create ------------------------- //

    function test_createMarket() public {
        uint64 exp = uint64(block.timestamp) + 1 days;
        uint256 mid = pm.createMarket(cornId, 5_00000000, exp, true);
        assertEq(mid, 0);
        assertEq(pm.marketCount(), 1);
        PredictionMarket.Market memory m = pm.getMarket(mid);
        assertEq(m.commodityId, cornId);
        assertEq(m.thresholdE8, 5_00000000);
        assertEq(m.expiry, exp);
        assertTrue(m.isAbove);
        assertEq(uint256(m.status), uint256(PredictionMarket.Status.Open));
        assertEq(m.creator, address(this));
    }

    function test_revert_createUnlistedCommodity() public {
        vm.expectRevert("commodity not listed");
        pm.createMarket(999, 5_00000000, uint64(block.timestamp) + 1 days, true);
    }

    function test_revert_createThresholdZero() public {
        vm.expectRevert("threshold=0");
        pm.createMarket(cornId, 0, uint64(block.timestamp) + 1 days, true);
    }

    function test_revert_createExpiryTooSoon() public {
        vm.expectRevert("expiry too soon");
        pm.createMarket(cornId, 5_00000000, uint64(block.timestamp) + 10, true);
    }

    function test_revert_createExpiryTooFar() public {
        vm.expectRevert("expiry too far");
        pm.createMarket(cornId, 5_00000000, uint64(block.timestamp) + 400 days, true);
    }

    function test_revert_createNotOwnerWhenGated() public {
        vm.prank(alice);
        vm.expectRevert("not allowed");
        pm.createMarket(cornId, 5_00000000, uint64(block.timestamp) + 1 days, true);
    }

    function test_permissionlessCreation() public {
        pm.setPermissionlessCreation(true);
        vm.prank(alice);
        uint256 mid = pm.createMarket(cornId, 5_00000000, uint64(block.timestamp) + 1 days, true);
        PredictionMarket.Market memory m = pm.getMarket(mid);
        assertEq(m.creator, alice);
    }

    // ------------------------- bet ------------------------- //

    function test_bet_poolsAndOdds() public {
        uint256 mid = _newMarket(5_00000000, true, 1 days);
        _bet(alice, mid, true, 3 ether);
        _bet(bob, mid, false, 1 ether);
        _bet(carol, mid, true, 1 ether);

        PredictionMarket.Market memory m = pm.getMarket(mid);
        assertEq(m.yesPool, 4 ether);
        assertEq(m.noPool, 1 ether);
        assertEq(pm.yesStake(mid, alice), 3 ether);
        assertEq(pm.yesStake(mid, carol), 1 ether);
        assertEq(pm.noStake(mid, bob), 1 ether);

        (uint256 yesBps, uint256 noBps) = pm.odds(mid);
        assertEq(yesBps, 8000); // 4/5
        assertEq(noBps, 2000);
    }

    function test_odds_zeroBeforeBets() public {
        uint256 mid = _newMarket(5_00000000, true, 1 days);
        (uint256 yesBps, uint256 noBps) = pm.odds(mid);
        assertEq(yesBps, 0);
        assertEq(noBps, 0);
    }

    function test_revert_betAfterExpiry() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(alice);
        vm.expectRevert("betting closed");
        pm.bet{value: 1 ether}(mid, true);
    }

    function test_revert_betBelowMin() public {
        pm.setParams(0.01 ether, 5 minutes, 365 days, 1 hours);
        uint256 mid = _newMarket(5_00000000, true, 1 days);
        vm.prank(alice);
        vm.expectRevert("below min bet");
        pm.bet{value: 0.001 ether}(mid, true);
    }

    function test_revert_betZero() public {
        uint256 mid = _newMarket(5_00000000, true, 1 days);
        vm.prank(alice);
        vm.expectRevert("below min bet");
        pm.bet{value: 0}(mid, true);
    }

    // ------------------------- resolve + claim ------------------------- //

    // YES = "price above $5.00". Corn settles at $5.14 -> YES wins.
    function test_resolveAbove_yesWins_payouts() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 2 ether); // YES
        _bet(carol, mid, true, 1 ether); // YES  (yesPool = 3)
        _bet(bob, mid, false, 1 ether); // NO   (noPool = 1)

        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1); // post-expiry print above threshold

        pm.resolve(mid);
        PredictionMarket.Market memory m = pm.getMarket(mid);
        assertEq(uint256(m.status), uint256(PredictionMarket.Status.Resolved));
        assertTrue(m.outcomeYes);
        assertEq(m.resolvedPrice, 5_14000000);

        // fee = 1 ether * 2.5% = 0.025; netLosing = 0.975; winnerPool = 3
        assertEq(pm.proceeds(treasury), 0.025 ether);
        // alice: 2 + 2*0.975/3 = 2.65 ; carol: 1 + 0.975/3 = 1.325
        assertEq(pm.claimable(mid, alice), 2.65 ether);
        assertEq(pm.claimable(mid, carol), 1.325 ether);
        assertEq(pm.claimable(mid, bob), 0); // loser

        uint256 aBefore = alice.balance;
        vm.prank(alice);
        pm.claim(mid);
        assertEq(alice.balance - aBefore, 2.65 ether);

        uint256 cBefore = carol.balance;
        vm.prank(carol);
        pm.claim(mid);
        assertEq(carol.balance - cBefore, 1.325 ether);

        // conservation: winners (2.65 + 1.325) + treasury fee (0.025) == total staked (4).
        // The pool holds only the unwithdrawn treasury fee now that both winners have claimed.
        assertEq(address(pm).balance, 0.025 ether);
    }

    // YES = "price above $5.00". Corn settles at $4.80 -> NO wins.
    function test_resolveAbove_noWins() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether); // YES loses
        _bet(bob, mid, false, 1 ether); // NO wins

        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 4_80000000, exp + 1);
        pm.resolve(mid);

        PredictionMarket.Market memory m = pm.getMarket(mid);
        assertFalse(m.outcomeYes);
        // NO pool = 1, YES(losing) = 1, fee 0.025, netLosing 0.975 -> bob gets 1.975
        assertEq(pm.claimable(mid, bob), 1.975 ether);
        assertEq(pm.claimable(mid, alice), 0);
    }

    // Below-market: YES = "price below $5.00". Settles at $4.80 -> YES wins.
    function test_resolveBelow_yesWins() public {
        uint256 mid = _newMarket(5_00000000, false, 1 hours);
        _bet(alice, mid, true, 1 ether); // YES (below) wins
        _bet(bob, mid, false, 1 ether); // NO loses

        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 4_80000000, exp + 1);
        pm.resolve(mid);

        assertTrue(pm.getMarket(mid).outcomeYes);
        assertEq(pm.claimable(mid, alice), 1.975 ether);
    }

    // Equality resolves as NO for an "above" market (YES is strict >).
    function test_resolve_equalityIsNo() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 1 ether);

        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_00000000, exp + 1); // exactly at threshold
        pm.resolve(mid);
        assertFalse(pm.getMarket(mid).outcomeYes); // NO wins
    }

    function test_revert_resolveNotExpired() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        vm.expectRevert("not expired");
        pm.resolve(mid);
    }

    function test_revert_resolveNoPostExpiryPrice() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 1 ether);

        // a price exists, but it predates expiry
        _postAt(cornId, 5_10000000, uint64(block.timestamp));
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        vm.expectRevert("no post-expiry price");
        pm.resolve(mid);
    }

    function test_revert_doubleResolve() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 1 ether);
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1);
        pm.resolve(mid);
        vm.expectRevert("not open");
        pm.resolve(mid);
    }

    // Winning side drew zero stake -> auto-cancel, everyone refunds.
    function test_resolve_winnerSideEmpty_cancels() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(bob, mid, false, 2 ether); // only NO has money
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1); // YES wins, but nobody bet YES
        pm.resolve(mid);

        assertEq(uint256(pm.getMarket(mid).status), uint256(PredictionMarket.Status.Cancelled));
        assertEq(pm.claimable(mid, bob), 2 ether); // full refund
        assertEq(pm.proceeds(treasury), 0);

        uint256 bBefore = bob.balance;
        vm.prank(bob);
        pm.claim(mid);
        assertEq(bob.balance - bBefore, 2 ether);
    }

    function test_revert_loserClaim() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 1 ether);
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1);
        pm.resolve(mid);

        vm.prank(bob); // NO lost
        vm.expectRevert("nothing to claim");
        pm.claim(mid);
    }

    function test_revert_doubleClaim() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 1 ether);
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1);
        pm.resolve(mid);

        vm.prank(alice);
        pm.claim(mid);
        vm.prank(alice);
        vm.expectRevert("already claimed");
        pm.claim(mid);
    }

    function test_revert_claimBeforeSettled() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        vm.prank(alice);
        vm.expectRevert("not settled");
        pm.claim(mid);
    }

    // ------------------------- cancel ------------------------- //

    function test_cancel_afterGraceNoPrice_refunds() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 2 ether);

        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1 hours + 1); // past expiry + grace, no post-expiry price ever posted
        pm.cancel(mid);
        assertEq(uint256(pm.getMarket(mid).status), uint256(PredictionMarket.Status.Cancelled));

        assertEq(pm.claimable(mid, alice), 1 ether);
        assertEq(pm.claimable(mid, bob), 2 ether);
    }

    function test_revert_cancelBeforeGrace() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        vm.expectRevert("grace not passed");
        pm.cancel(mid);
    }

    function test_revert_cancelWhenResolvable() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 1 ether);
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1 hours + 1);
        _postAt(cornId, 5_14000000, uint64(block.timestamp)); // fresh post-expiry price exists
        vm.expectRevert("resolvable");
        pm.cancel(mid);
    }

    // ------------------------- pause / admin ------------------------- //

    function test_pause_blocksBetAndCreate_claimWorks() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 1 ether);
        _bet(bob, mid, false, 1 ether);

        pm.pause();
        vm.prank(alice);
        vm.expectRevert(); // Pausable: paused
        pm.bet{value: 1 ether}(mid, true);
        vm.expectRevert();
        pm.createMarket(cornId, 5_00000000, uint64(block.timestamp) + 1 days, true);

        // resolve + claim remain available while paused
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1);
        pm.resolve(mid);
        vm.prank(alice);
        pm.claim(mid);
    }

    function test_guardianCanPause_ownerUnpauses() public {
        address guardian = makeAddr("guardian");
        pm.setGuardian(guardian);
        vm.prank(guardian);
        pm.pause();
        assertTrue(pm.paused());

        vm.prank(guardian);
        vm.expectRevert(); // only owner unpauses
        pm.unpause();
        pm.unpause();
        assertFalse(pm.paused());
    }

    function test_revert_pauseNotGuardian() public {
        vm.prank(alice);
        vm.expectRevert("not guardian");
        pm.pause();
    }

    function test_revert_feeTooHighConstructor() public {
        vm.expectRevert("fee too high");
        new PredictionMarket(address(oracle), address(registry), address(this), treasury, 501);
    }

    function test_revert_setFeeTooHigh() public {
        vm.expectRevert("fee too high");
        pm.setFeeBps(501);
    }

    function test_setParams_and_getters() public {
        pm.setParams(0.02 ether, 10 minutes, 30 days, 2 hours);
        assertEq(pm.minBet(), 0.02 ether);
        assertEq(pm.minDuration(), 10 minutes);
        assertEq(pm.maxDuration(), 30 days);
        assertEq(pm.resolveGracePeriod(), 2 hours);
    }

    function test_revert_setParamsBadDurations() public {
        vm.expectRevert("bad durations");
        pm.setParams(0, 30 days, 10 days, 1 hours); // max < min
    }

    function test_treasuryWithdraws() public {
        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        _bet(alice, mid, true, 2 ether);
        _bet(bob, mid, false, 1 ether);
        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1);
        pm.resolve(mid);

        assertEq(pm.proceeds(treasury), 0.025 ether);
        uint256 tBefore = treasury.balance;
        vm.prank(treasury);
        pm.withdrawProceeds();
        assertEq(treasury.balance - tBefore, 0.025 ether);
    }

    // ------------------------- reentrancy ------------------------- //

    function test_reentrantClaim_cannotDrain() public {
        Reentrant attacker = new Reentrant(pm);
        vm.deal(address(attacker), 10 ether);

        uint256 mid = _newMarket(5_00000000, true, 1 hours);
        attacker.betYes(mid, 2 ether); // attacker YES, from its own balance
        _bet(bob, mid, false, 1 ether); // NO loses

        uint64 exp = pm.getMarket(mid).expiry;
        vm.warp(exp + 1);
        _postAt(cornId, 5_14000000, exp + 1);
        pm.resolve(mid);

        // entitlement: 2 + 2*0.975/2 = 2.975 (winnerPool == attacker's 2)
        uint256 entitled = pm.claimable(mid, address(attacker));
        assertEq(entitled, 2.975 ether);

        attacker.claim(mid); // its receive() tries to re-enter; nonReentrant blocks it
        assertEq(address(attacker).balance, 10.975 ether); // 10 - 2 staked + 2.975 payout, no double
        assertEq(address(pm).balance, 0.025 ether); // only the treasury fee remains
    }
}

/// @notice Tries to re-enter claim from its receive hook; the guard must stop a second payout.
contract Reentrant {
    PredictionMarket public pm;
    uint256 public target;

    constructor(PredictionMarket pm_) {
        pm = pm_;
    }

    function betYes(uint256 mid, uint256 amt) external {
        pm.bet{value: amt}(mid, true);
    }

    function claim(uint256 mid) external {
        target = mid;
        pm.claim(mid);
    }

    receive() external payable {
        try pm.claim(target) {} catch {}
    }
}
