// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TronEscrowDealV2.sol";

interface ITronEscrowDealV2Initializer {
    function initialize(
        address factory,
        address buyer,
        address seller,
        address token,
        uint256 amount,
        address optionalAgent
    ) external;
    function fundFromFactory(uint256 fee) external;
}

interface ITronTokenFactoryV2 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title TronEscrowFactoryV2
 * @notice Deploys EIP-1167 escrow clones and supports a single approve + create-and-fund flow.
 * @dev The implementation is deployed once and passed to the factory constructor. Each trade
 *      deploys only a 55-byte proxy instead of copying the full escrow bytecode.
 */
contract TronEscrowFactoryV2 {
    address public feeRecipient;
    address public resolver;
    address public owner;
    address public implementation;

    uint256 public creationFee = 1e6;
    uint256 public cancelRefundCommission = 1e6;
    uint256 public sellerShareBps = 9000;
    uint256 public feeShareBps = 1000;
    uint256 public buyerFavorBps = 10000;
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
    event OwnerUpdated(address indexed owner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address feeRecipient_, address resolver_, address usdt_, address implementation_) {
        require(feeRecipient_ != address(0) && resolver_ != address(0), "Zero role address");
        require(usdt_ != address(0) && implementation_ != address(0), "Zero contract address");
        owner = msg.sender;
        feeRecipient = feeRecipient_;
        resolver = resolver_;
        implementation = implementation_;
        _setToken(usdt_, true);
    }

    function factoryVersion() external pure returns (uint256) {
        return 2;
    }

    /** @notice Creates an unfunded escrow clone for integrations that need separate funding. */
    function createEscrow(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        address optionalAgent
    ) external returns (address escrow) {
        return _createEscrow(buyer, seller, token, amount, optionalAgent);
    }

    /**
     * @notice Creates and funds an escrow in one transaction after the buyer approves this factory.
     * @dev The factory is the TRC-20 spender, so approval can happen before an escrow address exists.
     */
    function createAndFund(
        address seller,
        address token,
        uint256 amount,
        address optionalAgent
    ) external returns (address escrow) {
        address buyer = msg.sender;
        escrow = _createEscrow(buyer, seller, token, amount, optionalAgent);

        uint256 fee = creationFee;
        require(ITronTokenFactoryV2(token).transferFrom(buyer, escrow, amount), "Escrow transfer failed");
        require(ITronTokenFactoryV2(token).transferFrom(buyer, feeRecipient, fee), "Fee transfer failed");
        ITronEscrowDealV2Initializer(escrow).fundFromFactory(fee);
    }

    function setFeeRecipient(address next) external onlyOwner {
        require(next != address(0), "Zero fee recipient");
        feeRecipient = next;
        emit FeeRecipientUpdated(next);
    }

    function setResolver(address next) external onlyOwner {
        require(next != address(0), "Zero resolver");
        resolver = next;
        emit ResolverUpdated(next);
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

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "Zero owner");
        owner = next;
        emit OwnerUpdated(next);
    }

    function _createEscrow(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        address optionalAgent
    ) internal returns (address escrow) {
        require(buyer != address(0) && seller != address(0), "Zero address");
        require(buyer != seller, "Same party");
        require(amount > 0, "Zero amount");
        require(whitelistedTokens[token], "Token not allowed");

        bytes memory proxyCode = abi.encodePacked(
            hex"3d602d80600a3d3981f3",
            hex"363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3"
        );
        assembly {
            escrow := create(0, add(proxyCode, 0x20), mload(proxyCode))
        }
        require(escrow != address(0), "Clone deployment failed");
        ITronEscrowDealV2Initializer(escrow).initialize(address(this), buyer, seller, token, amount, optionalAgent);
        isEscrow[escrow] = true;
        emit EscrowCreated(escrow, buyer, seller, token, amount, optionalAgent);
    }

    function _setToken(address token, bool allowed) internal {
        require(token != address(0), "Zero token");
        whitelistedTokens[token] = allowed;
        emit TokenWhitelistUpdated(token, allowed);
    }
}
