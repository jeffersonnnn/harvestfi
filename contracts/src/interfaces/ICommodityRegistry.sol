// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICommodityRegistry
/// @notice Registry of tradable commodities. `commodityId` is a sequential uint256 used as the
///         shared key across the oracle, license NFT, fee manager and perp engine.
interface ICommodityRegistry {
    struct Commodity {
        string symbol; // e.g. "CORN" (display)
        string unit; // e.g. "Bu" / "t.oz" (display; does not affect settlement)
        string quoteCurrency; // native quote currency on the data source, e.g. "USD" (display)
        string category; // e.g. "Agricultural" / "Metals" / "Energy" (display)
        bool listed;
        uint16 maxLeverageX; // max leverage multiplier
        uint16 maintenanceMarginBps; // maintenance margin as bps of notional
        uint16 openFeeBps; // open fee as bps of notional
        uint16 closeFeeBps; // close fee as bps of notional
        uint256 maxOpenInterestEth; // per-market OI cap in wei (0 = uncapped)
    }

    function isListed(uint256 id) external view returns (bool);
    function getCommodity(uint256 id) external view returns (Commodity memory);
    function count() external view returns (uint256);
}
