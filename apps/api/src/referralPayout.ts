import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isEvmAddress, isTronBase58Address, normalizePartyAddress, type ChainKey } from "./addresses";
import { sendReferrerPayoutSentEmail } from "./email";
import { formatStableDollars } from "./amountFormat";

/** USDT/USDC-style 6-decimal atomic units. */
export const REFERRAL_PAYOUT_MIN_ATOMIC = 20_000_000n;

export async function referredTradeVolumeAtomic(referrerId: string): Promise<string> {
  const commissions = await prisma.referralCommission.findMany({
    where: { referrerId },
    select: { escrowId: true },
  });
  if (commissions.length === 0) return "0";
  const escrows = await prisma.escrow.findMany({
    where: { id: { in: commissions.map((c) => c.escrowId) } },
    select: { amountAtomic: true },
  });
  let vol = 0n;
  for (const e of escrows) vol += BigInt(e.amountAtomic || "0");
  return vol.toString();
}

export function validatePayoutAddress(chain: ChainKey, address: string): string {
  const trimmed = address.trim();
  if (chain === "tron") {
    if (!isTronBase58Address(trimmed)) throw new Error("Invalid Tron payout address (T… base58)");
    return normalizePartyAddress("tron", trimmed);
  }
  if (!isEvmAddress(trimmed)) throw new Error("Invalid Ethereum payout address (0x…)");
  return normalizePartyAddress("ethereum", trimmed);
}

export async function createReferralPayoutRequest(opts: {
  userId: string;
  amountAtomic: string;
  payoutAddress: string;
  payoutChain: ChainKey;
}) {
  const referrer = await prisma.referrer.findUnique({ where: { userId: opts.userId } });
  if (!referrer) throw new Error("Not enrolled in referral program");

  const pending = BigInt(referrer.pendingBalanceAtomic || "0");
  const amount = BigInt(opts.amountAtomic || "0");
  if (amount <= 0n) throw new Error("Amount must be positive");
  if (amount < REFERRAL_PAYOUT_MIN_ATOMIC) {
    throw new Error("Minimum payout is $20.00 (20 USDT equivalent in pending balance).");
  }
  if (amount > pending) throw new Error("Amount exceeds pending balance");

  const existingPending = await prisma.referralPayoutRequest.findFirst({
    where: { referrerId: referrer.id, status: "pending" },
  });
  if (existingPending) throw new Error("You already have a pending payout request");

  const normalizedAddress = validatePayoutAddress(opts.payoutChain, opts.payoutAddress);

  await assertPayableCommissionAmount(referrer.id, amount);

  return prisma.referralPayoutRequest.create({
    data: {
      referrerId: referrer.id,
      amountAtomic: amount.toString(),
      payoutAddress: normalizedAddress,
      payoutChain: opts.payoutChain,
      status: "pending",
    },
  });
}

