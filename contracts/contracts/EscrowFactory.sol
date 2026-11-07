// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./EscrowDeal.sol";

/// @notice V2 factory — clones an escrow and funds it in one transaction from the buyer (msg.sender).
contract EscrowFactory is Ownable {
    using SafeERC20 for IERC20;

    address public immutable implementation;
    address public feeRecipient;
    address public resolver;
    uint256 public creationFee = 1e6;
    /// @notice Deducted from escrow to fee recipient when the seller closes a funded trade (cancel-refund).
    uint256 public cancelRefundCommission = 1e6;

    uint256 public sellerShareBps = 9000;
    uint256 public feeShareBps = 1000;
    uint256 public buyerFavorBps = 9000;

    bool public agentModeEnabled;

    mapping(address => bool) public whitelistedTokens;
    mapping(address => bool) public isEscrow;

    event EscrowCreated(
        address indexed escrow,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        address optionalAgent
    );
    event FeeRecipientUpdated(address indexed feeRecipient);
    event ResolverUpdated(address indexed resolver);
    event TokenWhitelistUpdated(address indexed token, bool allowed);
    event AgentModeUpdated(bool enabled);
    event CreationFeeUpdated(uint256 fee);
    event CancelRefundCommissionUpdated(uint256 fee);

    constructor(
        address implementation_,
        address feeRecipient_,
        address resolver_,
        address usdc,
        address usdt,
        address thirdStable
    ) Ownable(msg.sender) {
        implementation = implementation_;
        feeRecipient = feeRecipient_;
        resolver = resolver_;
        _setToken(usdc, true);
        _setToken(usdt, true);
        if (thirdStable != address(0)) _setToken(thirdStable, true);
    }

    /// @notice Clone a deal, pull trade amount + creation fee from the buyer, and mark the deal Funded.
    function createAndFund(
        address seller,
        address token,
        uint256 amount,
        address optionalAgent
    ) external returns (address escrow) {
        address buyer = msg.sender;
        require(buyer != address(0) && seller != address(0), "Zero address");
        require(buyer != seller, "Same party");
        require(amount > 0, "Zero amount");
        require(whitelistedTokens[token], "Token not allowed");

        uint256 fee = creationFee;
        escrow = Clones.clone(implementation);
        EscrowDeal deal = EscrowDeal(escrow);
        deal.initialize(address(this), buyer, seller, token, amount, optionalAgent);

        IERC20(token).safeTransferFrom(buyer, escrow, amount);
        IERC20(token).safeTransferFrom(buyer, feeRecipient, fee);
        deal.markFunded(fee);

        isEscrow[escrow] = true;
        emit EscrowCreated(escrow, buyer, seller, token, amount, optionalAgent);
    }

    function setFeeRecipient(address feeRecipient_) external onlyOwner {
        feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(feeRecipient_);
    }

    function setResolver(address resolver_) external onlyOwner {
        resolver = resolver_;
        emit ResolverUpdated(resolver_);
    }

    function setAgentMode(bool enabled) external onlyOwner {
        agentModeEnabled = enabled;
        emit AgentModeUpdated(enabled);
    }

    function setCreationFee(uint256 fee) external onlyOwner {
        creationFee = fee;
        emit CreationFeeUpdated(fee);
    }

    function setCancelRefundCommission(uint256 fee) external onlyOwner {
        cancelRefundCommission = fee;
        emit CancelRefundCommissionUpdated(fee);
    }

    function setToken(address token, bool allowed) external onlyOwner {
        _setToken(token, allowed);
    }

    function _setToken(address token, bool allowed) internal {
        whitelistedTokens[token] = allowed;
        emit TokenWhitelistUpdated(token, allowed);
    }
}
