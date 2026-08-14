// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StrategyVault, IERC20Min} from "../src/StrategyVault.sol";

/// Exposes the internal buy-and-burn for the fork test.
contract StrategyVaultHarness is StrategyVault {
    constructor(StrategyVault.Config memory c) StrategyVault(c) {}

    function crankBuyBurn() external {
        _buyAndBurn(msg.sender);
    }
}

/// Fork test: the buy-and-burn swap against the LIVE Uniswap v4 pool + StateView + UniversalRouter on
/// Robinhood Chain (4663). Skipped unless ROBINHOOD_RPC_URL is set. Needs --evm-version cancun because
/// v4 uses transient storage (EIP-1153):
///   ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
///     forge test --match-contract StrategyVaultForkTest --evm-version cancun -vv
contract StrategyVaultForkTest is Test {
    // mainnet 4663
    address constant ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904; // UniversalRouter
    address constant STATE_VIEW = 0xF3334192D15450CdD385c8B70e03f9A6bD9E673b;
    address constant BENEF = 0xd35E9CA72F64C7F93BE30fad67524323396B36D7; // BeneficiaryVault
    address constant PERP = 0x343635C6602169993DA969A1E813093ba19A074a; // PerpEngine
    address constant CORNCOIN = 0x5eFF880E2f4EEB6885d76b5c8a710ec27ee7A9f3; // a live launched coin
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    receive() external payable {} // accept the crank bounty

    function test_fork_buyAndBurn_realPool() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("skipped: set ROBINHOOD_RPC_URL to run the fork test");
            return;
        }
        vm.createSelectFork(rpc);

        StrategyVaultHarness v = new StrategyVaultHarness(
            StrategyVault.Config({
                perpEngine: PERP,
                beneficiaryVault: BENEF,
                router: ROUTER,
                stateView: STATE_VIEW,
                token: CORNCOIN,
                positionNftId: 0,
                marketId: 0,
                isLong: true,
                leverageX: 5,
                openThresholdWei: 0.01 ether,
                takeProfitBps: 10000,
                stopLossBps: 5000,
                bountyBps: 2000,
                maxSlippageBps: 1500 // 15% — thin pool
            })
        );

        // Sanity: poolId derives to the known CornCoin pool.
        assertEq(v.poolId(), 0xd8c000be215e4d7a215c8d6d33fb8ba8a1db9f8acc7f46e392817d9d2413e3c5, "poolId");

        vm.deal(address(v), 0.001 ether);
        uint256 deadBefore = IERC20Min(CORNCOIN).balanceOf(DEAD);
        uint256 mine = address(this).balance;

        v.crankBuyBurn(); // real v4 swap ETH->CornCoin + burn + 20% bounty to us

        uint256 deadAfter = IERC20Min(CORNCOIN).balanceOf(DEAD);
        assertGt(deadAfter, deadBefore, "burned CornCoin on the real pool");
        assertGt(address(this).balance, mine, "caller got the bounty");
        assertEq(address(v).balance, 0, "pot fully spent");
        emit log_named_uint("CornCoin burned (wei)", deadAfter - deadBefore);
    }
}
