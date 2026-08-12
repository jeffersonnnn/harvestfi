// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPerpEngine
/// @notice Minimal surface the liquidity pool needs from the engine to enforce its utilization guard.
interface IPerpEngine {
    /// @notice Total open notional the pool must keep reserved to back open positions.
    function lockedForPnl() external view returns (uint256);
}
