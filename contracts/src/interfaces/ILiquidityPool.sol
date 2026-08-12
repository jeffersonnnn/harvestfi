// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILiquidityPool
/// @notice Shared counterparty pool for all perp positions. LPs deposit native ETH.
interface ILiquidityPool {
    /// @notice Total ETH assets backing LP shares.
    function totalAssets() external view returns (uint256);

    /// @notice Pay trader profit out of the pool. Only callable by the perp engine.
    function payTraderProfit(address to, uint256 amount) external;

    /// @notice Receive trader losses into the pool. Only callable by the perp engine.
    function receiveLoss() external payable;
}
