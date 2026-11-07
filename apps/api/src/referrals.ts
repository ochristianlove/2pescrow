import crypto from "crypto";
import { prisma } from "./db";
import { config } from "./config";
import { isEvmAddress, isTronBase58Address } from "./addresses";
import {
  REFERRER_COMMISSION_BPS,
  commissionAtomicFromProfit,
  commissionBpsForUserId,
  commissionRatePercent,
} from "./commissions";
import { formatStableDollars } from "./amountFormat";

/** Platform fee: 10% of escrow + $1 creation fee (6 decimals). */
export function platformProfitAtomic(amountAtomic: string): bigint {
  const amount = BigInt(amountAtomic || "0");
  const feeCut = (amount * 10n) / 100n;
  const flatFee = 1_000_000n;
  return feeCut + flatFee;
}

export function referrerCommissionAtomic(platformProfit: bigint, bps = REFERRER_COMMISSION_BPS): bigint {
  return commissionAtomicFromProfit(platformProfit, bps);
}

export function tierForSuccessfulCount(count: number): string {
  if (count >= 50) return "platinum";
  if (count >= 20) return "gold";
  if (count >= 5) return "silver";
  return "bronze";
}

export function generateReferralCode(): string {
  return crypto.randomBytes(5).toString("hex");
}

export async function ensureReferrerForUser(userId: string, displayName?: string) {
  const existing = await prisma.referrer.findUnique({ where: { userId } });
  if (existing) return existing;
  let code = generateReferralCode();
  for (let i = 0; i < 5; i++) {
    try {
      return await prisma.referrer.create({
        data: {
          userId,
          referralCode: code,
          displayName: displayName || undefined,
        },
      });
    } catch {
      code = generateReferralCode();
    }
  }
  throw new Error("Could not allocate referral code");
}

export async function recordReferralClick(referralCode: string) {
  const referrer = await prisma.referrer.findUnique({ where: { referralCode: referralCode.toLowerCase() } });
  if (!referrer) return null;
  await prisma.referralClick.create({ data: { referrerId: referrer.id } });
  return referrer;
}

export async function attributeReferee(referrerId: string, refereeUserId: string) {
  const referrer = await prisma.referrer.findUnique({ where: { id: referrerId } });
  if (!referrer || referrer.userId === refereeUserId) return null;
  const existing = await prisma.referralReferee.findUnique({ where: { refereeUserId } });
  if (existing) return existing;
  await prisma.user.update({
    where: { id: refereeUserId },
    data: { referredByReferrerId: referrerId },
  });
  return prisma.referralReferee.create({
    data: { referrerId, refereeUserId },
  });
}

export async function attributeRefereeByCode(referralCode: string, refereeUserId: string) {
  const referrer = await prisma.referrer.findUnique({
    where: { referralCode: referralCode.trim().toLowerCase() },
  });
  if (!referrer) return null;
  return attributeReferee(referrer.id, refereeUserId);
}

async function walletUserIds(addresses: string[]): Promise<Map<string, string>> {
  const lookup = new Set<string>();
  for (const a of addresses) {
    const t = a.trim();
    lookup.add(t);
    if (isEvmAddress(t)) lookup.add(t.toLowerCase());
  }
  const wallets = await prisma.wallet.findMany({
    where: { address: { in: [...lookup] } },
    select: { address: true, userId: true },
  });
  const map = new Map<string, string>();
  for (const w of wallets) {
    if (!w.userId) continue;
    map.set(w.address, w.userId);
    if (isEvmAddress(w.address)) map.set(w.address.toLowerCase(), w.userId);
  }
  return map;
}

function resolveWalletUser(map: Map<string, string>, address: string): string | undefined {
  const t = address.trim();
  return map.get(t) ?? (isEvmAddress(t) ? map.get(t.toLowerCase()) : isTronBase58Address(t) ? map.get(t) : undefined);
}

/** Credit referrer when either buyer or seller signed up via a referral link (one commission per completed escrow). */
export async function findReferrerForCompletedEscrow(buyerAddress: string | null, sellerAddress: string | null, buyerProfileId?: string | null, sellerProfileId?: string | null) {
  const map = await walletUserIds([buyerAddress, sellerAddress].filter((value): value is string => !!value));
  const buyerUserId = buyerProfileId ?? (buyerAddress ? resolveWalletUser(map, buyerAddress) : undefined);
  const sellerUserId = sellerProfileId ?? (sellerAddress ? resolveWalletUser(map, sellerAddress) : undefined);

  const [buyerRef, sellerRef] = await Promise.all([
    buyerUserId ? prisma.referralReferee.findUnique({ where: { refereeUserId: buyerUserId } }) : Promise.resolve(null),
    sellerUserId ? prisma.referralReferee.findUnique({ where: { refereeUserId: sellerUserId } }) : Promise.resolve(null),
  ]);

  let referrerId: string | undefined;
  if (buyerRef && sellerRef) {
    if (buyerRef.referrerId === sellerRef.referrerId) referrerId = buyerRef.referrerId;
    else referrerId = buyerRef.referrerId; // both referred, different referrers: credit buyer's referrer
  } else if (buyerRef) referrerId = buyerRef.referrerId;
  else if (sellerRef) referrerId = sellerRef.referrerId;

  if (!referrerId) return null;
  return prisma.referrer.findUnique({ where: { id: referrerId } });
}

export async function processEscrowCompletion(escrowId: string) {
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
  if (!escrow || escrow.status !== "Completed") return null;

  const existing = await prisma.referralCommission.findUnique({ where: { escrowId } });
  if (existing) return existing;

  const referrer = await findReferrerForCompletedEscrow(escrow.buyerAddress, escrow.sellerAddress, escrow.buyerUserId, escrow.sellerUserId);
  if (!referrer) return null;

  const profit = platformProfitAtomic(escrow.amountAtomic);
  const bps = await commissionBpsForUserId(referrer.userId);
  const commission = referrerCommissionAtomic(profit, bps);
  if (commission <= 0n) return null;

  const commissionRow = await prisma.referralCommission.create({
    data: {
      referrerId: referrer.id,
      escrowId,
      platformProfitAtomic: profit.toString(),
      commissionAtomic: commission.toString(),
      commissionBps: bps,
      status: "pending",
    },
  });

  const successful = referrer.successfulReferrals + 1;
  const earned = BigInt(referrer.totalEarnedAtomic) + commission;
  const pending = BigInt(referrer.pendingBalanceAtomic) + commission;
  const tier = tierForSuccessfulCount(successful);

  await prisma.referrer.update({
    where: { id: referrer.id },
    data: {
      successfulReferrals: successful,
      totalEarnedAtomic: earned.toString(),
      pendingBalanceAtomic: pending.toString(),
      tier,
    },
  });

  await prisma.referrerNotification.create({
    data: {
      referrerId: referrer.id,
      type: "commission_earned",
      message: `You earned ${formatStableDollars(commission)} (${commissionRatePercent(bps)}% of platform profit) from completed escrow "${escrow.title}". Tier: ${tier}.`,
    },
  });

  return commissionRow;
}

export function referralUrl(code: string) {
  return `${config.webOrigin}/r/${code}`;
}

