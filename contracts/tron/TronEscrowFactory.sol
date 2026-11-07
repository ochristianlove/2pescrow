// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TronEscrowDeal.sol";

/**
 * @title TronEscrowFactory — spawns TronEscrowDeal instances on Tron TVM
 */
contract TronEscrowFactory {
    address public feeRecipient;
    address public resolver;
    uint256 public creationFee = 1e6;
    uint256 public cancelRefundCommission = 1e6;

    uint256 public sellerShareBps = 9000;
    uint256 public feeShareBps = 1000;
    uint256 public buyerFavorBps = 9000;

    bool public agentModeEnabled;
    address public owner;

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
    event OwnerUpdated(address indexed owner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address feeRecipient_, address resolver_, address usdt) {
        owner = msg.sender;
        feeRecipient = feeRecipient_;
        resolver = resolver_;
        _setToken(usdt, true);
    }

    function createEscrow(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        address optionalAgent
    ) external returns (address escrow) {
        require(buyer != address(0) && seller != address(0), "Zero address");
        require(buyer != seller, "Same party");
        require(amount > 0, "Zero amount");
        require(whitelistedTokens[token], "Token not allowed");

        TronEscrowDeal deal = new TronEscrowDeal(
            address(this),
            buyer,
            seller,
            token,
            amount,
            optionalAgent
        );
        escrow = address(deal);
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

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function _setToken(address token, bool allowed) internal {
        whitelistedTokens[token] = allowed;
        emit TokenWhitelistUpdated(token, allowed);
    }
}
