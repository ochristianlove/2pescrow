// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEscrowFactory {
    function feeRecipient() external view returns (address);
    function creationFee() external view returns (uint256);
    function cancelRefundCommission() external view returns (uint256);
    function resolver() external view returns (address);
    function sellerShareBps() external view returns (uint256);
    function buyerFavorBps() external view returns (uint256);
}

/// @title EscrowDeal V2 — per-trade buyer-funded escrow (Ethereum)
/// @notice Created and funded in one factory step. Seller fulfilment is off-chain by default; optional on-chain proof anchor.
///         Buyer release attests the fulfilment hash they reviewed. No seller payment flows on-chain.
contract EscrowDeal is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Created,
        Funded,
        InProgress,
        Completed,
        Cancelled,
        Disputed,
        Resolved
    }

    address public factory;
    address public buyer;
    address public seller;
    address public token;
    uint256 public escrowAmount;
    address public optionalAgent;

    State public state;
    State private stateBeforeDispute;
    address public disputeOpener;
    bytes32 public deliveryProofHash;
    bytes32 public buyerAttestedProofHash;
    bool public buyerCancelRequested;
    bool public sellerCancelRequested;
    bool private initialized;

    event StateChanged(State indexed previousState, State indexed newState);
    event Funded(address indexed buyer, uint256 escrowAmount, uint256 creationFee);
    event ProofSubmitted(address indexed seller, bytes32 proofHash);
    event Released(address indexed buyer, address indexed seller, uint256 toSeller, uint256 toFee, bytes32 proofHash);
    event CancelRequested(address indexed party);
    event CancelRefused(address indexed party);
    event Cancelled(address indexed buyer, uint256 returnedAmount, uint256 cancelCommission);
    event DisputeOpened(address indexed opener);
    event DisputeWithdrawn(address indexed opener);
    event DisputeResolved(bool buyerFavor, uint256 toBuyer, uint256 toSeller, uint256 toFee);

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Not buyer");
        _;
    }

    modifier onlySeller() {
        require(msg.sender == seller, "Not seller");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Not factory");
        _;
    }

    modifier inState(State s) {
        require(state == s, "Invalid state");
        _;
    }

    constructor() {
        initialized = true;
    }

    function initialize(
        address factory_,
        address buyer_,
        address seller_,
        address token_,
        uint256 escrowAmount_,
        address optionalAgent_
    ) external {
        require(!initialized, "Already init");
        initialized = true;
        factory = factory_;
        buyer = buyer_;
        seller = seller_;
        token = token_;
        escrowAmount = escrowAmount_;
        optionalAgent = optionalAgent_;
        state = State.Created;
        emit StateChanged(State.Created, State.Created);
    }

    /// @dev Called by the factory after pulling escrow tokens and the creation fee from the buyer.
    function markFunded(uint256 creationFee) external onlyFactory inState(State.Created) {
        _transition(State.Funded);
        emit Funded(buyer, escrowAmount, creationFee);
    }

    function _transition(State next) internal {
        State prev = state;
        state = next;
        emit StateChanged(prev, next);
    }

    /// @notice Optional seller anchor of fulfilment hash (chat/API is the default). Does not require seller to pay trade tokens.
    function submitProof(bytes32 proofHash) external nonReentrant onlySeller {
        require(state == State.Funded || state == State.InProgress, "Invalid state");
        require(proofHash != bytes32(0), "Empty proof");
        deliveryProofHash = proofHash;
        if (state == State.Funded) {
            _transition(State.InProgress);
        }
        emit ProofSubmitted(seller, proofHash);
    }

    /// @notice Buyer releases escrow after reviewing fulfilment. `proofHash` is the hash the buyer attests they reviewed.
    function approveRelease(bytes32 proofHash) external nonReentrant onlyBuyer {
        require(state == State.Funded || state == State.InProgress, "Invalid state");
        require(proofHash != bytes32(0), "Empty proof");
        if (deliveryProofHash != bytes32(0)) {
            require(proofHash == deliveryProofHash, "Proof mismatch");
        }
        buyerAttestedProofHash = proofHash;

        IEscrowFactory f = IEscrowFactory(factory);
        uint256 toSeller = (escrowAmount * f.sellerShareBps()) / 10_000;
        uint256 toFee = escrowAmount - toSeller;
        IERC20(token).safeTransfer(seller, toSeller);
        _distributeFee(f.feeRecipient(), toFee);
        _transition(State.Completed);
        emit Released(buyer, seller, toSeller, toFee, proofHash);
    }

    function requestCancel() external nonReentrant {
        require(state == State.Funded || state == State.InProgress, "Cannot cancel");
        if (msg.sender == seller) {
            sellerCancelRequested = true;
            emit CancelRequested(seller);
            _refundTradeAmountAndCancel();
            return;
        }
        require(msg.sender == buyer, "Not party");
        require(!buyerCancelRequested, "Already requested");
        buyerCancelRequested = true;
        emit CancelRequested(buyer);
    }

    function refuseCancel() external nonReentrant {
        require(state == State.Funded || state == State.InProgress, "Cannot cancel");
        require(msg.sender == seller, "Only seller can refuse");
        require(buyerCancelRequested, "Nothing to refuse");
        buyerCancelRequested = false;
        emit CancelRefused(seller);
    }

    /// @dev Seller-initiated close: refund escrow trade amount to buyer (funder) minus cancel commission; creation fee stays with protocol.
    function _refundTradeAmountAndCancel() internal {
        IEscrowFactory f = IEscrowFactory(factory);
        uint256 commission = f.cancelRefundCommission();
        require(escrowAmount >= commission, "Trade too small");
        uint256 refund = escrowAmount - commission;
        IERC20(token).safeTransfer(buyer, refund);
        if (commission > 0) {
            IERC20(token).safeTransfer(f.feeRecipient(), commission);
        }
        _transition(State.Cancelled);
        emit Cancelled(buyer, refund, commission);
    }

    function openDispute() external nonReentrant {
        require(msg.sender == buyer || msg.sender == seller, "Not party");
        require(state == State.Funded || state == State.InProgress, "Invalid state");
        stateBeforeDispute = state;
        disputeOpener = msg.sender;
        _transition(State.Disputed);
        emit DisputeOpened(msg.sender);
    }

    /// @notice Lets the dispute opener or configured resolver withdraw and resume the prior trade state.
    function withdrawDispute() external nonReentrant inState(State.Disputed) {
        IEscrowFactory f = IEscrowFactory(factory);
        require(msg.sender == disputeOpener || msg.sender == f.resolver(), "Not authorized");
        State resumeState = stateBeforeDispute;
        require(resumeState == State.Funded || resumeState == State.InProgress, "Invalid resume state");
        _transition(resumeState);
        address opener = disputeOpener;
        disputeOpener = address(0);
        emit DisputeWithdrawn(opener);
    }

    /// @notice Factory `resolver` wallet rules the outcome and moves escrow tokens (buyer refund vs seller release split).
    function resolveDispute(bool buyerFavor) external nonReentrant inState(State.Disputed) {
        IEscrowFactory f = IEscrowFactory(factory);
        require(msg.sender == f.resolver(), "Not resolver");
        uint256 toBuyer;
        uint256 toSeller;
        uint256 toFee;
        if (buyerFavor) {
            toBuyer = escrowAmount;
            IERC20(token).safeTransfer(buyer, toBuyer);
        } else {
            toSeller = (escrowAmount * f.sellerShareBps()) / 10_000;
            toFee = escrowAmount - toSeller;
            IERC20(token).safeTransfer(seller, toSeller);
            _distributeFee(f.feeRecipient(), toFee);
        }
        _transition(State.Resolved);
        emit DisputeResolved(buyerFavor, toBuyer, toSeller, toFee);
    }

    /// @dev Routes 100% of protocol fee to feeRecipient on standard trades; splits 50/50 with optionalAgent when assigned.
    function _distributeFee(address feeRecipient, uint256 totalFee) internal {
        if (totalFee == 0) return;
        if (optionalAgent != address(0)) {
            uint256 toPartner = totalFee / 2;
            uint256 toProtocol = totalFee - toPartner;
            if (toPartner > 0) IERC20(token).safeTransfer(optionalAgent, toPartner);
            if (toProtocol > 0) IERC20(token).safeTransfer(feeRecipient, toProtocol);
        } else {
            IERC20(token).safeTransfer(feeRecipient, totalFee);
        }
    }
}