async function assertPayableCommissionAmount(referrerId: string, amount: bigint) {
  const rows = await prisma.referralCommission.findMany({
    where: { referrerId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  let prefix = 0n;
  for (const row of rows) {
    prefix += BigInt(row.commissionAtomic);
    if (prefix === amount) return;
    if (prefix > amount) {
      throw new Error(
        "Payout amount must match your full pending balance or the total of your oldest unpaid commissions combined",
      );
    }
  }
  if (prefix !== amount) {
    throw new Error("Payout amount exceeds unpaid commission entries");
  }
}

async function markPendingCommissionsPaidFifo(
  tx: Prisma.TransactionClient,
  referrerId: string,
  targetAmount: bigint,
  payoutRequestId: string,
) {
  const rows = await tx.referralCommission.findMany({
    where: { referrerId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  let allocated = 0n;
  const now = new Date();
  for (const row of rows) {
    if (allocated >= targetAmount) break;
    const rowAmt = BigInt(row.commissionAtomic);
    if (allocated + rowAmt > targetAmount) break;
    await tx.referralCommission.update({
      where: { id: row.id },
      data: { status: "paid", paidAt: now, payoutRequestId },
    });
    allocated += rowAmt;
  }
  if (allocated !== targetAmount) {
    throw new Error(
      "Could not allocate commission ledger for this amount — request a payout that matches the sum of whole pending commissions (try your full pending balance)",
    );
  }
}

export async function setReferralPayoutRequestStatus(opts: {
  requestId: string;
  adminUserId: string;
  status: "pending" | "sent" | "rejected";
  adminNote?: string;
  log: { info: (obj: object, msg?: string) => void };
}) {
  const request = await prisma.referralPayoutRequest.findUnique({
    where: { id: opts.requestId },
    include: { referrer: { include: { user: { select: { email: true } } } } },
  });
  if (!request) throw new Error("Payout request not found");
  if (request.status === opts.status) return { ok: true, requestId: request.id, status: request.status };

  const amount = BigInt(request.amountAtomic);
  await prisma.$transaction(async (tx) => {
    const current = await tx.referralPayoutRequest.findUnique({ where: { id: request.id } });
    if (!current) throw new Error("Payout request not found");
    if (current.status !== request.status) throw new Error("Payout request changed. Refresh and try again.");

    const referrer = await tx.referrer.findUnique({ where: { id: request.referrerId } });
    if (!referrer) throw new Error("Referrer not found");
    const pending = BigInt(referrer.pendingBalanceAtomic || "0");
    const totalPaid = BigInt(referrer.totalPaidAtomic || "0");

    if (opts.status === "sent") {
      if (request.status === "sent") throw new Error("Payout is already marked paid");
      if (amount > pending) throw new Error("Referrer pending balance is lower than request amount");
      await markPendingCommissionsPaidFifo(tx, referrer.id, amount, request.id);
      await tx.referrer.update({
        where: { id: referrer.id },
        data: {
          totalPaidAtomic: (totalPaid + amount).toString(),
          pendingBalanceAtomic: (pending - amount).toString(),
        },
      });
    } else if (request.status === "sent") {
      let linkedCommissions = await tx.referralCommission.findMany({
        where: { payoutRequestId: request.id, status: "paid" },
        select: { id: true, commissionAtomic: true },
      });
      let linkedAmount = linkedCommissions.reduce((sum, commission) => sum + BigInt(commission.commissionAtomic), 0n);
      if (linkedAmount !== amount && linkedCommissions.length === 0) {
        const otherSentRequests = await tx.referralPayoutRequest.count({
          where: { referrerId: referrer.id, status: "sent", id: { not: request.id } },
        });
        if (otherSentRequests === 0) {
          linkedCommissions = await tx.referralCommission.findMany({
            where: { referrerId: referrer.id, status: "paid", payoutRequestId: null },
            select: { id: true, commissionAtomic: true },
          });
          linkedAmount = linkedCommissions.reduce((sum, commission) => sum + BigInt(commission.commissionAtomic), 0n);
        }
      }
      if (linkedAmount !== amount) {
        throw new Error("This payout predates request-level tracking and cannot be safely marked unpaid. Review the commission ledger manually.");
      }
      if (totalPaid < amount) throw new Error("Paid balance is lower than this payout amount");
      await tx.referralCommission.updateMany({
        where: { id: { in: linkedCommissions.map((commission) => commission.id) }, status: "paid" },
        data: { status: "pending", paidAt: null, payoutRequestId: null },
      });
      await tx.referrer.update({
        where: { id: referrer.id },
        data: {
          totalPaidAtomic: (totalPaid - amount).toString(),
          pendingBalanceAtomic: (pending + amount).toString(),
        },
      });
    }

    await tx.referralPayoutRequest.update({
      where: { id: request.id },
      data: {
        status: opts.status,
        adminNote: opts.status === "pending" ? null : opts.adminNote ?? null,
        reviewedAt: opts.status === "pending" ? null : new Date(),
        reviewedByUserId: opts.status === "pending" ? null : opts.adminUserId,
        sentAt: opts.status === "sent" ? new Date() : null,
      },
    });

    await tx.referrerNotification.create({
      data: {
        referrerId: referrer.id,
        type: opts.status === "sent" ? "payout_sent" : opts.status === "rejected" ? "payout_rejected" : "payout_pending",
        message: opts.status === "sent"
          ? `Your referral payout of ${formatStableDollars(amount)} was sent to ${request.payoutAddress} on ${request.payoutChain === "tron" ? "Tron" : "Ethereum"}.`
          : opts.status === "rejected"
            ? opts.adminNote
              ? `Your payout request was rejected: ${opts.adminNote}`
              : "Your payout request was rejected. Contact support if you have questions."
            : "Your payout request has been marked unpaid and returned to the pending queue. Contact support if you have questions.",
      },
    });
  });

  const email = request.referrer.user.email;
  if (opts.status === "sent" && email) {
    await sendReferrerPayoutSentEmail({
      to: email,
      amountAtomic: request.amountAtomic,
      payoutAddress: request.payoutAddress,
      payoutChain: request.payoutChain,
      log: opts.log,
    });
  }

  return { ok: true, requestId: request.id, status: opts.status };
}

export { AGENT_COMMISSION_BPS, REFERRER_COMMISSION_BPS } from "./commissions";
