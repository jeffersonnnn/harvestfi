// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPushPriceOracle
/// @notice Price feed for commodities. Prices are USD normalized to 1e8 (Chainlink-style).
interface IPushPriceOracle {
    /// @return price 1e8-scaled USD price (0 if never posted)
    /// @return timestamp source timestamp of the latest price
    function getPrice(uint256 id) external view returns (int256 price, uint64 timestamp);

    /// @notice Returns the latest price as a uint, reverting if it is missing, non-positive or stale.
    function getFreshPrice(uint256 id) external view returns (uint256 price);
}
