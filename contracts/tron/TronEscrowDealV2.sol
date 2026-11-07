// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITronTokenV2 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface ITronEscrowFactoryV2 {
    function feeRecipient() external view returns (address);
    function creationFee() external view returns (uint256);
    function cancelRefundCommission() external view returns (uint256);
    function resolver() external view returns (address);
    function sellerShareBps() external view returns (uint256);
}

/**
 * @notice Clone implementation for low-cost per-trade TRON escrows.
 * @dev The implementation is locked in its constructor; clones initialize their own storage once.
 */
contract TronEscrowDealV2 {
    enum State { Created, Funded, InProgress, Completed, Cancelled, Disputed, Resolved }

    bool private initialized;
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
    bool public buyerCancelRequested;
    bool public sellerCancelRequested;

    event StateChanged(State indexed previousState, State indexed newState);
    event Funded(address indexed buyer, uint256 escrowAmount, uint256 creationFee);
    event ProofSubmitted(address indexed seller, bytes32 proofHash);
    event Released(address indexed buyer, address indexed seller, uint256 toSeller, uint256 toFee);
    event CancelRequested(address indexed party);
    event CancelRefused(address indexed party);
    event Cancelled(address indexed buyer, uint256 returnedAmount, uint256 cancelCommission);
    event DisputeOpened(address indexed opener);
    event DisputeWithdrawn(address indexed opener);
    event DisputeResolved(bool buyerFavor, uint256 toBuyer, uint256 toSeller, uint256 toFee);

    modifier inState(State expected) {
        require(state == expected, "Invalid state");
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
        require(!initialized, "Already initialized");
        require(factory_ != address(0) && buyer_ != address(0) && seller_ != address(0), "Zero address");
        require(buyer_ != seller_ && token_ != address(0) && escrowAmount_ > 0, "Invalid trade");
        initialized = true;
        factory = factory_;
        buyer = buyer_;
        seller = seller_;
        token = token_;
        escrowAmount = escrowAmount_;
        optionalAgent = optionalAgent_;
        emit StateChanged(State.Created, State.Created);
    }

    function fund() external inState(State.Created) {
        require(msg.sender == buyer, "Not buyer");
        ITronEscrowFactoryV2 f = ITronEscrowFactoryV2(factory);
        uint256 fee = f.creationFee();
        require(ITronTokenV2(token).transferFrom(buyer, address(this), escrowAmount + fee), "Transfer failed");
        require(ITronTokenV2(token).transfer(f.feeRecipient(), fee), "Fee transfer failed");
        _transition(State.Funded);
        emit Funded(buyer, escrowAmount, fee);
    }

    /** @dev Called only by the factory after it atomically transfers buyer USDT and the fee. */
    function fundFromFactory(uint256 fee) external inState(State.Created) {
        require(msg.sender == factory, "Not factory");
        _transition(State.Funded);
        emit Funded(buyer, escrowAmount, fee);
    }

    function submitProof(bytes32 proofHash) external inState(State.Funded) {
        require(msg.sender == seller, "Not seller");
        require(proofHash != bytes32(0), "Empty proof");
        deliveryProofHash = proofHash;
        _transition(State.InProgress);
        emit ProofSubmitted(seller, proofHash);
    }

    function approveRelease() external inState(State.InProgress) {
        require(msg.sender == buyer, "Not buyer");
        ITronEscrowFactoryV2 f = ITronEscrowFactoryV2(factory);
        uint256 toSeller = (escrowAmount * f.sellerShareBps()) / 10_000;
        uint256 toFee = escrowAmount - toSeller;
        require(ITronTokenV2(token).transfer(seller, toSeller), "Seller transfer failed");
        require(ITronTokenV2(token).transfer(f.feeRecipient(), toFee), "Fee transfer failed");
        _transition(State.Completed);
        emit Released(buyer, seller, toSeller, toFee);
    }

    function requestCancel() external {
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

    function refuseCancel() external {
        require(state == State.Funded || state == State.InProgress, "Cannot cancel");
        require(msg.sender == seller, "Only seller can refuse");
        require(buyerCancelRequested, "Nothing to refuse");
        buyerCancelRequested = false;
        emit CancelRefused(seller);
    }

    function _refundTradeAmountAndCancel() internal {
        ITronEscrowFactoryV2 f = ITronEscrowFactoryV2(factory);
        uint256 commission = f.cancelRefundCommission();
        require(escrowAmount >= commission, "Trade too small");
        uint256 refund = escrowAmount - commission;
        require(ITronTokenV2(token).transfer(buyer, refund), "Refund failed");
        if (commission > 0) require(ITronTokenV2(token).transfer(f.feeRecipient(), commission), "Commission failed");
        _transition(State.Cancelled);
        emit Cancelled(buyer, refund, commission);
    }

    function openDispute() external {
        require(msg.sender == buyer || msg.sender == seller, "Not party");
        _openDispute(msg.sender);
    }

    function freezeDispute(address opener) external {
        ITronEscrowFactoryV2 f = ITronEscrowFactoryV2(factory);
        require(msg.sender == f.resolver(), "Not resolver");
        require(opener == buyer || opener == seller, "Not party");
        _openDispute(opener);
    }

    function _openDispute(address opener) internal {
        require(state == State.Funded || state == State.InProgress, "Invalid state");
        stateBeforeDispute = state;
        disputeOpener = opener;
        _transition(State.Disputed);
        emit DisputeOpened(opener);
    }

    function withdrawDispute() external inState(State.Disputed) {
        ITronEscrowFactoryV2 f = ITronEscrowFactoryV2(factory);
        require(msg.sender == disputeOpener || msg.sender == f.resolver(), "Not authorized");
        State resumeState = stateBeforeDispute;
        require(resumeState == State.Funded || resumeState == State.InProgress, "Invalid resume state");
        _transition(resumeState);
        address opener = disputeOpener;
        disputeOpener = address(0);
        emit DisputeWithdrawn(opener);
    }

    function resolveDispute(bool buyerFavor) external inState(State.Disputed) {
        ITronEscrowFactoryV2 f = ITronEscrowFactoryV2(factory);
        require(msg.sender == f.resolver(), "Not resolver");
        uint256 toBuyer;
        uint256 toSeller;
        uint256 toFee;
        if (buyerFavor) {
            toBuyer = escrowAmount;
            require(ITronTokenV2(token).transfer(buyer, toBuyer), "Buyer transfer failed");
        } else {
            toSeller = (escrowAmount * f.sellerShareBps()) / 10_000;
            toFee = escrowAmount - toSeller;
            require(ITronTokenV2(token).transfer(seller, toSeller), "Seller transfer failed");
            if (toFee > 0) require(ITronTokenV2(token).transfer(f.feeRecipient(), toFee), "Fee transfer failed");
        }
        _transition(State.Resolved);
        emit DisputeResolved(buyerFavor, toBuyer, toSeller, toFee);
    }

    function _transition(State next) internal {
        State previous = state;
        state = next;
        emit StateChanged(previous, next);
    }
}
