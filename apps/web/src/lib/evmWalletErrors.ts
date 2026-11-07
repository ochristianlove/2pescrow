/** Rough ETH display for wallet error copy (18 decimals). */
export function formatEthWei(wei: bigint): string {
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = (wei % base).toString().padStart(18, "0").replace(/0+$/, "");
  if (!frac) return whole.toString();
  const trimmed = frac.slice(0, 6).replace(/0+$/, "") || frac.slice(0, 4);
  return `${whole}.${trimmed}`;
}

export function isInsufficientFundsError(message: string): boolean {
  return /insufficient funds|insufficient gas|gas fee|exceeds the balance of the account|not enough.*eth|intrinsic gas/i.test(
    message,
  );
}

export function isLikelyTokenTransferError(message: string): boolean {
  return /transfer amount exceeds balance|erc20:|allowance|transfer_from|execution reverted/i.test(message);
}

/**
 * Turn wallet / viem funding errors into actionable copy (ETH gas vs USDT).
 */
export function normalizeEvmFundingError(
  error: unknown,
  context: { estimatedEthWei?: bigint; tokenSymbol?: string },
): string {
  const raw = error instanceof Error ? error.message : String(error);
  const ethHint =
    context.estimatedEthWei != null && context.estimatedEthWei > 0n
      ? ` You need about ${formatEthWei(context.estimatedEthWei)} ETH on Ethereum mainnet for the two network fees (approve + deposit). That is separate from the ${context.tokenSymbol || "token"} trade amount.`
      : " Add ETH on Ethereum mainnet for network fees—separate from the USDT trade amount.";

  if (isInsufficientFundsError(raw)) {
    if (isLikelyTokenTransferError(raw) && !/gas \* gas fee/i.test(raw)) {
      return `Insufficient ${context.tokenSymbol || "token"} for this deposit (trade amount plus creation fee). Check your wallet balance on Ethereum mainnet.${ethHint}`;
    }
    return `Not enough ETH on Ethereum mainnet for network fees.${ethHint}`;
  }

  return raw;
}
