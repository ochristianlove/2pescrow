import type { WalletConfig } from "./types";

function isEvmTokenAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

/**
 * Canonical ERC-20 contract for funding on Ethereum mainnet.
 * Prefer live config over escrow.tokenAddress so stale Scroll-era addresses are not used.
 */
export function resolveEthereumFundingTokenAddress(
  tokenSymbol: string | undefined,
  escrowTokenAddress: string | null | undefined,
  cfg: WalletConfig | null | undefined,
): `0x${string}` | null {
  const configured =
    tokenSymbol === "USDC" ? cfg?.tokens?.USDC : cfg?.tokens?.USDT;
  const candidates = [configured, escrowTokenAddress];
  for (const candidate of candidates) {
    if (isEvmTokenAddress(candidate)) return candidate;
  }
  return null;
}
