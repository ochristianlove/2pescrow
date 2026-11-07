import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { processEscrowCompletion } from "./referrals";
import { normalizeContractAddress, type ChainKey } from "./addresses";

const STATE_NAMES = [
  "Created",
  "Funded",
  "InProgress",
  "Completed",
  "Cancelled",
  "Disputed",
  "Resolved",
] as const;

const ALLOWED_EVENT_NAMES = new Set([
  "EscrowCreated",
  "StateChanged",
  "Funded",
  "ProofSubmitted",
  "Released",
  "CancelRequested",
  "CancelRefused",
  "Cancelled",
  "DisputeOpened",
  "DisputeResolved",
  "Unknown",
]);

/** Status transitions allowed only from known on-chain event names (never from client-supplied status). */
export function deriveEscrowStatusFromIndexerEvent(
  eventName: string,
  payload?: Record<string, unknown>,
): string | undefined {
  if (eventName === "Funded") return "Funded";
  if (eventName === "ProofSubmitted") return "InProgress";
  if (eventName === "Released") return "Completed";
  if (eventName === "Cancelled") return "Cancelled";
  if (eventName === "DisputeOpened") return "Disputed";
  if (eventName === "DisputeResolved") return "Resolved";
  if (eventName === "EscrowCreated") return "Created";
  if (eventName === "StateChanged") {
    const raw = payload?.newState ?? (payload as Record<string, string> | undefined)?.newState;
    const idx = raw !== undefined ? Number(raw) : NaN;
    if (!Number.isNaN(idx) && idx >= 0 && idx < STATE_NAMES.length) return STATE_NAMES[idx];
  }
  return undefined;
}

export type IndexerIngestBody = {
  chain?: "ethereum" | "tron";
  contractAddress?: string;
  eventName: string;
  txHash?: string;
  blockNumber?: string;
  payload?: Record<string, unknown>;
};

export async function handleIndexerIngest(body: IndexerIngestBody) {
  if (!ALLOWED_EVENT_NAMES.has(body.eventName)) {
    throw new IngestError(400, `Event name not allowed: ${body.eventName}`);
  }

  const chain = (body.chain || "ethereum") as ChainKey;
  const contractNorm = body.contractAddress
    ? normalizeContractAddress(chain, body.contractAddress)
    : undefined;

  const derivedStatus = deriveEscrowStatusFromIndexerEvent(body.eventName, body.payload);
  if (derivedStatus && !body.txHash) {
    throw new IngestError(400, "txHash required for on-chain status transitions");
  }

  let escrow = contractNorm
    ? await prisma.escrow.findFirst({ where: { contractAddress: contractNorm } })
    : null;

  if (!escrow && body.eventName === "EscrowCreated" && body.txHash) {
    escrow = await prisma.escrow.findFirst({ where: { createTxHash: body.txHash } });
    if (escrow && contractNorm && !escrow.contractAddress) {
      escrow = await prisma.escrow.update({
        where: { id: escrow.id },
        data: { contractAddress: contractNorm },
      });
    }
  }

  if (!escrow) {
    throw new IngestError(404, "Escrow not found — create the trade in the app before indexing");
  }

  await prisma.escrowEvent.create({
    data: {
      escrowId: escrow.id,
      eventName: body.eventName,
      txHash: body.txHash,
      blockNumber: body.blockNumber ? BigInt(body.blockNumber) : undefined,
      payload: body.payload as Prisma.InputJsonValue | undefined,
    },
  });

  if (derivedStatus) {
    const patch: { status: string; contractAddress?: string; deliveryDeadlineAt?: Date; reviewDeadlineAt?: Date } = {
      status: derivedStatus,
    };
    if (body.eventName === "EscrowCreated" && contractNorm && !escrow.contractAddress) {
      patch.contractAddress = contractNorm;
    }
    if (escrow.tradeCode && derivedStatus === "Funded") {
      patch.deliveryDeadlineAt = new Date(Date.now() + escrow.deliveryWindowHours * 60 * 60 * 1000);
    }
    if (escrow.tradeCode && derivedStatus === "InProgress") {
      patch.reviewDeadlineAt = new Date(Date.now() + escrow.reviewWindowHours * 60 * 60 * 1000);
    }
    escrow = await prisma.escrow.update({ where: { id: escrow.id }, data: patch });
    if (derivedStatus === "Completed") {
      await processEscrowCompletion(escrow.id).catch(() => undefined);
    }
    if (derivedStatus === "Disputed") {
      const existing = await prisma.dispute.findFirst({ where: { escrowId: escrow.id, status: "open" } });
      if (!existing) {
        const opener = body.payload?.opener;
        await prisma.dispute.create({
          data: {
            escrowId: escrow.id,
            openedBy: typeof opener === "string" && opener.trim() ? opener : "on-chain",
            status: "open",
          },
        });
      }
    }
  } else if (body.eventName === "EscrowCreated" && contractNorm && !escrow.contractAddress) {
    escrow = await prisma.escrow.update({
      where: { id: escrow.id },
      data: { contractAddress: contractNorm },
    });
  }

  return { escrow, eventName: body.eventName };
}

export class IngestError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
