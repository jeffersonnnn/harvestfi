// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFeeManager
/// @notice Collects trading fees and splits them 70% to the commodity's license holder / 30% protocol.
interface IFeeManager {
    /// @notice Deposit `msg.value` of trading fees for a commodity. Only callable by the perp engine.
    function accrue(uint256 commodityId) external payable;

    /// @notice Checkpoint hook: settle a commodity's accrued holder fees to the outgoing owner on transfer.
    ///         Only callable by the license NFT.
    function onLicenseTransfer(uint256 commodityId, address from) external;
}
