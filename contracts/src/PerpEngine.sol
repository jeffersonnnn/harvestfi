// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ICommodityRegistry} from "./interfaces/ICommodityRegistry.sol";
import {IPushPriceOracle} from "./interfaces/IPushPriceOracle.sol";
import {ILiquidityPool} from "./interfaces/ILiquidityPool.sol";
import {IFeeManager} from "./interfaces/IFeeManager.sol";
import {IPerpEngine} from "./interfaces/IPerpEngine.sol";

/// @title PerpEngine
/// @notice Oracle-priced perpetual futures on commodities, collateralized in native ETH. Traders
///         open leveraged long/short positions against the push oracle's mark price; the shared
///         LiquidityPool is the counterparty for their PnL. Open/close/liquidation fees are routed
///         to the FeeManager (70% to the commodity's license holder / 30% protocol).
///
///         Margin is custodied here; the pool holds LP capital. On a winning close the pool sends
///         profit to this contract, which pays the trader margin+profit; on a losing close the
///         trader's loss is sent to the pool.
///
///         Two ongoing costs accrue while a position is open, both settled at close/liquidation:
///         - Funding: peer-to-peer skew fee routed through the pool (longs pay shorts when long-heavy).
///         - Borrow fee (see DECISIONS.md D1): paid only by the heavier-OI side, scaling with pool
///           utilization, and accruing to the LP pool as compensation for reserved capital. It does
///           NOT touch the 70/30 trading-fee split - it nets into the PnL settled against the pool.
contract PerpEngine is IPerpEngine, Ownable, ReentrancyGuard, Pausable {
    uint256 public constant BPS = 10_000;
    uint256 public constant PRICE_SCALE = 1e8; // oracle prices are USD * 1e8
    uint256 public constant FUNDING_SCALE = 1e18;
    uint256 public constant MAX_LEVERAGE_HARD_CAP = 50;

    ICommodityRegistry public immutable registry;
    IPushPriceOracle public immutable oracle;
    ILiquidityPool public immutable pool;
    IFeeManager public immutable feeManager;

    // Governance-tunable risk params.
    uint256 public liquidationFeeBps = 500; // 5% of collateral to the liquidator, paid before loss settle
    uint256 public fundingFactorPerDay = 0.01e18; // max funding fraction/day at full skew (1e18)
    uint256 public borrowingFactorPerDay = 0.0005e18; // borrow fraction/day at 100% util (~18%/yr)
    address public guardian; // may pause new positions in an incident; owner unpauses

    struct Position {
        address trader;
        uint256 commodityId;
        bool isLong;
        uint256 collateral; // ETH margin held by this contract (wei)
        uint256 sizeEth; // notional exposure (wei)
        uint256 entryPrice; // 1e8
        int256 entryFundingIndex; // 1e18 cumulative funding at entry
        uint256 entryBorrowingIndex; // 1e18 cumulative borrowing (this side) at entry
        uint64 openedAt;
    }

    struct Market {
        uint256 longOI; // sum of long notionals (wei)
        uint256 shortOI; // sum of short notionals (wei)
        int256 cumFundingIndex; // 1e18, positive => longs pay shorts
        uint256 cumBorrowingLong; // 1e18, advances only while longs are the heavier side
        uint256 cumBorrowingShort; // 1e18, advances only while shorts are the heavier side
        uint64 lastAccrualTs;
    }

    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;
    mapping(uint256 => Market) public marketsById; // commodityId => Market
    uint256 public globalOpenNotional; // total open notional across all markets
    uint256 public insuranceFund; // ETH backstop that covers bad debt so LPs are made whole
    mapping(address => uint256) public owed; // pull-payment residuals when a push to the trader fails

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        uint256 indexed commodityId,
        bool isLong,
        uint256 collateral,
        uint256 sizeEth,
        uint256 entryPrice,
        uint256 openFee
    );
    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 indexed commodityId,
        uint256 exitPrice,
        int256 pnl,
        uint256 closeFee,
        uint256 borrowFee,
        uint256 liqFee,
        uint256 payout,
        bool liquidated
    );
    event InsuranceDeposited(address indexed from, uint256 amount);
    event InsuranceDrawn(uint256 indexed commodityId, uint256 amount);
    event BadDebt(uint256 indexed commodityId, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event FundingParamsUpdated(uint256 fundingFactorPerDay);
    event BorrowingParamsUpdated(uint256 borrowingFactorPerDay);
    event LiquidationParamsUpdated(uint256 liquidationRewardBps);
    event GuardianUpdated(address indexed guardian);

    constructor(address initialOwner, address registry_, address oracle_, address pool_, address feeManager_)
        Ownable(initialOwner)
    {
        require(
            registry_ != address(0) && oracle_ != address(0) && pool_ != address(0) && feeManager_ != address(0),
            "zero addr"
        );
        registry = ICommodityRegistry(registry_);
        oracle = IPushPriceOracle(oracle_);
        pool = ILiquidityPool(pool_);
        feeManager = IFeeManager(feeManager_);
        guardian = initialOwner;
    }

    /// @dev Receives trader profit forwarded from the pool during a close.
    receive() external payable {}

    // --------------------------------------------------------------------- //
    //                                Trading                                //
    // --------------------------------------------------------------------- //

    /// @notice Open a leveraged position. `msg.value` is the ETH margin. `maxSlippagePrice` bounds
    ///         the acceptable entry price (0 disables the check): longs require price <= bound,
    ///         shorts require price >= bound.
    function openPosition(uint256 commodityId, bool isLong, uint16 leverageX, uint256 maxSlippagePrice)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 positionId)
    {
        require(msg.value > 0, "no collateral");
        ICommodityRegistry.Commodity memory c = registry.getCommodity(commodityId);
        require(c.listed, "not listed");
        require(leverageX >= 1 && leverageX <= c.maxLeverageX && leverageX <= MAX_LEVERAGE_HARD_CAP, "bad leverage");

        uint256 price = oracle.getFreshPrice(commodityId);
        if (maxSlippagePrice != 0) {
            if (isLong) require(price <= maxSlippagePrice, "slippage");
            else require(price >= maxSlippagePrice, "slippage");
        }

        _accrue(commodityId);
        Market storage mk = marketsById[commodityId];

        uint256 notional = msg.value * leverageX;
        uint256 openFee = (notional * c.openFeeBps) / BPS;
        require(openFee < msg.value, "fee>=collateral");
        uint256 collateral = msg.value - openFee;

        // Per-market OI cap.
        if (c.maxOpenInterestEth != 0) {
            require(mk.longOI + mk.shortOI + notional <= c.maxOpenInterestEth, "OI cap");
        }
        // Pool must be able to back the full new notional (conservative: covers a 100% adverse move).
        require(pool.totalAssets() >= globalOpenNotional + notional, "insufficient pool");

        positionId = nextPositionId++;
        positions[positionId] = Position({
            trader: msg.sender,
            commodityId: commodityId,
            isLong: isLong,
            collateral: collateral,
            sizeEth: notional,
            entryPrice: price,
            entryFundingIndex: mk.cumFundingIndex,
            entryBorrowingIndex: isLong ? mk.cumBorrowingLong : mk.cumBorrowingShort,
            openedAt: uint64(block.timestamp)
        });

        if (isLong) mk.longOI += notional;
        else mk.shortOI += notional;
        globalOpenNotional += notional;

        feeManager.accrue{value: openFee}(commodityId);
        emit PositionOpened(positionId, msg.sender, commodityId, isLong, collateral, notional, price, openFee);
    }

    /// @notice Close your own position. `maxSlippagePrice` (0 disables) bounds the exit price:
    ///         a long requires price >= bound, a short requires price <= bound.
    function closePosition(uint256 positionId, uint256 maxSlippagePrice) external nonReentrant {
        Position memory pos = positions[positionId];
        require(pos.trader == msg.sender, "not owner");

        _accrue(pos.commodityId);
        Market storage mk = marketsById[pos.commodityId];
        uint256 price = oracle.getFreshPrice(pos.commodityId);
        if (maxSlippagePrice != 0) {
            if (pos.isLong) require(price >= maxSlippagePrice, "slippage");
            else require(price <= maxSlippagePrice, "slippage");
        }

        ICommodityRegistry.Commodity memory c = registry.getCommodity(pos.commodityId);
        int256 pnl = _pnl(pos, price, mk.cumFundingIndex);
        uint256 borrowFee = _pendingBorrowFee(pos, mk);
        _settle(positionId, pos, c, mk, price, pnl, borrowFee, msg.sender, false);
    }

    /// @notice Liquidate an underwater position: equity (collateral + PnL − borrow fee) below the
    ///         maintenance margin. The caller earns a reward out of the remaining equity.
    function liquidate(uint256 positionId) external nonReentrant {
        Position memory pos = positions[positionId];
        require(pos.trader != address(0), "no position");

        _accrue(pos.commodityId);
        Market storage mk = marketsById[pos.commodityId];
        uint256 price = oracle.getFreshPrice(pos.commodityId);
        ICommodityRegistry.Commodity memory c = registry.getCommodity(pos.commodityId);

        int256 pnl = _pnl(pos, price, mk.cumFundingIndex);
        uint256 borrowFee = _pendingBorrowFee(pos, mk);
        int256 equity = int256(pos.collateral) + pnl - int256(borrowFee);
        uint256 maintenance = (pos.sizeEth * c.maintenanceMarginBps) / BPS;
        require(equity < int256(maintenance), "healthy");

        _settle(positionId, pos, c, mk, price, pnl, borrowFee, msg.sender, true);
    }

    // --------------------------------------------------------------------- //
    //                               Internal                                //
    // --------------------------------------------------------------------- //

    /// @dev PnL in wei including funding. Price PnL = size * (mark - entry) / entry (sign per side);
    ///      funding = size * (cumIndexNow - entryIndex) / 1e18 - longs pay it, shorts receive it.
    function _pnl(Position memory pos, uint256 price, int256 cumIndexNow) internal pure returns (int256 pnl) {
        int256 pricePnl = (int256(pos.sizeEth) * (int256(price) - int256(pos.entryPrice))) / int256(pos.entryPrice);
        if (!pos.isLong) pricePnl = -pricePnl;

        int256 funding = (int256(pos.sizeEth) * (cumIndexNow - pos.entryFundingIndex)) / int256(FUNDING_SCALE);
        pnl = pos.isLong ? pricePnl - funding : pricePnl + funding;
    }

    function _settle(
        uint256 positionId,
        Position memory pos,
        ICommodityRegistry.Commodity memory c,
        Market storage mk,
        uint256 price,
        int256 pnl,
        uint256 borrowFee,
        address caller,
        bool liquidated
    ) internal {
        // Remove open interest and delete the position before moving funds.
        if (pos.isLong) mk.longOI -= pos.sizeEth;
        else mk.shortOI -= pos.sizeEth;
        globalOpenNotional -= pos.sizeEth;
        delete positions[positionId];

        // The borrow fee is a cost that accrues to the LP pool: net it into PnL settled against the
        // pool. (Funding is already in `pnl`; the 70/30 trading-fee split is handled separately below.)
        int256 netPnl = pnl - int256(borrowFee);
        uint256 collateral = pos.collateral;

        // Flat liquidation fee, taken from collateral FIRST so liquidating an insolvent position is
        // still profitable - fixes the "no incentive at zero equity" gap (DECISIONS.md D2).
        uint256 liqFee = 0;
        if (liquidated) {
            liqFee = (collateral * liquidationFeeBps) / BPS;
            if (liqFee > collateral) liqFee = collateral;
            collateral -= liqFee;
        }

        // Settle net PnL against the pool. A trader can never lose more than their (post-fee) collateral;
        // any shortfall vs the pool's fair loss is topped up from the insurance fund (bad-debt backstop).
        uint256 payout;
        if (netPnl >= 0) {
            uint256 profit = uint256(netPnl);
            uint256 poolBal = pool.totalAssets();
            if (profit > poolBal) profit = poolBal; // pool pays what it can (MVP solvency guard)
            if (profit > 0) pool.payTraderProfit(address(this), profit);
            payout = collateral + profit;
        } else {
            uint256 trueLoss = uint256(-netPnl);
            uint256 fromCollateral = trueLoss > collateral ? collateral : trueLoss;
            uint256 shortfall = trueLoss - fromCollateral;
            uint256 cover = shortfall > insuranceFund ? insuranceFund : shortfall;
            if (cover > 0) insuranceFund -= cover;
            uint256 toPool = fromCollateral + cover;
            if (toPool > 0) pool.receiveLoss{value: toPool}();
            if (cover > 0) emit InsuranceDrawn(pos.commodityId, cover);
            if (shortfall - cover > 0) emit BadDebt(pos.commodityId, shortfall - cover);
            payout = collateral - fromCollateral;
        }

        // Close fee (bps of notional), capped by available payout, routed to the FeeManager.
        uint256 closeFee = (pos.sizeEth * c.closeFeeBps) / BPS;
        if (closeFee > payout) closeFee = payout;
        payout -= closeFee;
        if (closeFee > 0) feeManager.accrue{value: closeFee}(pos.commodityId);

        if (liqFee > 0) _sendValue(caller, liqFee);
        // Pull-over-push for the trader residual: a trader whose contract reverts on receive must not be
        // able to block their own liquidation (which would strand bad debt on the pool). If the push
        // fails, credit it to a withdrawable balance instead of reverting the whole settlement.
        if (payout > 0) {
            (bool ok,) = payable(pos.trader).call{value: payout}("");
            if (!ok) owed[pos.trader] += payout;
        }

        emit PositionClosed(
            positionId, pos.trader, pos.commodityId, price, pnl, closeFee, borrowFee, liqFee, payout, liquidated
        );
    }

    /// @notice Permissionlessly advance a market's funding & borrowing indices to the current time.
    function pokeFunding(uint256 commodityId) external {
        _accrue(commodityId);
    }

    /// @dev Borrow fee owed by a position: notional * (side's cumulative borrowing index - entry) / 1e18.
    ///      Only the heavier side's index advances, so a position on the lighter side accrues nothing.
    function _pendingBorrowFee(Position memory pos, Market storage mk) internal view returns (uint256) {
        uint256 cumNow = pos.isLong ? mk.cumBorrowingLong : mk.cumBorrowingShort;
        return (pos.sizeEth * (cumNow - pos.entryBorrowingIndex)) / FUNDING_SCALE;
    }

    /// @dev Advance a market's cumulative funding (skew-based) and borrowing (utilization-based) indices.
    function _accrue(uint256 commodityId) internal {
        Market storage mk = marketsById[commodityId];
        uint64 nowTs = uint64(block.timestamp);
        if (mk.lastAccrualTs == 0) {
            mk.lastAccrualTs = nowTs;
            return;
        }
        uint256 dt = nowTs - mk.lastAccrualTs;
        if (dt == 0) return;

        uint256 total = mk.longOI + mk.shortOI;

        // Funding: skew in [-1e18, 1e18]; positive => longs pay shorts.
        if (total > 0 && fundingFactorPerDay > 0) {
            int256 skew = (int256(mk.longOI) - int256(mk.shortOI)) * int256(FUNDING_SCALE) / int256(total);
            int256 delta = (skew * int256(fundingFactorPerDay)) / int256(FUNDING_SCALE);
            delta = (delta * int256(dt)) / int256(uint256(1 days));
            mk.cumFundingIndex += delta;
        }

        // Borrowing: only the heavier side pays; rate scales with how much of the pool it reserves.
        if (borrowingFactorPerDay > 0 && mk.longOI != mk.shortOI) {
            uint256 heavier = mk.longOI > mk.shortOI ? mk.longOI : mk.shortOI;
            uint256 poolAssets = pool.totalAssets();
            if (poolAssets > 0) {
                uint256 util = (heavier * FUNDING_SCALE) / poolAssets;
                if (util > FUNDING_SCALE) util = FUNDING_SCALE; // cap at 100%
                uint256 bDelta = (((borrowingFactorPerDay * util) / FUNDING_SCALE) * dt) / (1 days);
                if (mk.longOI > mk.shortOI) mk.cumBorrowingLong += bDelta;
                else mk.cumBorrowingShort += bDelta;
            }
        }

        mk.lastAccrualTs = nowTs;
    }

    function _sendValue(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    // --------------------------------------------------------------------- //
    //                                 Admin                                 //
    // --------------------------------------------------------------------- //

    function setFundingFactorPerDay(uint256 factor) external onlyOwner {
        require(factor <= 1e18, "factor too high"); // <= 100%/day at full skew
        fundingFactorPerDay = factor;
        emit FundingParamsUpdated(factor);
    }

    function setBorrowingFactorPerDay(uint256 factor) external onlyOwner {
        require(factor <= 0.05e18, "factor too high"); // <= 5%/day at 100% utilization
        borrowingFactorPerDay = factor;
        emit BorrowingParamsUpdated(factor);
    }

    function setLiquidationFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 2_000, "fee too high"); // <= 20% of collateral
        liquidationFeeBps = bps;
        emit LiquidationParamsUpdated(bps);
    }

    /// @notice Seed the bad-debt insurance fund with ETH. Anyone may contribute.
    function depositInsurance() external payable {
        require(msg.value > 0, "no value");
        insuranceFund += msg.value;
        emit InsuranceDeposited(msg.sender, msg.value);
    }

    /// @notice Withdraw a residual credited when a direct payout to you failed (see {closePosition}).
    function withdraw() external nonReentrant returns (uint256 amount) {
        amount = owed[msg.sender];
        require(amount > 0, "nothing");
        owed[msg.sender] = 0;
        _sendValue(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function setGuardian(address guardian_) external onlyOwner {
        require(guardian_ != address(0), "guardian=0");
        guardian = guardian_;
        emit GuardianUpdated(guardian_);
    }

    /// @notice Halt new positions in an incident. Closes and liquidations remain enabled so users can
    ///         always exit. Callable by the guardian or owner.
    function pause() external {
        require(msg.sender == guardian || msg.sender == owner(), "not guardian");
        _pause();
    }

    /// @notice Resume trading. Owner only.
    function unpause() external onlyOwner {
        _unpause();
    }

    // --------------------------------------------------------------------- //
    //                                 Views                                 //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IPerpEngine
    function lockedForPnl() external view returns (uint256) {
        return globalOpenNotional;
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    function markPrice(uint256 commodityId) external view returns (uint256) {
        return oracle.getFreshPrice(commodityId);
    }

    /// @notice PnL at the current mark using the last-accrued funding index (view approximation;
    ///         excludes the borrow fee - see {pendingBorrowFee}).
    function unrealizedPnl(uint256 positionId) external view returns (int256) {
        Position memory pos = positions[positionId];
        require(pos.trader != address(0), "no position");
        uint256 price = oracle.getFreshPrice(pos.commodityId);
        return _pnl(pos, price, marketsById[pos.commodityId].cumFundingIndex);
    }

    /// @notice Borrow fee accrued so far (using the last-accrued index; view approximation).
    function pendingBorrowFee(uint256 positionId) external view returns (uint256) {
        Position memory pos = positions[positionId];
        require(pos.trader != address(0), "no position");
        return _pendingBorrowFee(pos, marketsById[pos.commodityId]);
    }

    /// @notice True if the position can currently be liquidated (equity = collateral + PnL − borrow fee).
    function isLiquidatable(uint256 positionId) external view returns (bool) {
        Position memory pos = positions[positionId];
        if (pos.trader == address(0)) return false;
        Market storage mk = marketsById[pos.commodityId];
        uint256 price = oracle.getFreshPrice(pos.commodityId);
        int256 pnl = _pnl(pos, price, mk.cumFundingIndex);
        uint256 borrowFee = _pendingBorrowFee(pos, mk);
        ICommodityRegistry.Commodity memory c = registry.getCommodity(pos.commodityId);
        uint256 maintenance = (pos.sizeEth * c.maintenanceMarginBps) / BPS;
        return int256(pos.collateral) + pnl - int256(borrowFee) < int256(maintenance);
    }
}
