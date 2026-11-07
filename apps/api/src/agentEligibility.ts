import { prisma } from "./db";
import { escrowWalletWhere } from "./addresses";

/** Reference trade size (USD) for agent qualification copy. */
export const AGENT_QUALIFICATION_REFERENCE_USD = 10_000;

/** User must reach this multiple of the reference size (~$30,000). */
export const AGENT_QUALIFICATION_USD_MULTIPLIER = 3;

export const AGENT_QUALIFICATION_USD = AGENT_QUALIFICATION_REFERENCE_USD * AGENT_QUALIFICATION_USD_MULTIPLIER;

/** USDC/USDT escrows use 6 decimal places; volume is summed in token atomic units (~USD for stables). */
export const AGENT_QUALIFICATION_STABLE_DECIMALS = 6;

export const AGENT_MIN_COMPLETED_VOLUME_ATOMIC =
  BigInt(AGENT_QUALIFICATION_USD) * 10n ** BigInt(AGENT_QUALIFICATION_STABLE_DECIMALS);

const QUALIFYING_ESCROW_STATUSES = ["Completed", "Resolved"] as const;

export function formatStableUsdFromAtomic(atomic: bigint, decimals = AGENT_QUALIFICATION_STABLE_DECIMALS): string {
  const base = 10n ** BigInt(decimals);
  const whole = atomic / base;
  const frac = (atomic % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Completed trade volume for a user: sum of escrow `amountAtomic` on trades they joined as buyer or seller
 * (profile or linked wallet) with status Completed or Resolved.
 */
export async function userCompletedTradeVolumeAtomic(userId: string): Promise<bigint> {
  const wallets = await prisma.wallet.findMany({ where: { userId }, select: { address: true } });
  const addresses = wallets.map((w) => w.address);
  const walletClause = addresses.length > 0 ? escrowWalletWhere(addresses) : null;

  const rows = await prisma.escrow.findMany({
    where: {
      status: { in: [...QUALIFYING_ESCROW_STATUSES] },
      OR: [{ buyerUserId: userId }, { sellerUserId: userId }, ...(walletClause ? [walletClause] : [])],
    },
    select: { id: true, amountAtomic: true },
  });

  const seen = new Set<string>();
  let volume = 0n;
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    volume += BigInt(row.amountAtomic || "0");
  }
  return volume;
}

export async function agentEligibilityForUser(userId: string) {
  const volumeAtomic = await userCompletedTradeVolumeAtomic(userId);
  const qualified = volumeAtomic >= AGENT_MIN_COMPLETED_VOLUME_ATOMIC;
  return {
    qualified,
    volumeAtomic: volumeAtomic.toString(),
    volumeUsdApprox: formatStableUsdFromAtomic(volumeAtomic),
    requiredVolumeAtomic: AGENT_MIN_COMPLETED_VOLUME_ATOMIC.toString(),
    requiredVolumeUsdApprox: String(AGENT_QUALIFICATION_USD),
    referenceTradeUsd: AGENT_QUALIFICATION_REFERENCE_USD,
    multiplier: AGENT_QUALIFICATION_USD_MULTIPLIER,
    qualifyingStatuses: [...QUALIFYING_ESCROW_STATUSES],
    measurementNote:
      "Sum of escrow amounts (6-decimal USDC/USDT atomic units) for Completed and Resolved trades where you are buyer or seller by account or linked wallet.",
  };
}

export async function assertAgentVolumeQualified(userId: string) {
  const check = await agentEligibilityForUser(userId);
  if (check.qualified) return check;
  throw new AgentVolumeError(check);
}

export class AgentVolumeError extends Error {
  constructor(public detail: Awaited<ReturnType<typeof agentEligibilityForUser>>) {
    super(
      `Agent signup requires about $${AGENT_QUALIFICATION_USD.toLocaleString()} in completed trade volume (3× $${AGENT_QUALIFICATION_REFERENCE_USD.toLocaleString()}). Current: ~$${detail.volumeUsdApprox}.`,
    );
    this.name = "AgentVolumeError";
  }
}
