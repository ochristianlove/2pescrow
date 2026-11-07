/** USDC/USDT-style token amounts (6 decimals by default). Matches web `formatAmount`. */
export function formatAmount(atomic: string | bigint, decimals = 6): string {
  try {
    const n = typeof atomic === "bigint" ? atomic : BigInt(atomic);
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch {
    return String(atomic);
  }
}

/** Human-readable stablecoin amount for notifications (6-decimal USDT). */
export function formatStableDollars(atomic: string | bigint, decimals = 6): string {
  return `${formatAmount(atomic, decimals)} USDT`;
}
