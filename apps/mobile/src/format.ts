export function formatAmount(atomic: string | null | undefined): string {
  if (!atomic) return "0.00";
  try {
    const value = BigInt(atomic);
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const whole = abs / 1_000_000n;
    const frac = (abs % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
    return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
  } catch {
    return atomic;
  }
}

export function tokenLabel(symbol: string | null | undefined): string {
  if (symbol === "TRON_USDT") return "USDT";
  return symbol || "USDT";
}

/** Dollars typed by a person, stored as 6-decimal atomic units. */
export function dollarsToAtomic(input: string): string | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) return null;
  if (match[1].length > 12) return null;
  const frac = (match[2] ?? "").padEnd(6, "0");
  return (BigInt(match[1]) * 1_000_000n + BigInt(frac)).toString();
}

/** Break opportunities so a long email or URL can wrap on a narrow phone. */
export function breakable(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[@./_:-]/g, (mark) => `${mark}\u200b`);
}

export function shortAddr(value: string | null | undefined): string {
  if (!value) return "Not linked";
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
