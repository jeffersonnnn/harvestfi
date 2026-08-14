// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StrategyVault, IPerpEngine} from "../src/StrategyVault.sol";

// --- minimal mocks ---

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// PerpEngine mock: holds collateral on open, pays collateral+pnl on close, settable PnL.
contract MockPerp {
    struct P {
        address trader;
        uint256 collateral;
        bool open;
    }

    mapping(uint256 => P) public pos;
    mapping(uint256 => int256) public pnl;
    uint256 public nextId = 1;

    function openPosition(uint256, bool, uint16, uint256) external payable returns (uint256 id) {
        id = nextId++;
        pos[id] = P(msg.sender, msg.value, true);
    }

    function setPnl(uint256 id, int256 v) external {
        pnl[id] = v;
    }

    function unrealizedPnl(uint256 id) external view returns (int256) {
        return pnl[id];
    }

    function getPosition(uint256 id) external view returns (IPerpEngine.Position memory p) {
        p.trader = pos[id].trader;
        p.collateral = pos[id].collateral;
        p.isLong = true;
    }

    function closePosition(uint256 id, uint256) external {
        P storage p = pos[id];
        require(p.trader == msg.sender, "not trader");
        require(p.open, "closed");
        int256 payout = int256(p.collateral) + pnl[id];
        if (payout < 0) payout = 0;
        p.open = false;
        (bool ok,) = payable(msg.sender).call{value: uint256(payout)}("");
        require(ok, "pay");
    }

    function withdraw() external pure returns (uint256) {
        revert("nothing"); // no owed residual in the mock (tests the try/catch)
    }

    receive() external payable {}
}

/// Beneficiary vault mock: claim() pays queued ETH fees to the caller (the strategy vault).
contract MockBenef {
    address public strat;
    uint256 public fees;

    function setup(address s) external {
        strat = s;
    }

    function fund() external payable {
        fees += msg.value;
    }

    function ownerOf(uint256) external view returns (address) {
        return strat;
    }

    function claim(uint256, uint256, uint256) external {
        uint256 f = fees;
        fees = 0;
        (bool ok,) = payable(msg.sender).call{value: f}("");
        require(ok, "claim");
    }
}

/// UniversalRouter mock: execute() mints `token` to the caller proportional to ETH in.
contract MockRouter {
    MockERC20 public token;
    uint256 public rate; // tokens (wei) per wei of ETH

    constructor(MockERC20 t, uint256 r) {
        token = t;
        rate = r;
    }

    function execute(bytes calldata, bytes[] calldata, uint256) external payable {
        token.mint(msg.sender, msg.value * rate);
    }
}

/// StateView mock: fixed spot price (sqrtPriceX96). Q96 => 1 token per ETH.
contract MockStateView {
    uint160 public sqrtP;

    constructor(uint160 s) {
        sqrtP = s;
    }

    function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24) {
        return (sqrtP, int24(0), uint24(0), uint24(0));
    }
}

contract StrategyVaultTest is Test {
    MockERC20 internal token;
    MockPerp internal perp;
    MockBenef internal benef;
    MockRouter internal router;
    MockStateView internal sv;
    StrategyVault internal vault;

    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant THRESH = 0.01 ether;

    function setUp() public {
        token = new MockERC20();
        perp = new MockPerp();
        benef = new MockBenef();
        router = new MockRouter(token, 1); // 1 token-wei per wei ETH
        sv = new MockStateView(uint160(1 << 96)); // spot = 1 token per ETH

        vault = new StrategyVault(
            StrategyVault.Config({
                perpEngine: address(perp),
                beneficiaryVault: address(benef),
                router: address(router),
                stateView: address(sv),
                token: address(token),
                positionNftId: 1,
                marketId: 0,
                isLong: true,
                leverageX: 5,
                openThresholdWei: THRESH,
                takeProfitBps: 10000, // +100% (2x)
                stopLossBps: 5000, // -50%
                bountyBps: 2000, // 20% caller bounty
                maxSlippageBps: 800 // 8%
            })
        );
        benef.setup(address(vault));
        vm.deal(address(perp), 100 ether); // perp can pay profits
    }

    receive() external payable {} // accept the crank bounty

    function _harvest(uint256 amount) internal {
        benef.fund{value: amount}();
        vault.harvest();
    }

    function test_harvest_pullsFees() public {
        _harvest(0.02 ether);
        assertEq(vault.pot(), 0.02 ether);
    }

    function test_open_movesCollateralToPerp() public {
        _harvest(0.02 ether);
        vault.open(0);
        assertEq(vault.openPositionId(), 1);
        assertEq(vault.pot(), 0); // collateral moved to the perp
        assertEq(address(perp).balance, 100 ether + 0.02 ether);
    }

    function test_revert_open_belowThreshold() public {
        _harvest(0.005 ether);
        vm.expectRevert("below threshold");
        vault.open(0);
    }

    function test_revert_open_alreadyOpen() public {
        _harvest(0.02 ether);
        vault.open(0);
        _harvest(0.02 ether);
        vm.expectRevert("position open");
        vault.open(0);
    }

    function test_revert_manage_notAtTarget() public {
        _harvest(0.02 ether);
        vault.open(0);
        perp.setPnl(1, 0.001 ether); // small profit, below take-profit
        vm.expectRevert("not at target");
        vault.manage(0);
    }

    function test_manage_takeProfit_buysAndBurns() public {
        _harvest(0.02 ether);
        vault.open(0);
        perp.setPnl(1, 0.02 ether); // +100% = take-profit hit

        uint256 callerBefore = address(this).balance;
        vault.manage(0);

        // position closed, payout = 0.04; spend = 80%, bounty = 20%
        assertEq(vault.openPositionId(), 0);
        assertEq(vault.cycles(), 1);
        uint256 spend = (0.04 ether * 8000) / 10000;
        assertEq(token.balanceOf(DEAD), spend); // burned
        assertEq(vault.totalBurned(), spend);
        assertEq(address(this).balance - callerBefore, 0.04 ether - spend); // bounty
        assertEq(vault.pot(), 0); // fully deployed
    }

    function test_manage_stopLoss_closesAndBurns() public {
        _harvest(0.02 ether);
        vault.open(0);
        perp.setPnl(1, -0.01 ether); // -50% = stop-loss hit

        vault.manage(0);
        assertEq(vault.openPositionId(), 0);
        // payout = 0.02 - 0.01 = 0.01; still buys + burns the remainder
        uint256 spend = (0.01 ether * 8000) / 10000;
        assertEq(token.balanceOf(DEAD), spend);
        assertEq(vault.cycles(), 1);
    }

    function test_fullCycle_repeats() public {
        // cycle 1
        _harvest(0.02 ether);
        vault.open(0);
        perp.setPnl(1, 0.02 ether);
        vault.manage(0);
        // cycle 2
        _harvest(0.02 ether);
        vault.open(0);
        assertEq(vault.openPositionId(), 2);
        perp.setPnl(2, 0.02 ether);
        vault.manage(0);
        assertEq(vault.cycles(), 2);
        assertGt(vault.totalBurned(), 0);
    }
}
