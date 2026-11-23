// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IResolvableEscrow {
    function resolveDispute(bool buyerFavor) external;
    function withdrawDispute() external;
    function optionalAgent() external view returns (address);
}

/// @notice Two-tier dispute resolver registry & router for 2Pescrow factories.
/// - Platform resolvers (`isResolver`) can resolve or withdraw any disputed escrow.
/// - Special resolvers (`isSpecialResolver`) can ONLY resolve or withdraw escrows
///   where `escrow.optionalAgent() == msg.sender`, isolating external partners
///   (lawyers / Telegram escrow hosts) strictly to their own referred clients' trades.
contract ResolverRouter is Ownable {
    mapping(address => bool) public isResolver;
    mapping(address => bool) public isSpecialResolver;
    address[] private _resolvers;
    address[] private _specialResolvers;

    event ResolverAdded(address indexed resolver);
    event ResolverRemoved(address indexed resolver);
    event SpecialResolverAdded(address indexed resolver);
    event SpecialResolverRemoved(address indexed resolver);
    event DisputeResolved(address indexed escrow, address indexed resolver, bool buyerFavor, bool specialTier);
    event DisputeWithdrawn(address indexed escrow, address indexed resolver, bool specialTier);

    constructor(address[] memory initialResolvers) Ownable(msg.sender) {
        for (uint256 i = 0; i < initialResolvers.length; i++) {
            _addResolver(initialResolvers[i]);
        }
    }

    function _addResolver(address account) internal {
        require(account != address(0), "Zero address");
        if (isResolver[account]) return;
        isResolver[account] = true;
        _resolvers.push(account);
        emit ResolverAdded(account);
    }

    function _addSpecialResolver(address account) internal {
        require(account != address(0), "Zero address");
        if (isSpecialResolver[account]) return;
        isSpecialResolver[account] = true;
        _specialResolvers.push(account);
        emit SpecialResolverAdded(account);
    }

    function addResolver(address account) external onlyOwner {
        _addResolver(account);
    }

    function addResolvers(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            _addResolver(accounts[i]);
        }
    }

    function removeResolver(address account) external onlyOwner {
        require(isResolver[account], "Not a resolver");
        isResolver[account] = false;
        _removeFromArray(_resolvers, account);
        emit ResolverRemoved(account);
    }

    function addSpecialResolver(address account) external onlyOwner {
        _addSpecialResolver(account);
    }

    function removeSpecialResolver(address account) external onlyOwner {
        require(isSpecialResolver[account], "Not a special resolver");
        isSpecialResolver[account] = false;
        _removeFromArray(_specialResolvers, account);
        emit SpecialResolverRemoved(account);
    }

    function _removeFromArray(address[] storage list, address account) internal {
        uint256 len = list.length;
        for (uint256 i = 0; i < len; i++) {
            if (list[i] == account) {
                list[i] = list[len - 1];
                list.pop();
                break;
            }
        }
    }

    function getResolvers() external view returns (address[] memory) {
        return _resolvers;
    }

    function getSpecialResolvers() external view returns (address[] memory) {
        return _specialResolvers;
    }

    function canResolveEscrow(address account, address escrow) public view returns (bool) {
        if (isResolver[account]) return true;
        if (isSpecialResolver[account] && escrow != address(0)) {
            return IResolvableEscrow(escrow).optionalAgent() == account;
        }
        return false;
    }

    function resolveDispute(address escrow, bool buyerFavor) external {
        require(escrow != address(0), "Zero escrow");
        bool isPlatform = isResolver[msg.sender];
        bool isScopedPartner = !isPlatform && isSpecialResolver[msg.sender] && IResolvableEscrow(escrow).optionalAgent() == msg.sender;
        require(isPlatform || isScopedPartner, "Not authorized resolver");
        IResolvableEscrow(escrow).resolveDispute(buyerFavor);
        emit DisputeResolved(escrow, msg.sender, buyerFavor, isScopedPartner);
    }

    function withdrawDispute(address escrow) external {
        require(escrow != address(0), "Zero escrow");
        bool isPlatform = isResolver[msg.sender];
        bool isScopedPartner = !isPlatform && isSpecialResolver[msg.sender] && IResolvableEscrow(escrow).optionalAgent() == msg.sender;
        require(isPlatform || isScopedPartner, "Not authorized resolver");
        IResolvableEscrow(escrow).withdrawDispute();
        emit DisputeWithdrawn(escrow, msg.sender, isScopedPartner);
    }
}
