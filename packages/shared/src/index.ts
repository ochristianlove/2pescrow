export const ETHEREUM_CHAIN_ID = 1;
export * from "./funding";
export const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const ETHEREUM_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

/** App-level chain keys stored on new escrows. */
export type AppChain = "ethereum" | "tron";

export const TRON_APP_CHAIN_ID = 728126428;

export const CHAIN_LABELS: Record<AppChain, string> = {
  ethereum: "Ethereum",
  tron: "Tron (TRC-20 USDT)",
};

export const WALLET_ROLE_TAGS = {
  FEE_RECIPIENT_WALLET: "FEE_RECIPIENT_WALLET",
  DEPLOYER_WALLET: "DEPLOYER_WALLET",
  BUYER_WALLET: "BUYER_WALLET",
  SELLER_WALLET: "SELLER_WALLET",
  AGENT_WALLET: "AGENT_WALLET",
  THIRD_STABLECOIN_ADDRESS: "THIRD_STABLECOIN_ADDRESS",
} as const;

export type EscrowState =
  | "Created"
  | "Funded"
  | "InProgress"
  | "Completed"
  | "Cancelled"
  | "Disputed"
  | "Resolved";

export const ESCROW_STATES: EscrowState[] = [
  "Created",
  "Funded",
  "InProgress",
  "Completed",
  "Cancelled",
  "Disputed",
  "Resolved",
];

export const escrowFactoryAbi = [
  {
    type: "function",
    name: "resolver",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "implementation",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createEscrow",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "optionalAgent", type: "address" },
    ],
    outputs: [{ name: "escrow", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createAndFund",
    inputs: [
      { name: "seller", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "optionalAgent", type: "address" },
    ],
    outputs: [{ name: "escrow", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "feeRecipient",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "creationFee",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "cancelRefundCommission",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "EscrowCreated",
    inputs: [
      { name: "escrow", type: "address", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "optionalAgent", type: "address", indexed: false },
    ],
  },
] as const;

export const escrowDealAbi = [
  {
    type: "function",
    name: "factory",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fund",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitProof",
    inputs: [{ name: "proofHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approveRelease",
    inputs: [{ name: "proofHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestCancel",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "refuseCancel",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "buyerCancelRequested",
    inputs: [],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "openDispute",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "freezeDispute",
    inputs: [{ name: "opener", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawDispute",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "resolveDispute",
    inputs: [{ name: "buyerFavor", type: "bool" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "state",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deliveryProofHash",
    inputs: [],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "StateChanged",
    inputs: [
      { name: "previousState", type: "uint8", indexed: true },
      { name: "newState", type: "uint8", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Funded",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "escrowAmount", type: "uint256", indexed: false },
      { name: "creationFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ProofSubmitted",
    inputs: [
      { name: "seller", type: "address", indexed: true },
      { name: "proofHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CancelRequested",
    inputs: [{ name: "party", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "CancelRefused",
    inputs: [{ name: "party", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "Cancelled",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "returnedAmount", type: "uint256", indexed: false },
      { name: "cancelCommission", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "toSeller", type: "uint256", indexed: false },
      { name: "toFee", type: "uint256", indexed: false },
      { name: "proofHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DisputeOpened",
    inputs: [{ name: "opener", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      { name: "buyerFavor", type: "bool", indexed: false },
      { name: "toBuyer", type: "uint256", indexed: false },
      { name: "toSeller", type: "uint256", indexed: false },
      { name: "toFee", type: "uint256", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;
