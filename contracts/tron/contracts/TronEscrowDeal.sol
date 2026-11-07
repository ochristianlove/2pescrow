// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TronEscrowDeal — buyer-funded escrow on Tron TVM (TRC-20)
 * @dev Mirrors the EVM EscrowDeal flow; deployed directly (no clone proxy) for TVM tooling compatibility.
 */
interface ITRC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface ITronEscrowFactory {
    function feeRecipient() external view returns (address);
    function creationFee() external view returns (uint256);
    function cancelRefundCommission() external view returns (uint256);
    function resolver() external view returns (address);
    function sellerShareBps() external view returns (uint256);
    function buyerFavorBps() external view returns (uint256);
}

contract TronEscrowDeal {
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
    bool public buyerCancelRequested;
    bool public sellerCancelRequested;

    event StateChanged(State indexed previousState, State indexed newState);
    event Funded(address indexed buyer, uint256 escrowAmount, uint256 creationFee);
    event ProofSubmitted(address indexed seller, bytes32 proofHash);
    event Released(address indexed buyer, address indexed seller, uint256 toSeller, uint256 toFee);
    event CancelRequested(address indexed party);
    event CancelRefused(address indexed party);
    /// @notice Trade amount minus cancel commission returned to the buyer (funder). The creation fee is never included.
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

    modifier inState(State s) {
        require(state == s, "Invalid state");
        _;
    }

    constructor(
        address factory_,
        address buyer_,
        address seller_,
        address token_,
        uint256 escrowAmount_,
        address optionalAgent_
    ) {
        factory = factory_;
        buyer = buyer_;
        seller = seller_;
        token = token_;
        escrowAmount = escrowAmount_;
        optionalAgent = optionalAgent_;
        state = State.Created;
        emit StateChanged(State.Created, State.Created);
    }

    function _transition(State next) internal {
        State prev = state;
        state = next;
        emit StateChanged(prev, next);
    }

    function fund() external onlyBuyer inState(State.Created) {
        ITronEscrowFactory f = ITronEscrowFactory(factory);
        uint256 fee = f.creationFee();
        require(ITRC20(token).transferFrom(buyer, address(this), escrowAmount + fee), "Transfer failed");
        require(ITRC20(token).transfer(f.feeRecipient(), fee), "Fee transfer failed");
        _transition(State.Funded);
        emit Funded(buyer, escrowAmount, fee);
    }

    function submitProof(bytes32 proofHash) external onlySeller inState(State.Funded) {
        require(proofHash != bytes32(0), "Empty proof");
        deliveryProofHash = proofHash;
        _transition(State.InProgress);
        emit ProofSubmitted(seller, proofHash);
    }

    function approveRelease() external onlyBuyer inState(State.InProgress) {
        ITronEscrowFactory f = ITronEscrowFactory(factory);
        uint256 toSeller = (escrowAmount * f.sellerShareBps()) / 10_000;
        uint256 toFee = escrowAmount - toSeller;
        require(ITRC20(token).transfer(seller, toSeller), "Seller transfer failed");
        require(ITRC20(token).transfer(f.feeRecipient(), toFee), "Fee transfer failed");
        _transition(State.Completed);
        emit Released(buyer, seller, toSeller, toFee);
    }

    /// @notice Seller cancel closes the trade and returns the trade amount to the buyer minus cancel commission.
    /// The creation fee was already paid to the protocol at funding and is never refunded.
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
        ITronEscrowFactory f = ITronEscrowFactory(factory);
        uint256 commission = f.cancelRefundCommission();
        require(escrowAmount >= commission, "Trade too small");
        uint256 refund = escrowAmount - commission;
        require(ITRC20(token).transfer(buyer, refund), "Refund failed");
        if (commission > 0) {
            require(ITRC20(token).transfer(f.feeRecipient(), commission), "Commission transfer failed");
        }
        _transition(State.Cancelled);
        emit Cancelled(buyer, refund, commission);
    }

    function openDispute() external {
        require(msg.sender == buyer || msg.sender == seller, "Not party");
        _openDispute(msg.sender);
    }

    /// @notice Lets the configured resolver freeze a party-raised app dispute without charging that party gas.
    /// @dev The resolver must first verify that the named opener is a buyer or seller in the app.
    function freezeDispute(address opener) external {
        ITronEscrowFactory f = ITronEscrowFactory(factory);
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

    /// @notice Lets the dispute opener or configured resolver withdraw and resume the prior trade state.
    function withdrawDispute() external inState(State.Disputed) {
        ITronEscrowFactory f = ITronEscrowFactory(factory);
        require(msg.sender == disputeOpener || msg.sender == f.resolver(), "Not authorized");
        State resumeState = stateBeforeDispute;
        require(resumeState == State.Funded || resumeState == State.InProgress, "Invalid resume state");
        _transition(resumeState);
        address opener = disputeOpener;
        disputeOpener = address(0);
        emit DisputeWithdrawn(opener);
    }

    /// @notice Buyer favor returns the full trade amount. Seller favor pays the normal release split.
    /// The creation fee was already paid at funding and is never refunded.
    function resolveDispute(bool buyerFavor) external inState(State.Disputed) {
        ITronEscrowFactory f = ITronEscrowFactory(factory);
        require(msg.sender == f.resolver(), "Not resolver");
        uint256 toBuyer;
        uint256 toSeller;
        uint256 toFee;
        if (buyerFavor) {
            toBuyer = escrowAmount;
            require(ITRC20(token).transfer(buyer, toBuyer), "Buyer transfer failed");
        } else {
            toSeller = (escrowAmount * f.sellerShareBps()) / 10_000;
            toFee = escrowAmount - toSeller;
            require(ITRC20(token).transfer(seller, toSeller), "Seller transfer failed");
            if (toFee > 0) require(ITRC20(token).transfer(f.feeRecipient(), toFee), "Fee transfer failed");
        }
        _transition(State.Resolved);
        emit DisputeResolved(buyerFavor, toBuyer, toSeller, toFee);
    }
}
