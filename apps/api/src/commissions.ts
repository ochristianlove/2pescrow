/** Standard referrers: 2% of platform profit (10% escrow fee + $1 creation fee model). */
export const REFERRER_COMMISSION_BPS = 200;

/** Default dispute-agent case rate: 0.5% of platform profit. Referral earnings stay at the referrer rate. */
export const AGENT_COMMISSION_BPS = 50;

export function commissionAtomicFromProfit(platformProfit: bigint, bps: number): bigint {
  return (platformProfit * BigInt(bps)) / 10000n;
}

/** Display percent (50 bps → 0.5). */
export function commissionRatePercent(bps: number): number {
  return bps / 100;
}

/** Referral completions always use the referrer rate, including when the referrer is also an agent. */
export async function commissionBpsForUserId(_userId: string): Promise<number> {
  return REFERRER_COMMISSION_BPS;
}
