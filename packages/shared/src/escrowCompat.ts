export const ESCROW_SELECTORS = {
  /** approveRelease() — V1 EscrowDeal (requires on-chain InProgress state after seller submitProof) */
  approveReleaseV1: "1e31a6dd",
  /** approveRelease(bytes32) — V2 EscrowDeal (allows Funded or InProgress state with buyer-attested proofHash) */
  approveReleaseV2: "36f67274",
  /** submitProof(bytes32) — Seller on-chain proof submission (transitions Funded -> InProgress) */
  submitProof: "bf084408",
  /** fund() — V1 EscrowDeal buyer deposit */
  fund: "b60d4288",
  /** markFunded(uint256) — V2 EscrowDeal factory-only funding hook */
  markFunded: "c5666eb2",
  /** withdrawDispute() — V2 EscrowDeal dispute withdrawal */
  withdrawDispute: "7847d411",
} as const;

export type EscrowReleaseMode = "v1-zero-arg" | "v2-proof-hash" | "unknown";

export type EscrowDealCapabilities = {
  implementationAddress: string | null;
  releaseMode: EscrowReleaseMode;
  /** True for deployed V1 contracts where approveRelease() requires State.InProgress via on-chain seller submitProof(). */
  requiresOnChainSellerProof: boolean;
  supportsSubmitProof: boolean;
  supportsWithdrawDispute: boolean;
};

const EIP1167_PREFIX = "363d3d373d3d3d363d73";
const EIP1167_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

export function extractMinimalProxyTarget(bytecode: string | null | undefined): `0x${string}` | null {
  if (!bytecode) return null;
  const hex = bytecode.toLowerCase().replace(/^0x/, "");
  if (
    hex.length === EIP1167_PREFIX.length + 40 + EIP1167_SUFFIX.length
    && hex.startsWith(EIP1167_PREFIX)
    && hex.endsWith(EIP1167_SUFFIX)
  ) {
    return `0x${hex.slice(EIP1167_PREFIX.length, EIP1167_PREFIX.length + 40)}`;
  }
  return null;
}

/**
 * Checks whether a compiled Solidity runtime bytecode contains a PUSH4 (`0x63`) dispatcher
 * entry for the 4-byte function selector.
 */
export function bytecodeHasSelector(bytecode: string | null | undefined, selectorHex: string): boolean {
  if (!bytecode) return false;
  const hex = bytecode.toLowerCase().replace(/^0x/, "");
  if (!hex) return false;
  const cleanSelector = selectorHex.toLowerCase().replace(/^0x/, "");
  if (cleanSelector.length !== 8) return false;
  return hex.includes(`63${cleanSelector}`);
}

export function detectEscrowDealCapabilities(
  implBytecode: string | null | undefined,
  implementationAddress: string | null,
): EscrowDealCapabilities {
  const hasV1Release = bytecodeHasSelector(implBytecode, ESCROW_SELECTORS.approveReleaseV1);
  const hasV2Release = bytecodeHasSelector(implBytecode, ESCROW_SELECTORS.approveReleaseV2);
  const supportsSubmitProof = bytecodeHasSelector(implBytecode, ESCROW_SELECTORS.submitProof);
  const supportsWithdrawDispute = bytecodeHasSelector(implBytecode, ESCROW_SELECTORS.withdrawDispute);

  let releaseMode: EscrowReleaseMode = "unknown";
  if (hasV2Release && !hasV1Release) {
    releaseMode = "v2-proof-hash";
  } else if (hasV1Release && !hasV2Release) {
    releaseMode = "v1-zero-arg";
  }

  return {
    implementationAddress,
    releaseMode,
    requiresOnChainSellerProof: releaseMode === "v1-zero-arg",
    supportsSubmitProof,
    supportsWithdrawDispute,
  };
}

export async function inspectEscrowDealCapabilities(
  escrowAddress: string,
  getCode: (address: `0x${string}`) => Promise<string | null | undefined>,
): Promise<EscrowDealCapabilities> {
  const normalized = escrowAddress.toLowerCase() as `0x${string}`;
  const code = await getCode(normalized);
  if (!code || code === "0x") {
    return {
      implementationAddress: null,
      releaseMode: "unknown",
      requiresOnChainSellerProof: false,
      supportsSubmitProof: false,
      supportsWithdrawDispute: false,
    };
  }
  const target = extractMinimalProxyTarget(code);
  if (target) {
    const implCode = await getCode(target);
    return detectEscrowDealCapabilities(implCode, target);
  }
  return detectEscrowDealCapabilities(code, normalized);
}

export const escrowDealV1ReleaseAbi = [
  {
    type: "function",
    name: "approveRelease",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const escrowDealV2ReleaseAbi = [
  {
    type: "function",
    name: "approveRelease",
    inputs: [{ name: "proofHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const escrowDealV1EventsAbi = [
  {
    type: "event",
    name: "Cancelled",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "returnedAmount", type: "uint256", indexed: false },
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
    ],
  },
] as const;
