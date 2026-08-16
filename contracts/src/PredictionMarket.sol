// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPushPriceOracle} from "./interfaces/IPushPriceOracle.sol";
import {ICommodityRegistry} from "./interfaces/ICommodityRegistry.sol";

/// @title PredictionMarket
/// @notice Parimutuel, oracle-resolved binary prediction markets on commodity prices. A market asks a
///         yes/no question of the form "will <commodity> be {above|below} <threshold> at <expiry>?".
///         Bettors stake ETH into a YES pool or a NO pool while the market is open. After expiry, the
///         market resolves automatically from the existing PushPriceOracle (the same 1e8-USD feed the
///         perps use): the winning side splits the WHOLE pot pro-rata to stake, minus a protocol fee
///         taken only from the losing pool. No AMM, no liquidity provider, no counterparty — the pot
///         funds itself, so this contract holds only bettors' ETH and never touches the LP pool.
///
///         SETTLEMENT PRICE. Resolution uses the oracle's latest price, but only once that price is a
///         genuinely POST-EXPIRY observation (`timestamp >= expiry`). Until such a print exists the
///         market cannot resolve. If none arrives within `resolveGracePeriod` after expiry (a dead
///         keeper, a delisted feed), the market is permissionlessly CANCELLED and every bettor refunds
///         their full stake. Equality (price == threshold) resolves as NO for an "above" market and as
///         NO for a "below" market — the YES claim is strict.
///
///         MONEY. Everything is pull-payment: resolving credits the protocol fee to the treasury and
///         each bettor later calls {claim} to withdraw winnings (or {claim} to refund on a cancelled
///         market). A hostile treasury or bettor can never brick anyone else's claim.
///
///         SCOPE / GATE. v1 is price-threshold binaries only — self-resolving, no subjective outcomes.
///         Public leveraged/gambling markets are regulated; keep `permissionlessCreation` off until the
///         legal review clears, so only the owner can list markets in the meantime.
contract PredictionMarket is Ownable, Pausable, ReentrancyGuard {
    uint96 public constant MAX_FEE_BPS = 500; // hard cap: protocol fee can never exceed 5%
    uint96 public constant BPS = 10_000;

    IPushPriceOracle public immutable oracle;
    ICommodityRegistry public immutable registry;

    address public treasury; // receives the protocol fee (pull)
    address public guardian; // may pause in an incident; owner unpauses
    uint96 public feeBps; // protocol fee in basis points (<= MAX_FEE_BPS), charged on the losing pool

    uint256 public minBet; // minimum stake per bet, in wei (0 => any non-zero stake)
    uint64 public minDuration; // shortest allowed time from creation to expiry
    uint64 public maxDuration; // longest allowed time from creation to expiry
    uint64 public resolveGracePeriod; // after expiry+grace with no post-expiry price, market is cancellable
    bool public permissionlessCreation; // false => only owner may create markets (gated pre-legal)

    enum Status {
        Open, // accepting bets until expiry, then awaiting resolution
        Resolved, // outcome set; winners may claim
        Cancelled // no valid settlement price; everyone refunds

    }

    struct Market {
        uint256 commodityId; // registry id; also the oracle feed id
        uint256 thresholdE8; // price threshold in 1e8 USD
        uint64 expiry; // bets close and resolution unlocks at this timestamp
        bool isAbove; // true: YES wins if price > threshold; false: YES wins if price < threshold
        Status status;
        bool outcomeYes; // valid once Resolved
        uint256 yesPool; // total wei staked YES
        uint256 noPool; // total wei staked NO
        uint256 winnerPool; // set at resolve: the winning side's total stake
        uint256 netLosingPool; // set at resolve: losing pool minus protocol fee (distributed to winners)
        uint256 resolvedPrice; // the settlement price used (1e8 USD)
        address creator;
    }

    Market[] private _markets;
    // marketId => bettor => stake per side
    mapping(uint256 => mapping(address => uint256)) public yesStake;
    mapping(uint256 => mapping(address => uint256)) public noStake;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(address => uint256) public proceeds; // pull-payment balances (treasury fees)

    event MarketCreated(
        uint256 indexed marketId,
        uint256 indexed commodityId,
        address indexed creator,
        uint256 thresholdE8,
        uint64 expiry,
        bool isAbove
    );
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, bool outcomeYes, uint256 price, uint256 fee);
    event MarketCancelled(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed bettor, uint256 amount);
    event ProceedsWithdrawn(address indexed account, uint256 amount);
    event FeeBpsUpdated(uint96 feeBps);
    event TreasuryUpdated(address indexed treasury);
    event GuardianUpdated(address indexed guardian);
    event ParamsUpdated(uint256 minBet, uint64 minDuration, uint64 maxDuration, uint64 resolveGracePeriod);
    event PermissionlessCreationUpdated(bool enabled);

    constructor(
        address oracle_,
        address registry_,
        address initialOwner,
        address treasury_,
        uint96 feeBps_
    ) Ownable(initialOwner) {
        require(oracle_ != address(0) && registry_ != address(0) && treasury_ != address(0), "zero addr");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        oracle = IPushPriceOracle(oracle_);
        registry = ICommodityRegistry(registry_);
        treasury = treasury_;
        feeBps = feeBps_;
        guardian = initialOwner;
        minDuration = 5 minutes;
        maxDuration = 365 days;
        resolveGracePeriod = 1 hours;
    }

    // --------------------------------------------------------------------- //
    //                              Create / bet                            //
    // --------------------------------------------------------------------- //

    /// @notice Create a binary market on a listed commodity's price. `thresholdE8` is a 1e8-USD price
    ///         (e.g. $5.00 == 5_00000000). `isAbove` picks the direction the YES side is betting on.
    ///         Owner-only until {setPermissionlessCreation} is enabled.
    function createMarket(uint256 commodityId, uint256 thresholdE8, uint64 expiry, bool isAbove)
        external
        whenNotPaused
        returns (uint256 marketId)
    {
        require(permissionlessCreation || msg.sender == owner(), "not allowed");
        require(registry.isListed(commodityId), "commodity not listed");
        require(thresholdE8 > 0, "threshold=0");
        require(expiry >= block.timestamp + minDuration, "expiry too soon");
        require(expiry <= block.timestamp + maxDuration, "expiry too far");

        marketId = _markets.length;
        Market storage m = _markets.push();
        m.commodityId = commodityId;
        m.thresholdE8 = thresholdE8;
        m.expiry = expiry;
        m.isAbove = isAbove;
        m.status = Status.Open;
        m.creator = msg.sender;

        emit MarketCreated(marketId, commodityId, msg.sender, thresholdE8, expiry, isAbove);
    }

    /// @notice Stake ETH on the YES (`isYes = true`) or NO side of an open market. Multiple bets add up.
    function bet(uint256 marketId, bool isYes) external payable whenNotPaused {
        Market storage m = _market(marketId);
        require(m.status == Status.Open, "not open");
        require(block.timestamp < m.expiry, "betting closed");
        require(msg.value > 0 && msg.value >= minBet, "below min bet");

        if (isYes) {
            m.yesPool += msg.value;
            yesStake[marketId][msg.sender] += msg.value;
        } else {
            m.noPool += msg.value;
            noStake[marketId][msg.sender] += msg.value;
        }
        emit BetPlaced(marketId, msg.sender, isYes, msg.value);
    }

    // --------------------------------------------------------------------- //
    //                          Resolve / cancel                            //
    // --------------------------------------------------------------------- //

    /// @notice Resolve an expired market from the oracle. Permissionless: anyone can settle. Requires a
    ///         post-expiry oracle print (`timestamp >= expiry`). If the winning side drew zero stake
    ///         (nobody bet the correct outcome) the market is cancelled instead so no funds are stranded.
    function resolve(uint256 marketId) external nonReentrant {
        Market storage m = _market(marketId);
        require(m.status == Status.Open, "not open");
        require(block.timestamp >= m.expiry, "not expired");

        (int256 price, uint64 ts) = oracle.getPrice(m.commodityId);
        require(price > 0, "no price");
        require(ts >= m.expiry, "no post-expiry price");

        bool yesWins = m.isAbove ? uint256(price) > m.thresholdE8 : uint256(price) < m.thresholdE8;
        uint256 winnerPool = yesWins ? m.yesPool : m.noPool;
        uint256 losingPool = yesWins ? m.noPool : m.yesPool;

        // Nobody bet the winning side -> no valid distribution; refund everyone.
        if (winnerPool == 0) {
            m.status = Status.Cancelled;
            emit MarketCancelled(marketId);
            return;
        }

        uint256 fee = (losingPool * feeBps) / BPS;
        m.status = Status.Resolved;
        m.outcomeYes = yesWins;
        m.resolvedPrice = uint256(price);
        m.winnerPool = winnerPool;
        m.netLosingPool = losingPool - fee;
        if (fee > 0) proceeds[treasury] += fee;

        emit MarketResolved(marketId, yesWins, uint256(price), fee);
    }

    /// @notice Cancel an expired market that cannot be resolved because no post-expiry price exists and
    ///         the grace period has passed (dead keeper / delisted feed). Permissionless. Bettors then
    ///         refund via {claim}.
    function cancel(uint256 marketId) external {
        Market storage m = _market(marketId);
        require(m.status == Status.Open, "not open");
        require(block.timestamp >= m.expiry + resolveGracePeriod, "grace not passed");

        // Only allow cancel when the market is genuinely unresolvable (no post-expiry price available).
        (int256 price, uint64 ts) = oracle.getPrice(m.commodityId);
        require(price <= 0 || ts < m.expiry, "resolvable");

        m.status = Status.Cancelled;
        emit MarketCancelled(marketId);
    }

    // --------------------------------------------------------------------- //
    //                                 Claim                                //
    // --------------------------------------------------------------------- //

    /// @notice Withdraw your winnings from a resolved market, or your full stake from a cancelled one.
    ///         Payout = your winning stake + your pro-rata share of the (post-fee) losing pool.
    function claim(uint256 marketId) external nonReentrant returns (uint256 amount) {
        Market storage m = _market(marketId);
        require(m.status != Status.Open, "not settled");
        require(!claimed[marketId][msg.sender], "already claimed");

        uint256 yStake = yesStake[marketId][msg.sender];
        uint256 nStake = noStake[marketId][msg.sender];

        if (m.status == Status.Cancelled) {
            amount = yStake + nStake; // full refund of both sides
        } else {
            uint256 winStake = m.outcomeYes ? yStake : nStake;
            // payout = stake + stake * netLosingPool / winnerPool  (winnerPool > 0 guaranteed at resolve)
            amount = winStake + (winStake * m.netLosingPool) / m.winnerPool;
        }
        require(amount > 0, "nothing to claim");

        claimed[marketId][msg.sender] = true;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit Claimed(marketId, msg.sender, amount);
    }

    /// @notice Pull accrued protocol fees (treasury).
    function withdrawProceeds() external nonReentrant returns (uint256 amount) {
        amount = proceeds[msg.sender];
        require(amount > 0, "nothing");
        proceeds[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    // --------------------------------------------------------------------- //
    //                                 Admin                                //
    // --------------------------------------------------------------------- //

    function setFeeBps(uint96 feeBps_) external onlyOwner {
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        feeBps = feeBps_;
        emit FeeBpsUpdated(feeBps_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setGuardian(address guardian_) external onlyOwner {
        require(guardian_ != address(0), "guardian=0");
        guardian = guardian_;
        emit GuardianUpdated(guardian_);
    }

    /// @notice Tune market parameters. `maxDuration` must stay positive and >= `minDuration`.
    function setParams(uint256 minBet_, uint64 minDuration_, uint64 maxDuration_, uint64 resolveGracePeriod_)
        external
        onlyOwner
    {
        require(maxDuration_ >= minDuration_ && maxDuration_ > 0, "bad durations");
        minBet = minBet_;
        minDuration = minDuration_;
        maxDuration = maxDuration_;
        resolveGracePeriod = resolveGracePeriod_;
        emit ParamsUpdated(minBet_, minDuration_, maxDuration_, resolveGracePeriod_);
    }

    function setPermissionlessCreation(bool enabled) external onlyOwner {
        permissionlessCreation = enabled;
        emit PermissionlessCreationUpdated(enabled);
    }

    /// @notice Halt creation and betting in an incident. Resolve/cancel/claim stay open so no one is
    ///         trapped. Callable by the guardian or owner.
    function pause() external {
        require(msg.sender == guardian || msg.sender == owner(), "not guardian");
        _pause();
    }

    /// @notice Resume. Owner only.
    function unpause() external onlyOwner {
        _unpause();
    }

    // --------------------------------------------------------------------- //
    //                                 Views                                //
    // --------------------------------------------------------------------- //

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    /// @notice Live implied odds from pool sizes, in bps (yesBps + noBps == 10000 when either pool > 0).
    ///         Both zero before any bets.
    function odds(uint256 marketId) external view returns (uint256 yesBps, uint256 noBps) {
        Market storage m = _market(marketId);
        uint256 total = m.yesPool + m.noPool;
        if (total == 0) return (0, 0);
        yesBps = (m.yesPool * BPS) / total;
        noBps = BPS - yesBps;
    }

    /// @notice What `bettor` would receive from a resolved/cancelled market right now (0 if unsettled,
    ///         already claimed, or on the losing side).
    function claimable(uint256 marketId, address bettor) external view returns (uint256) {
        Market storage m = _market(marketId);
        if (m.status == Status.Open || claimed[marketId][bettor]) return 0;
        if (m.status == Status.Cancelled) {
            return yesStake[marketId][bettor] + noStake[marketId][bettor];
        }
        uint256 winStake = m.outcomeYes ? yesStake[marketId][bettor] : noStake[marketId][bettor];
        if (winStake == 0) return 0;
        return winStake + (winStake * m.netLosingPool) / m.winnerPool;
    }

    function _market(uint256 marketId) internal view returns (Market storage) {
        require(marketId < _markets.length, "unknown market");
        return _markets[marketId];
    }
}
