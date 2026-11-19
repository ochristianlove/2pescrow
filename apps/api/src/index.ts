import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { config } from "./config";
import { registerBlogRoutes } from "./blog";
import { ethereumFunding, registerEthereumFundingRoutes } from "./ethereumFundingRoutes";
import { registerFaqRoutes } from "./faq";
import { readBrandPng, registerBrandRoutes } from "./brand";
import { prisma } from "./db";
import { broadcast, registerClient, associateClient } from "./wsHub";
import { WALLET_ROLE_TAGS } from "@2pescrow/shared";
import {
  ensureAdminUser,
  getBearer,
  hashToken,
  requireActor,
  requireAdmin,
  requirePermission,
  requireUser,
  sessionView,
  signToken,
  upsertUserByEmail,
  userMayMutateEscrow,
  verifyPassword,
  verifyToken,
  canStaffDisputeEscrow,
  canStaffResolveDispute,
} from "./auth";
import type { AuthUser } from "./auth";
import {
  buildDisputeChatSummary,
  canClaimDispute,
  canStaffReleaseFunds,
  escalationTargetTier,
  normalizeRequestedTier,
  staffOwnsDispute,
  staffTier,
} from "./disputeResolver";
import { notifyStaffUsers, staffUserIdsForTier } from "./staffNotifications";
import { sendAdminEmailMessage, sendMagicLinkEmail } from "./email";
import { runDeadlineReminders } from "./deadlineReminders";
import {
  notifySellerJoined,
  notifyWalletLinked,
  notifyTradeFunded,
  notifyDeliverySubmitted,
  notifyTradeCompleted,
  notifyCancelRequested,
  notifyCancelRefused,
  notifyTradeCancelled,
  notifyDisputeOpened,
  notifyDisputeResolved,
  notifyChatMessage,
} from "./notifications";
import { registerNotificationRoutes, startPushNotificationWorkers } from "./notificationRoutes";
import { handleIndexerIngest, IngestError } from "./indexerIngest";
import { secretsMatch } from "./secrets";
import { buildTradeRecordPdf, hashTradeSnapshot, signTradeSnapshot } from "./tradeRecord";
import {
  adminSettingsView,
  invalidateSmtpCache,
  isSmtpConfigured,
  publicSettingsView,
} from "./smtp";
import {
  attributeRefereeByCode,
  ensureReferrerForUser,
  recordReferralClick,
  referralUrl,
  processEscrowCompletion,
} from "./referrals";
import {
  createReferralPayoutRequest,
  referredTradeVolumeAtomic,
  setReferralPayoutRequestStatus,
} from "./referralPayout";
import { commissionBpsForUserId, commissionRatePercent } from "./commissions";
import {
  AgentCommissionError,
  adminUpdateAgentCommission,
  agentCommissionSummary,
  creditAgentForFinalizedDispute,
  enrollAgentCommission,
  listAgentCommissionAdmin,
  requestAgentPayout,
  setAgentPayoutStatus,
  updateAgentPayoutWallet,
} from "./agentCommission";
import { formatStableDollars } from "./amountFormat";
import { referralLeaderboardEntries } from "./referralLeaderboard";
import { agentEligibilityForUser, AgentVolumeError, assertAgentVolumeQualified } from "./agentEligibility";
import {
  agentApplicationContextForUser,
  AgentApplicationError,
  decideAgentApplication,
  grantAgentStaffAccess,
  listAgentApplications,
  submitAgentApplication,
} from "./agentApplications";
import { listAgentActivity, logAgentActivity, logAgentActivityIfAgent } from "./agentActivity";
import {
  appealDeadlineFrom,
  buildDisputeAppealBundle,
  canDecideAppeal,
  canExecuteOnChainPayout,
  isAppealWindowOpen,
  losingPartyRole,
  partyRoleOnEscrow,
} from "./disputeAppeals";
import { feedbackCategorySchema, submitFeedback } from "./feedback";
import {
  escrowWalletWhere,
  isEvmAddress,
  isTronBase58Address,
  normalizeContractAddress,
  normalizePartyAddress,
  type ChainKey,
} from "./addresses";

function isLedgerEvent(eventName: string) {
  return !eventName.startsWith("DeadlineReminder:");
}

function serializeEscrow<T extends { events?: { id: bigint; blockNumber: bigint | null; eventName?: string }[] }>(row: T) {
  return {
    ...row,
    events: row.events?.filter((e) => !e.eventName || isLedgerEvent(e.eventName)).map((e) => ({
      ...e,
      id: e.id.toString(),
      blockNumber: e.blockNumber?.toString() ?? null,
    })),
  };
}

async function ensureSettings() {
  const existing = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.platformSettings.create({
    data: {
      id: 1,
      feeRecipientWallet: config.feeRecipientWallet || "0x0000000000000000000000000000000000000000",
      resolutionMode: config.resolutionMode,
      usdcAddress: config.usdcAddress || "0x0000000000000000000000000000000000000000",
      usdtAddress: config.usdtAddress || "0x0000000000000000000000000000000000000000",
      thirdStablecoinAddress: config.thirdStablecoinAddress || "0x0000000000000000000000000000000000000000",
      factoryAddress: config.factoryAddress || null,
    },
  });
}

function makeTradeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
}

const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
function ethereumUsdcAddress() {
  const raw = (config.usdcAddress || "").trim();
  if (!raw || /^0x0{40}$/i.test(raw)) return ETHEREUM_USDC;
  return raw;
}

function tokenAddressForSymbol(symbol: "USDC" | "USDT" | "TRON_USDT", settings: { tronUsdtAddress: string | null }) {
  if (symbol === "USDC") return ethereumUsdcAddress();
  if (symbol === "USDT") return config.usdtAddress;
  return settings.tronUsdtAddress || config.tronUsdtAddress || "";
}

function formatAtomicForRecord(value: string, decimals: number) {
  try {
    const atomic = BigInt(value);
    const base = 10n ** BigInt(decimals);
    const whole = atomic / base;
    const fraction = (atomic % base).toString().padStart(decimals, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch {
    return value;
  }
}

const ACTIVE_ESCROW_STATUSES = [
  "AwaitingSeller",
  "AwaitingFunding",
  "Created",
  "Funded",
  "InProgress",
  "Disputed",
] as const;
const ACTIVE_DISPUTE_STATUSES = ["open", "ruled_pending_appeal", "appealed", "appeal_decided", "final_ruling"] as const;

async function userEscrowWhere(userId: string, addresses: string[]) {
  const walletWhere = addresses.length > 0 ? escrowWalletWhere(addresses) : null;
  return {
    OR: [
      { buyerUserId: userId },
      { sellerUserId: userId },
      ...(walletWhere ? [walletWhere] : []),
    ],
  };
}

function mapUserEscrowRow<T extends { buyerUserId?: string | null; sellerUserId?: string | null }>(
  e: T,
  userId: string,
) {
  return {
    ...serializeEscrow(e as Parameters<typeof serializeEscrow>[0]),
    partyRole: e.buyerUserId === userId ? "buyer" : e.sellerUserId === userId ? "seller" : undefined,
  };
}

async function escrowPartyRole(user: AuthUser, escrow: {
  id: string;
  buyerUserId?: string | null;
  sellerUserId?: string | null;
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  chain: string;
}) {
  if (await canStaffDisputeEscrow(user, escrow.id)) return "admin";
  if (escrow.buyerUserId === user.id) return "buyer";
  if (escrow.sellerUserId === user.id) return "seller";
  if (await userMayMutateEscrow(user, escrow)) return "party";
  return null;
}

const staffPersonSelect = { id: true, email: true, displayName: true, role: true } as const;

const disputeStaffInclude = {
  evidence: { select: { id: true, submittedBy: true, contentHash: true, note: true, fileName: true, filePath: true, createdAt: true } },
  assignedAgent: { select: staffPersonSelect },
  assignedModerator: { select: staffPersonSelect },
  assignedBy: { select: staffPersonSelect },
  owner: { select: staffPersonSelect },
  recommendedBy: { select: { id: true, email: true, displayName: true } },
  staffMessages: {
    orderBy: { createdAt: "asc" as const },
    take: 80,
    include: { author: { select: staffPersonSelect } },
  },
  escalations: { orderBy: { createdAt: "desc" as const }, take: 5 },
  appeal: true,
} as const;

async function addTradeSystemMessage(escrowId: string, body: string) {
  const message = await prisma.chatMessage.create({
    data: { escrowId, kind: "system", body },
  });
  broadcast("trade:timeline-updated", { escrowId });
  return message;
}

async function addPrivateTradeMessage(escrowId: string, authorUserId: string, recipientUserId: string, body: string) {
  const message = await prisma.chatMessage.create({
    data: { escrowId, authorUserId, recipientUserId, kind: "admin", body },
    select: { id: true, escrowId: true, authorUserId: true, recipientUserId: true, kind: true, body: true, fileName: true, createdAt: true },
  });
  broadcast("trade:timeline-updated", { escrowId });
  return message;
}

function formatDisputeMessage(template: string, values: Record<string, string>) {
  return template.replace(/\{(tradeTitle|favoredParty|appealDays|appealDeadline|tradeUrl)\}/g, (_match, key: string) => values[key] ?? "");
}

async function sendAutomatedDisputeNotification(opts: {
  enabled: boolean;
  authorUserId: string;
  recipientUserId: string;
  escrowId: string;
  subjectTemplate: string;
  messageTemplate: string;
  values: Record<string, string>;
  log: FastifyRequest["log"];
}) {
  if (!opts.enabled) return;
  const subject = formatDisputeMessage(opts.subjectTemplate, opts.values).slice(0, 180);
  const message = formatDisputeMessage(opts.messageTemplate, opts.values);
  await addPrivateTradeMessage(opts.escrowId, opts.authorUserId, opts.recipientUserId, message);
  const recipient = await prisma.user.findUnique({ where: { id: opts.recipientUserId }, select: { email: true } });
  if (!recipient?.email) return;
  const result = await sendAdminEmailMessage({ to: recipient.email, subject, message, log: opts.log });
  if (!result.sent) opts.log.info({ recipientUserId: opts.recipientUserId, reason: result.reason }, "Automated dispute email was not sent");
}

const app = Fastify({ logger: true });

async function build() {
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
await app.register(websocket);

fs.mkdirSync(config.uploadDir, { recursive: true });
registerNotificationRoutes(app);

app.get("/health", async () => ({ ok: true, chainId: config.ethereumChainId }));

app.post("/v1/auth/magic-link", async (req, reply) => {
  const body = z.object({ email: z.string().email() }).parse(req.body);
  const email = body.email.trim().toLowerCase();
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
  await upsertUserByEmail(email);
  const magicLink = `${config.webOrigin.replace(/\/$/, "")}/auth/verify?token=${raw}`;
  await prisma.magicLink.create({ data: { email, tokenHash, expiresAt } });
  const delivery = await sendMagicLinkEmail({ to: email, magicLink, log: req.log });
  if (!delivery.sent) {
    await prisma.magicLink.delete({ where: { tokenHash } }).catch(() => undefined);
    return reply.code(503).send({
      error: "Sign-in email could not be sent. Configure SMTP (SMTP_HOST, etc.) on the API server.",
    });
  }
  req.log.info({ email }, "Magic link issued and emailed");
  return {
    ok: true,
    message: "Check your email for a sign-in link.",
  };
});

app.post("/v1/auth/magic-link/verify", async (req, reply) => {
  const body = z
    .object({ token: z.string().min(16), referralCode: z.string().optional() })
    .parse(req.body);
  const tokenHash = hashToken(body.token);
  const row = await prisma.magicLink.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return reply.code(400).send({ error: "Invalid or expired magic link" });
  }
  await prisma.magicLink.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  const user = await upsertUserByEmail(row.email);
  if (body.referralCode) {
    await attributeRefereeByCode(body.referralCode, user.id);
  }
  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return {
    token,
    user: sessionView(user),
  };
});

app.post("/v1/auth/admin/login", async (req, reply) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "admin" || !user.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
    return reply.code(401).send({ error: "Invalid admin credentials" });
  }
  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return {
    token,
    user: sessionView(user),
  };
});

app.get("/v1/auth/me", async (req, reply) => {
  const bearer = getBearer(req);
  if (!bearer) return reply.code(401).send({ error: "Sign in required" });
  const payload = verifyToken(bearer);
  if (!payload) return reply.code(401).send({ error: "Invalid or expired session" });
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { wallets: true },
  });
  if (!user) return reply.code(401).send({ error: "User not found" });
  return {
    ...sessionView(user),
    wallets: user.wallets,
  };
});

app.post("/v1/auth/link-wallet", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z
    .object({
      address: z.string().min(1),
      chainKind: z.enum(["evm", "tron"]).optional(),
    })
    .parse(req.body);
  let chainKind = body.chainKind;
  if (!chainKind) {
    if (isTronBase58Address(body.address)) chainKind = "tron";
    else if (isEvmAddress(body.address)) chainKind = "evm";
    else return reply.code(400).send({ error: "Invalid wallet address" });
  }
  const address =
    chainKind === "tron"
      ? normalizePartyAddress("tron", body.address)
      : normalizePartyAddress("ethereum", body.address);
  const wallet = await prisma.wallet.upsert({
    where: { address },
    create: { address, userId: auth.id, chainKind, verifiedAt: new Date() },
    update: { userId: auth.id, chainKind, verifiedAt: new Date() },
  });
  return wallet;
});

app.patch("/v1/me/profile", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z
    .object({
      displayName: z.string().trim().min(1).max(80),
    })
    .parse(req.body);
  const updated = await prisma.user.update({
    where: { id: auth.id },
    data: { displayName: body.displayName },
    include: { wallets: true },
  });
  return {
    ...sessionView(updated),
    wallets: updated.wallets,
  };
});

app.get("/v1/me/dashboard", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const wallets = await prisma.wallet.findMany({ where: { userId: auth.id } });
  const addresses = wallets.map((w) => w.address);
  const where = await userEscrowWhere(auth.id, addresses);
  const escrows = await prisma.escrow.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { events: { take: 5, orderBy: { id: "desc" } }, disputes: true },
  });
  const active = escrows.filter((e) => ACTIVE_ESCROW_STATUSES.includes(e.status as (typeof ACTIVE_ESCROW_STATUSES)[number])).length;
  const completed = escrows.filter((e) => ["Completed", "Resolved"].includes(e.status)).length;
  const disputed = escrows.filter((e) => e.status === "Disputed").length;
  const tvl = escrows
    .filter((e) => !["Completed", "Cancelled", "Resolved"].includes(e.status))
    .reduce((sum, e) => sum + BigInt(e.amountAtomic || "0"), 0n);
  const myTrades = escrows.map((e) => mapUserEscrowRow(e, auth.id));
  return {
    user: auth,
    wallets,
    stats: {
      activeEscrows: active,
      completed,
      inDispute: disputed,
      totalValueLockedAtomic: tvl.toString(),
      totalEscrows: escrows.length,
    },
    myTrades,
    latestEscrows: myTrades,
  };
});

app.get("/v1/me/trades", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const wallets = await prisma.wallet.findMany({ where: { userId: auth.id } });
  const addresses = wallets.map((w) => w.address);
  const where = await userEscrowWhere(auth.id, addresses);
  const escrows = await prisma.escrow.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { events: { take: 5, orderBy: { id: "desc" } } },
  });
  return escrows.map((e) => mapUserEscrowRow(e, auth.id));
});

app.get("/v1/referral/landing/:code", async (req, reply) => {
  const { code } = req.params as { code: string };
  const referrer = await recordReferralClick(code);
  if (!referrer) return reply.code(404).send({ error: "Invalid referral link" });
  const owner = await prisma.user.findUnique({ where: { id: referrer.userId }, select: { displayName: true, email: true } });
  return {
    ok: true,
    referralCode: referrer.referralCode,
    referrerDisplayName:
      referrer.displayName?.trim() ||
      owner?.displayName?.trim() ||
      owner?.email?.trim() ||
      "A 2Pescrow member",
    signUpUrl: `${config.webOrigin}/signin?ref=${referrer.referralCode}`,
  };
});

app.get("/v1/me/agent-commission", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  try {
    return await agentCommissionSummary(auth.id);
  } catch (e) {
    if (e instanceof AgentCommissionError) return reply.code(e.statusCode).send({ error: e.message });
    throw e;
  }
});

app.post("/v1/me/agent-commission/enroll", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z.object({
    displayName: z.string().trim().min(1).max(80),
    payoutAddress: z.string().trim().min(1),
    payoutChain: z.enum(["ethereum", "tron"]),
  }).parse(req.body);
  try {
    return await enrollAgentCommission({ userId: auth.id, ...body });
  } catch (e) {
    if (e instanceof AgentCommissionError) return reply.code(e.statusCode).send({ error: e.message });
    if (e instanceof Error) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

app.patch("/v1/me/agent-commission/payout-wallet", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z.object({
    payoutAddress: z.string().trim().min(1),
    payoutChain: z.enum(["ethereum", "tron"]),
  }).parse(req.body);
  try {
    return await updateAgentPayoutWallet({ userId: auth.id, ...body });
  } catch (e) {
    if (e instanceof AgentCommissionError) return reply.code(e.statusCode).send({ error: e.message });
    if (e instanceof Error) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

app.post("/v1/me/agent-commission/payout-requests", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  try {
    return await requestAgentPayout(auth.id);
  } catch (e) {
    if (e instanceof AgentCommissionError) return reply.code(e.statusCode).send({ error: e.message });
    throw e;
  }
});

app.get("/v1/admin/agent-commissions", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  return listAgentCommissionAdmin();
});

app.patch("/v1/admin/agent-commissions/:userId", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { userId } = req.params as { userId: string };
  const body = z.object({
    commissionBps: z.number().int().min(0).max(500).nullable().optional(),
    coolingOffEndsAt: z.string().nullable().optional(),
    waiveCoolingOff: z.boolean().optional(),
  }).parse(req.body);
  const coolingOffEndsAt = body.coolingOffEndsAt ? new Date(body.coolingOffEndsAt) : null;
  if (body.coolingOffEndsAt && (!coolingOffEndsAt || Number.isNaN(coolingOffEndsAt.getTime()))) {
    return reply.code(400).send({ error: "Cooling-off end must be a valid date" });
  }
  try {
    return await adminUpdateAgentCommission({
      userId,
      commissionBps: body.commissionBps,
      waiveCoolingOff: body.waiveCoolingOff,
      coolingOffEndsAt,
    });
  } catch (e) {
    if (e instanceof AgentCommissionError) return reply.code(e.statusCode).send({ error: e.message });
    throw e;
  }
});

app.post("/v1/admin/agent-payout-requests/:id/status", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z.object({
    status: z.enum(["sent", "rejected"]),
    adminNote: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  try {
    return await setAgentPayoutStatus({ requestId: id, status: body.status, adminNote: body.adminNote });
  } catch (e) {
    if (e instanceof AgentCommissionError) return reply.code(e.statusCode).send({ error: e.message });
    throw e;
  }
});

app.post("/v1/referral/register", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z.object({ displayName: z.string().min(1).max(80).optional() }).parse(req.body ?? {});
  const owner = await prisma.user.findUnique({
    where: { id: auth.id },
    select: { displayName: true, email: true },
  });
  const publicName =
    body.displayName?.trim() || owner?.displayName?.trim() || owner?.email?.trim() || undefined;
  const referrer = await ensureReferrerForUser(auth.id, publicName);
  return {
    ...referrer,
    referralUrl: referralUrl(referrer.referralCode),
  };
});

app.get("/v1/me/referral", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const referrer = await prisma.referrer.findUnique({
    where: { userId: auth.id },
    include: {
      notifications: { orderBy: { createdAt: "desc" }, take: 20 },
      commissions: { orderBy: { createdAt: "desc" }, take: 20 },
      referees: { include: { referee: { select: { email: true, createdAt: true } } } },
    },
  });
  if (!referrer) {
    return {
      enrolled: false,
      tierInfo: { bronze: 0, silver: 5, gold: 20, platinum: 50 },
      canUseReferralWhileAgent: auth.role === "agent",
      dualEarningsNote:
        auth.role === "agent"
          ? "Referral earnings stay at 2% of platform profit and stack with case commission. Opt in separately before a finalized dispute can pay you."
          : undefined,
    };
  }
  const [referredTradeVolumeAtomicVal, payoutRequests] = await Promise.all([
    referredTradeVolumeAtomic(referrer.id),
    prisma.referralPayoutRequest.findMany({
      where: { referrerId: referrer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const commissionBps = await commissionBpsForUserId(auth.id);
  return {
    enrolled: true,
    ...referrer,
    referralUrl: referralUrl(referrer.referralCode),
    commissionBps,
    commissionRatePercent: commissionRatePercent(commissionBps),
    isAgentRate: false,
    canUseReferralWhileAgent: true,
    dualEarningsNote:
      auth.role === "agent"
        ? "Referral earnings stay at 2% of platform profit and stack with case commission. Opt in separately before a finalized dispute can pay you."
        : undefined,
    referredTradeVolumeAtomic: referredTradeVolumeAtomicVal,
    payoutRequests,
    referees: referrer.referees.map((r) => ({
      email: r.referee.email,
      joinedAt: r.referee.createdAt,
      attributedAt: r.attributedAt,
    })),
  };
});

app.post("/v1/me/referral/payout-requests", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z
    .object({
      amountAtomic: z.string().regex(/^\d+$/),
      payoutAddress: z.string().min(10).max(128),
      payoutChain: z.enum(["ethereum", "tron"]),
    })
    .parse(req.body ?? {});
  try {
    const row = await createReferralPayoutRequest({
      userId: auth.id,
      amountAtomic: body.amountAtomic,
      payoutAddress: body.payoutAddress,
      payoutChain: body.payoutChain,
    });
    return { ok: true, request: row };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reply.code(400).send({ error: message });
  }
});

app.post("/v1/me/referral/notifications/read", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const referrer = await prisma.referrer.findUnique({ where: { userId: auth.id } });
  if (!referrer) return { ok: true };
  await prisma.referrerNotification.updateMany({
    where: { referrerId: referrer.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
});

app.get("/v1/admin/referrals", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const referrers = await prisma.referrer.findMany({
    orderBy: { totalEarnedAtomic: "desc" },
    include: {
      user: { select: { email: true } },
      commissions: { where: { status: "pending" } },
    },
  });
  return referrers.map((r) => ({
    id: r.id,
    email: r.user.email,
    displayName: r.displayName,
    referralCode: r.referralCode,
    tier: r.tier,
    successfulReferrals: r.successfulReferrals,
    totalEarnedAtomic: r.totalEarnedAtomic,
    totalPaidAtomic: r.totalPaidAtomic,
    pendingBalanceAtomic: r.pendingBalanceAtomic,
    pendingCommissionCount: r.commissions.length,
    referralUrl: referralUrl(r.referralCode),
  }));
});

app.get("/v1/admin/referral-leaderboard", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const settings = await ensureSettings();
  if (!settings.referralLeaderboardEnabled) {
    return reply.code(404).send({ error: "Referral leaderboard is disabled" });
  }
  const entries = await referralLeaderboardEntries(50);
  return { enabled: true, entries };
});

app.get("/v1/admin/analytics", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;

  // Monetary totals are read from indexed contract logs and kept separate by
  // chain/token so different assets are never added together.
  const [events, usersByMonth, clicksByMonth, escrowsByMonth] = await Promise.all([
    prisma.escrowEvent.findMany({
      where: {
        eventName: { in: ["Funded", "Released", "DisputeResolved", "Cancelled"] },
        escrow: {
          contractAddress: { not: null },
          OR: [
            { chain: "ethereum", chainId: 1 },
            { chain: "tron", chainId: 728126428 },
          ],
        },
      },
      select: {
        escrowId: true,
        eventName: true,
        txHash: true,
        payload: true,
        createdAt: true,
        escrow: { select: { chain: true, tokenSymbol: true, amountAtomic: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ select: { createdAt: true } }),
    prisma.referralClick.findMany({ select: { visitedAt: true } }),
    prisma.escrow.findMany({
      where: {
        OR: [
          { chain: "ethereum", chainId: 1 },
          { chain: "tron", chainId: 728126428 },
        ],
      },
      select: { createdAt: true },
    }),
  ]);

  const months = new Map<string, {
    month: string;
    newUsers: number;
    referralVisits: number;
    tradesCreated: number;
    tradesFunded: number;
    tradesCompleted: number;
    assets: Map<string, {
      chain: string;
      tokenSymbol: string;
      fundedVolumeAtomic: bigint;
      completedVolumeAtomic: bigint;
      feesAtomic: bigint;
      creationFeesAtomic: bigint;
      successfulTradeFeesAtomic: bigint;
      otherFeesAtomic: bigint;
      feeEventsCount: number;
      feeEventsReported: number;
      feeEventsMissing: number;
    }>;
  }>();
  const monthFor = (date: Date) => {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    let row = months.get(key);
    if (!row) {
      row = { month: key, newUsers: 0, referralVisits: 0, tradesCreated: 0, tradesFunded: 0, tradesCompleted: 0, assets: new Map() };
      months.set(key, row);
    }
    return row;
  };
  const isAtomic = (value: unknown) =>
    typeof value === "bigint" ||
    (typeof value === "string" && (/^\d+$/.test(value) || /^0x[\da-f]+$/i.test(value))) ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
  const atomic = (value: unknown) => {
    if (typeof value === "bigint") return value;
    if (typeof value === "string" && (/^\d+$/.test(value) || /^0x[\da-f]+$/i.test(value))) return BigInt(value);
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    return 0n;
  };
  for (const user of usersByMonth) monthFor(user.createdAt).newUsers++;
  for (const click of clicksByMonth) monthFor(click.visitedAt).referralVisits++;
  for (const escrow of escrowsByMonth) monthFor(escrow.createdAt).tradesCreated++;

  // Indexer retries may ingest the same log more than once; count one event
  // per escrow, event, and transaction hash in reporting.
  const seen = new Set<string>();
  for (const event of events) {
    const row = monthFor(event.createdAt);
    const uniqueKey = `${event.escrowId}:${event.eventName}:${event.txHash ?? event.createdAt.toISOString()}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    const key = `${event.escrow.chain}:${event.escrow.tokenSymbol}`;
    let asset = row.assets.get(key);
    if (!asset) {
      asset = {
        chain: event.escrow.chain,
        tokenSymbol: event.escrow.tokenSymbol,
        fundedVolumeAtomic: 0n,
        completedVolumeAtomic: 0n,
        feesAtomic: 0n,
        creationFeesAtomic: 0n,
        successfulTradeFeesAtomic: 0n,
        otherFeesAtomic: 0n,
        feeEventsCount: 0,
        feeEventsReported: 0,
        feeEventsMissing: 0,
      };
      row.assets.set(key, asset);
    }
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    const recordFee = (field: string, category: "creation" | "successfulTrade" | "other") => {
      asset.feeEventsCount++;
      const fee = payload[field];
      if (isAtomic(fee)) {
        asset.feeEventsReported++;
        const amount = atomic(fee);
        asset.feesAtomic += amount;
        if (category === "creation") asset.creationFeesAtomic += amount;
        else if (category === "successfulTrade") asset.successfulTradeFeesAtomic += amount;
        else asset.otherFeesAtomic += amount;
      } else {
        asset.feeEventsMissing++;
      }
    };
    if (event.eventName === "Funded") {
      row.tradesFunded++;
      asset.fundedVolumeAtomic += atomic(payload.escrowAmount) || atomic(event.escrow.amountAtomic);
      recordFee("creationFee", "creation");
    }
    if (event.eventName === "Released") {
      row.tradesCompleted++;
      const payoutAmount = isAtomic(payload.toSeller) && isAtomic(payload.toFee)
        ? atomic(payload.toSeller) + atomic(payload.toFee)
        : atomic(event.escrow.amountAtomic);
      asset.completedVolumeAtomic += payoutAmount;
      recordFee("toFee", "successfulTrade");
    }
    if (event.eventName === "DisputeResolved") {
      row.tradesCompleted++;
      const payoutAmount = isAtomic(payload.toBuyer) && isAtomic(payload.toSeller) && isAtomic(payload.toFee)
        ? atomic(payload.toBuyer) + atomic(payload.toSeller) + atomic(payload.toFee)
        : atomic(event.escrow.amountAtomic);
      asset.completedVolumeAtomic += payoutAmount;
      recordFee("toFee", "successfulTrade");
    }
    if (event.eventName === "Cancelled") recordFee("cancelCommission", "other");
  }

  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  monthFor(now);
  const firstKey = [...months.keys()].sort()[0] ?? currentKey;
  const [startYear, startMonth] = firstKey.split("-").map(Number);
  const allMonths = new Map<string, ReturnType<typeof monthFor>>();
  for (let cursor = new Date(Date.UTC(startYear, startMonth - 1, 1)); cursor <= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    allMonths.set(key, months.get(key) ?? { month: key, newUsers: 0, referralVisits: 0, tradesCreated: 0, tradesFunded: 0, tradesCompleted: 0, assets: new Map() });
  }
  return {
    generatedAt: now.toISOString(),
    definitions: {
      feeRevenue: "Gross contract fees reported in indexed events, before referral commission liabilities. Creation fees are reported from Funded events; successful-trade fees from Released and seller-favored DisputeResolved events; cancellation fees are shown separately as other fees. Missing fee fields are excluded and counted as missing.",
      tradesCreated: "Application trade records created, whether or not they were funded.",
      referralVisits: "Visits to valid referral links only; this is not total website page traffic.",
      amounts: "Funded amount is the escrow value funded. Completed amount is the value transferred out on Released or DisputeResolved. Gross platform fees include creation fees, release/dispute fees, and cancel commissions. Amounts stay grouped by chain and token; no cross-token USD conversion is applied.",
    },
    months: [...allMonths.values()].map((row) => ({
      month: row.month,
      newUsers: row.newUsers,
      referralVisits: row.referralVisits,
      tradesCreated: row.tradesCreated,
      tradesFunded: row.tradesFunded,
      tradesCompleted: row.tradesCompleted,
      assets: [...row.assets.values()].map((asset) => ({
        ...asset,
        fundedVolumeAtomic: asset.fundedVolumeAtomic.toString(),
        completedVolumeAtomic: asset.completedVolumeAtomic.toString(),
        feesAtomic: asset.feesAtomic.toString(),
        creationFeesAtomic: asset.creationFeesAtomic.toString(),
        successfulTradeFeesAtomic: asset.successfulTradeFeesAtomic.toString(),
        otherFeesAtomic: asset.otherFeesAtomic.toString(),
        feeEventsCount: asset.feeEventsCount,
        feeEventsReported: asset.feeEventsReported,
        feeEventsMissing: asset.feeEventsMissing,
      })),
    })),
  };
});

app.post("/v1/admin/referrals/:id/payout", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  return reply.code(410).send({ error: "Referral payouts can only be recorded from a payout request with a submitted wallet." });
});

app.get("/v1/admin/users", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const q = z
    .object({
      q: z.string().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    .parse(req.query ?? {});
  const term = q.q?.trim();
  const users = await prisma.user.findMany({
    where: term
      ? {
          OR: [
            { email: { contains: term, mode: "insensitive" } },
            { displayName: { contains: term, mode: "insensitive" } },
          ],
        }
      : undefined,
    take: q.limit ?? 100,
    orderBy: { createdAt: "desc" },
    include: {
      wallets: { select: { address: true, chainKind: true } },
      referrer: { select: { id: true, referralCode: true, tier: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    permissions: u.role === "admin" ? ["disputes", "disputes_release", "blog", "email"] : u.permissions,
    createdAt: u.createdAt,
    wallets: u.wallets,
    referrer: u.referrer,
  }));
});

app.patch("/v1/admin/users/:id/access", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z
    .object({
      staffRole: z.enum(["user", "agent", "moderator"]).default("user"),
      permissions: z.array(z.enum(["disputes", "disputes_release", "blog", "email"])).max(4),
      moderator: z.boolean().optional(),
    })
    .parse(req.body ?? {});
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return reply.code(404).send({ error: "User not found" });
  if (target.role === "admin" || target.id === admin.id) {
    return reply.code(403).send({ error: "Super admin access cannot be changed here" });
  }
  const staffRole = body.moderator === true && body.staffRole === "user" ? "moderator" : body.staffRole;
  const permissions = staffRole === "user" ? [] : [...new Set(body.permissions)];
  let updated;
  if (staffRole === "agent" && permissions.includes("disputes")) {
    try {
      updated = await grantAgentStaffAccess(target.id);
    } catch (e) {
      if (e instanceof AgentVolumeError) {
        return reply.code(400).send({ error: e.message, agentEligibility: e.detail });
      }
      if (e instanceof AgentApplicationError) {
        return reply.code(e.statusCode).send({ error: e.message, ...e.extra });
      }
      throw e;
    }
  } else {
    updated = await prisma.user.update({
      where: { id },
      data: { role: staffRole, permissions },
    });
  }
  return sessionView(updated);
});

app.get("/v1/admin/users/:id/agent-eligibility", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const { id } = req.params as { id: string };
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return reply.code(404).send({ error: "User not found" });
  return agentEligibilityForUser(id);
});

app.get("/v1/me/agent-eligibility", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  return agentEligibilityForUser(auth.id);
});

app.get("/v1/me/agent-application", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  return agentApplicationContextForUser(auth.id);
});

app.post("/v1/me/agent-application", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z.object({ note: z.string().trim().max(2000).optional() }).parse(req.body ?? {});
  try {
    const application = await submitAgentApplication(auth.id, body.note);
    return reply.code(201).send(application);
  } catch (e) {
    if (e instanceof AgentApplicationError) {
      return reply.code(e.statusCode).send({ error: e.message, ...e.extra });
    }
    throw e;
  }
});

app.get("/v1/admin/agent-applications", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const q = z
    .object({ status: z.enum(["pending", "approved", "rejected"]).optional() })
    .parse(req.query ?? {});
  return listAgentApplications(q.status);
});

app.post("/v1/admin/agent-applications/:id/decide", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z
    .object({ approve: z.boolean(), reviewNote: z.string().trim().max(2000).optional() })
    .parse(req.body ?? {});
  try {
    return await decideAgentApplication(id, admin.id, body.approve, body.reviewNote);
  } catch (e) {
    if (e instanceof AgentApplicationError) {
      return reply.code(e.statusCode).send({ error: e.message, ...e.extra });
    }
    if (e instanceof AgentVolumeError) {
      return reply.code(400).send({ error: e.message, agentEligibility: e.detail });
    }
    throw e;
  }
});

app.get("/v1/admin/agent-activity", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const q = z.object({ limit: z.coerce.number().int().min(1).max(200).optional(), agentUserId: z.string().uuid().optional() }).parse(req.query ?? {});
  return listAgentActivity({ limit: q.limit, agentUserId: q.agentUserId });
});

app.get("/v1/me/agent-activity", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  if (auth.role !== "agent" && auth.role !== "admin") {
    return reply.code(403).send({ error: "Agents and admins only" });
  }
  const q = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query ?? {});
  return listAgentActivity({
    limit: q.limit,
    agentUserId: auth.role === "agent" ? auth.id : undefined,
  });
});

app.get("/v1/admin/referral-payout-requests", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const q = z.object({ status: z.enum(["pending", "sent", "rejected", "all"]).optional() }).parse(req.query ?? {});
  const statusFilter = q.status && q.status !== "all" ? q.status : undefined;
  const rows = await prisma.referralPayoutRequest.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      referrer: {
        include: { user: { select: { email: true, displayName: true } } },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    amountAtomic: r.amountAtomic,
    payoutAddress: r.payoutAddress,
    payoutChain: r.payoutChain,
    adminNote: r.adminNote,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    sentAt: r.sentAt,
    referrer: {
      id: r.referrer.id,
      email: r.referrer.user.email,
      displayName: r.referrer.displayName,
      tier: r.referrer.tier,
      successfulReferrals: r.referrer.successfulReferrals,
      pendingBalanceAtomic: r.referrer.pendingBalanceAtomic,
      totalEarnedAtomic: r.referrer.totalEarnedAtomic,
    },
  }));
});

app.post("/v1/admin/referral-payout-requests/:id/approve", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {});
  try {
    return await setReferralPayoutRequestStatus({
      requestId: id,
      adminUserId: admin.id,
      status: "sent",
      adminNote: body.note,
      log: req.log,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reply.code(400).send({ error: message });
  }
});

app.post("/v1/admin/referral-payout-requests/:id/reject", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
  try {
    return await setReferralPayoutRequestStatus({
      requestId: id,
      adminUserId: admin.id,
      status: "rejected",
      adminNote: body.reason,
      log: req.log,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reply.code(400).send({ error: message });
  }
});

app.patch("/v1/admin/referral-payout-requests/:id/status", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z.object({
    status: z.enum(["pending", "sent", "rejected"]),
    note: z.string().trim().max(500).optional(),
  }).parse(req.body ?? {});
  try {
    return await setReferralPayoutRequestStatus({
      requestId: id,
      adminUserId: admin.id,
      status: body.status,
      adminNote: body.note,
      log: req.log,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reply.code(400).send({ error: message });
  }
});

app.get("/v1/me/history", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const wallets = await prisma.wallet.findMany({ where: { userId: auth.id } });
  const addresses = wallets.map((w) => w.address);
  const where = await userEscrowWhere(auth.id, addresses);
  const escrows = await prisma.escrow.findMany({
    where,
    select: { id: true, chain: true },
  });
  const ids = escrows.map((e) => e.id);
  const parsed = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z.string().optional(),
  }).safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid history page." });
  const limit = parsed.data.limit ?? 5;
  let cursorId: bigint | undefined;
  if (parsed.data.cursor) {
    try {
      cursorId = BigInt(parsed.data.cursor);
    } catch {
      return reply.code(400).send({ error: "Invalid history cursor." });
    }
  }
  if (ids.length === 0) return { items: [], nextCursor: null };
  const events = await prisma.escrowEvent.findMany({
    where: {
      escrowId: { in: ids },
      NOT: { eventName: { startsWith: "DeadlineReminder:" } },
      ...(cursorId ? { id: { lt: cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { escrow: true },
  });
  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;
  return {
    items: page.map((e) => ({
      id: e.id.toString(),
      eventName: e.eventName,
      txHash: e.txHash,
      createdAt: e.createdAt,
      escrowId: e.escrowId,
      escrowTitle: e.escrow.title,
      status: e.escrow.status,
      amountAtomic: e.escrow.amountAtomic,
      tokenSymbol: e.escrow.tokenSymbol,
      explorerTx: e.txHash
        ? e.escrow.chain === "tron"
          ? `https://tronscan.org/#/transaction/${e.txHash}`
          : `https://etherscan.io/tx/${e.txHash}`
        : null,
    })),
    nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
  };
});

app.get("/v1/config/wallets", async () => {
  const settings = await ensureSettings();
  return {
    roles: WALLET_ROLE_TAGS,
    addresses: {
      [WALLET_ROLE_TAGS.FEE_RECIPIENT_WALLET]: config.feeRecipientWallet,
      [WALLET_ROLE_TAGS.DEPLOYER_WALLET]: config.deployerWallet,
      [WALLET_ROLE_TAGS.BUYER_WALLET]: config.buyerWallet,
      [WALLET_ROLE_TAGS.SELLER_WALLET]: config.sellerWallet,
      [WALLET_ROLE_TAGS.AGENT_WALLET]: config.agentWallet,
    },
    tokens: {
      USDC: ethereumUsdcAddress(),
      USDT: config.usdtAddress,
      TRON_USDT: settings.tronUsdtAddress || config.tronUsdtAddress || null,
    },
    factoryAddress: config.factoryAddress,
    ethereumExplorer: "https://etherscan.io",
    tronSupportEnabled: settings.tronSupportEnabled,
    tronFactoryAddress: settings.tronFactoryAddress || config.tronFactoryAddress || null,
    tronExplorer: "https://tronscan.org",
  };
});

app.get("/v1/settings", async () => publicSettingsView(await ensureSettings()));

registerBlogRoutes(app);
registerEthereumFundingRoutes(app);
registerFaqRoutes(app);
registerBrandRoutes(app);

app.post("/v1/feedback", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z
    .object({
      category: feedbackCategorySchema.optional(),
      subject: z.string().max(200).optional(),
      message: z.string().min(10).max(8000),
      pagePath: z.string().max(500).optional(),
    })
    .parse(req.body ?? {});

  const settings = await ensureSettings();
  if (!settings.feedbackEnabled) {
    return reply.code(403).send({ error: "Feedback is currently disabled" });
  }

  try {
    const result = await submitFeedback({
      userId: auth.id,
      email: auth.email,
      displayName: auth.displayName,
      category: body.category || "other",
      subject: body.subject,
      message: body.message,
      pagePath: body.pagePath,
      log: req.log,
    });
    return {
      ok: true,
      id: result.id,
      emailSent: result.emailSent,
      message: result.emailSent
        ? "Thank you — your feedback was sent to the team."
        : "Thank you — we saved your feedback. Email delivery is pending (check SMTP in admin).",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reply.code(400).send({ error: message });
  }
});

app.get("/v1/admin/feedback", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const q = z
    .object({
      status: z.enum(["new", "reviewed", "archived", "all"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    .parse(req.query ?? {});
  const where = q.status && q.status !== "all" ? { status: q.status } : undefined;
  const rows = await prisma.feedbackSubmission.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: q.limit ?? 100,
  });
  return rows;
});

app.patch("/v1/admin/feedback/:id", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const { id } = req.params as { id: string };
  const body = z
    .object({
      status: z.enum(["new", "reviewed", "archived"]).optional(),
      adminNote: z.string().max(2000).nullable().optional(),
    })
    .parse(req.body ?? {});
  const existing = await prisma.feedbackSubmission.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: "Not found" });
  return prisma.feedbackSubmission.update({
    where: { id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.adminNote !== undefined ? { adminNote: body.adminNote } : {}),
    },
  });
});

app.delete("/v1/admin/feedback/:id", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const { id } = req.params as { id: string };
  try {
    await prisma.feedbackSubmission.delete({ where: { id } });
    return { ok: true };
  } catch {
    return reply.code(404).send({ error: "Not found" });
  }
});

app.get("/v1/admin/settings", async (req, reply) => {
  const actor = await requireActor(req, reply);
  if (!actor) return;
  const settings = adminSettingsView(await ensureSettings());
  if (actor.role === "admin") return settings;
  if (actor.role === "moderator" && actor.permissions.includes("email")) {
    return emailSettingsView(settings);
  }
  return reply.code(403).send({ error: "You do not have this privilege" });
});

app.get("/v1/agents", async () => {
  return prisma.agent.findMany({ where: { active: true }, orderBy: { disputesResolved: "desc" } });
});

app.post("/v1/agents", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const body = z
    .object({
      walletAddress: z.string().optional(),
      userId: z.string().uuid().optional(),
      displayName: z.string(),
      feeBps: z.number().int().min(0).max(1000).default(500),
      externalContact: z.string().max(2000).optional(),
    })
    .parse(req.body);
  if (!body.userId && !body.walletAddress) {
    return reply.code(400).send({ error: "Provide userId (app agent) or walletAddress (legacy listing)" });
  }
  if (body.userId) {
    const agent = await prisma.agent.upsert({
      where: { userId: body.userId },
      create: {
        userId: body.userId,
        displayName: body.displayName,
        feeBps: body.feeBps,
        externalContact: body.externalContact,
        walletAddress: body.walletAddress?.toLowerCase() ?? null,
      },
      update: {
        displayName: body.displayName,
        feeBps: body.feeBps,
        externalContact: body.externalContact,
        active: true,
        walletAddress: body.walletAddress?.toLowerCase() ?? undefined,
      },
    });
    return agent;
  }
  const agent = await prisma.agent.upsert({
    where: { walletAddress: body.walletAddress!.toLowerCase() },
    create: {
      walletAddress: body.walletAddress!.toLowerCase(),
      displayName: body.displayName,
      feeBps: body.feeBps,
      externalContact: body.externalContact,
    },
    update: { displayName: body.displayName, feeBps: body.feeBps, externalContact: body.externalContact, active: true },
  });
  return agent;
});

const createEscrowSchema = z.object({
  chain: z.enum(["ethereum", "tron"]).default("ethereum"),
  buyerAddress: z.string().optional(),
  sellerAddress: z.string().optional(),
  codeFlow: z.boolean().optional(),
  deliveryWindowHours: z.number().int().min(24).max(2160).optional(),
  reviewWindowHours: z.number().int().min(24).max(2160).optional(),
  tokenSymbol: z.enum(["USDC", "USDT", "TRON_USDT"]),
  amountAtomic: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  agentAddress: z.string().optional(),
  contractAddress: z.string().optional(),
  createTxHash: z.string().optional(),
});

app.post("/v1/escrows", async (req, reply) => {
  const body = createEscrowSchema.parse(req.body);
  const settings = await ensureSettings();
  const chain = body.chain as ChainKey;

  if (body.codeFlow) {
    const auth = await requireUser(req, reply);
    if (!auth) return;
    if (!body.description?.trim()) {
      return reply.code(400).send({ error: "Contract terms are required" });
    }
    if (body.sellerAddress) return reply.code(400).send({ error: "Seller joins with the trade code" });
    if (chain === "tron" && !settings.tronSupportEnabled) {
      return reply.code(403).send({ error: "Tron support is disabled by platform admin" });
    }
    if (chain === "tron" && body.tokenSymbol !== "TRON_USDT") {
      return reply.code(400).send({ error: "Tron escrows only support TRON_USDT (TRC-20) for now" });
    }
    if (chain !== "tron" && body.tokenSymbol === "TRON_USDT") {
      return reply.code(400).send({ error: "TRON_USDT requires chain=tron" });
    }
    const buyerAddress = body.buyerAddress
      ? normalizePartyAddress(chain, body.buyerAddress)
      : null;
    if (buyerAddress) {
      const wallet = await prisma.wallet.findFirst({
        where: { userId: auth.id, address: buyerAddress, chainKind: chain === "tron" ? "tron" : "evm" },
      });
      if (!wallet) return reply.code(403).send({ error: "Connect and link your wallet before using it on this trade" });
    }
    const tokenAddress = tokenAddressForSymbol(body.tokenSymbol, settings) || "0x0000000000000000000000000000000000000000";
    let tradeCode = makeTradeCode();
    while (await prisma.escrow.findUnique({ where: { tradeCode } })) tradeCode = makeTradeCode();
    const escrow = await prisma.escrow.create({
      data: {
        chain,
        chainId: chain === "tron" ? config.tronAppChainId : config.ethereumChainId,
        buyerAddress,
        sellerAddress: null,
        tradeCode,
        buyerUserId: auth.id,
        tokenAddress,
        tokenSymbol: body.tokenSymbol,
        amountAtomic: body.amountAtomic,
        title: body.title,
        description: body.description,
        agentAddress: null,
        status: "AwaitingSeller",
        joinDeadlineAt: hoursFromNow(settings.joinWindowHours),
        deliveryWindowHours: body.deliveryWindowHours ?? settings.deliveryWindowHours,
        reviewWindowHours: body.reviewWindowHours ?? settings.reviewWindowHours,
      },
    });
    await prisma.escrowEvent.create({
      data: { escrowId: escrow.id, eventName: "TradeCreated", payload: { tradeCode } },
    });
    await addTradeSystemMessage(escrow.id, "Buyer created the trade and shared a join code.");
    broadcast("trade:timeline-updated", { escrowId: escrow.id });
    return escrow;
  }

  if (!body.buyerAddress || !body.sellerAddress) {
    return reply.code(400).send({ error: "Buyer and seller wallet addresses are required for a wallet-address trade" });
  }

  if (chain === "tron") {
    if (!settings.tronSupportEnabled) {
      return reply.code(403).send({ error: "Tron support is disabled by platform admin" });
    }
    if (body.tokenSymbol !== "TRON_USDT") {
      return reply.code(400).send({ error: "Tron escrows only support TRON_USDT (TRC-20) for now" });
    }
  } else if (body.tokenSymbol === "TRON_USDT") {
    return reply.code(400).send({ error: "TRON_USDT requires chain=tron" });
  }

  const tokenAddress = tokenAddressForSymbol(body.tokenSymbol, settings);
  if (!tokenAddress) return reply.code(400).send({ error: "Token address not configured" });

  const buyerAddress = normalizePartyAddress(chain, body.buyerAddress);
  const sellerAddress = normalizePartyAddress(chain, body.sellerAddress);
  const agentAddress = body.agentAddress ? normalizePartyAddress(chain, body.agentAddress) : undefined;
  const contractAddress = body.contractAddress
    ? normalizeContractAddress(chain, body.contractAddress)
    : undefined;

  const escrow = await prisma.escrow.create({
    data: {
      chain,
      chainId: chain === "tron" ? config.tronAppChainId : config.ethereumChainId,
      buyerAddress,
      sellerAddress,
      agentAddress,
      tokenAddress,
      tokenSymbol: body.tokenSymbol,
      amountAtomic: body.amountAtomic,
      title: body.title,
      description: body.description,
      contractAddress,
      createTxHash: body.createTxHash,
      status: "Created",
    },
  });
  broadcast("escrow:created", escrow);
  return escrow;
});

app.get("/v1/escrows/code/:code", async (req, reply) => {
  const { code } = req.params as { code: string };
  const escrow = await prisma.escrow.findUnique({ where: { tradeCode: code.trim().toUpperCase() } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Trade code not found" });
  if (escrow.chain === "tron" && !(await ensureSettings()).tronSupportEnabled) {
    return reply.code(403).send({ error: "TRC-20 trading is temporarily unavailable" });
  }
  if (escrow.status !== "AwaitingSeller" || (escrow.joinDeadlineAt && escrow.joinDeadlineAt < new Date())) {
    return reply.code(410).send({ error: "This trade code has expired or has already been used" });
  }
  return {
    id: escrow.id,
    tradeCode: escrow.tradeCode,
    title: escrow.title,
    description: escrow.description,
    chain: escrow.chain,
    tokenSymbol: escrow.tokenSymbol,
    amountAtomic: escrow.amountAtomic,
    joinDeadlineAt: escrow.joinDeadlineAt,
  };
});

app.post("/v1/escrows/join", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z.object({ code: z.string().min(4).max(32) }).parse(req.body);
  const code = body.code.trim().toUpperCase();
  const escrow = await prisma.escrow.findUnique({ where: { tradeCode: code } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Trade code not found" });
  if (escrow.chain === "tron" && !(await ensureSettings()).tronSupportEnabled) {
    return reply.code(403).send({ error: "TRC-20 trading is temporarily unavailable" });
  }
  if (escrow.buyerUserId === auth.id) return reply.code(400).send({ error: "You cannot join your own trade as seller" });
  if (escrow.sellerUserId) return reply.code(409).send({ error: "This trade already has a seller" });
  if (escrow.status !== "AwaitingSeller" || (escrow.joinDeadlineAt && escrow.joinDeadlineAt < new Date())) {
    return reply.code(410).send({ error: "This trade code has expired or is no longer accepting a seller" });
  }
  const updated = await prisma.escrow.update({
    where: { id: escrow.id },
    data: {
      sellerUserId: auth.id,
      sellerAddress: null,
      status: "AwaitingFunding",
      fundDeadlineAt: hoursFromNow((await ensureSettings()).fundWindowHours),
    },
  });
  await prisma.escrowEvent.create({ data: { escrowId: escrow.id, eventName: "SellerJoined" } });
  await addTradeSystemMessage(
    escrow.id,
    "Seller joined this trade. Each party must connect a wallet and use “Link my wallet” in the trade room before funding."
  );
  broadcast("trade:seller-joined", { escrowId: updated.id });
  broadcast("trade:timeline-updated", { escrowId: updated.id });
  void notifySellerJoined({
    escrowId: updated.id,
    title: escrow.title,
    buyerUserId: escrow.buyerUserId,
  }).catch((err) => console.warn("[Join] Notification error:", err));
  return updated;
});

app.get("/v1/escrows", async (req) => {
  const q = req.query as { wallet?: string };
  const walletWhere = q.wallet ? escrowWalletWhere([q.wallet]) : {};
  const where = { AND: [walletWhere, { tradeCode: null }] };
  const rows = await prisma.escrow.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { events: { take: 20, orderBy: { id: "desc" } } },
  });
  return rows.map(serializeEscrow);
});

app.get("/v1/escrows/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({
    where: { id },
    include: {
      events: { orderBy: { id: "desc" } },
      disputes: { orderBy: { createdAt: "desc" }, include: disputeStaffInclude },
      messages: {
        select: { id: true, authorUserId: true, recipientUserId: true, kind: true, body: true, fileName: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      buyerUser: { select: { id: true, displayName: true, email: true } },
      sellerUser: { select: { id: true, displayName: true, email: true } },
    },
  });
  if (!escrow) return reply.code(404).send({ error: "Not found" });
  if (escrow.tradeCode) {
    const auth = await requireUser(req, reply);
    if (!auth) return;
    const role = await escrowPartyRole(auth, escrow);
    if (!role) return reply.code(403).send({ error: "Only the buyer, seller, or admin can view this trade" });
    const serialized = serializeEscrow(escrow);
    return {
      ...serialized,
      messages: role === "admin"
        ? serialized.messages
        : serialized.messages?.filter((message) => !message.recipientUserId || message.recipientUserId === auth.id),
      disputes: serialized.disputes?.map((dispute) => ({
        ...dispute,
        evidence: dispute.evidence?.map(({ filePath, ...item }) => ({ ...item, fileAvailable: Boolean(filePath) })),
      })),
      partyRole: role,
    };
  }
  return serializeEscrow(escrow);
});

app.post("/v1/escrows/:id/trade-record", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({
    where: { id },
    include: {
      buyerUser: { select: { displayName: true, email: true } },
      sellerUser: { select: { displayName: true, email: true } },
      events: { where: { txHash: { not: null } }, orderBy: { createdAt: "asc" }, select: { eventName: true, txHash: true } },
    },
  });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Shared trade not found" });
  const role = await escrowPartyRole(auth, escrow);
  if (!role) return reply.code(403).send({ error: "Only this trade's participants can download its agreement record" });

  const recordId = crypto.randomUUID();
  const now = new Date();
  const transactions = escrow.events
    .filter((event): event is typeof event & { txHash: string } => Boolean(event.txHash))
    .map((event) => ({ label: event.eventName, hash: event.txHash }));
  if (escrow.createTxHash && !transactions.some((tx) => tx.hash === escrow.createTxHash)) {
    transactions.unshift({ label: "Escrow deployment", hash: escrow.createTxHash });
  }
  const snapshot = {
    schema: "2pescrow-trade-record-v1",
    recordId,
    escrowId: escrow.id,
    title: escrow.title,
    terms: escrow.description || "",
    amount: formatAtomicForRecord(escrow.amountAtomic, 6),
    token: escrow.tokenSymbol === "TRON_USDT" ? "USDT" : escrow.tokenSymbol,
    network: escrow.chain === "tron" ? "Tron (TRC-20)" : escrow.tokenSymbol === "USDC" ? "Ethereum · USDC" : "Ethereum · USDT",
    status: escrow.status,
    createdAt: escrow.createdAt.toISOString(),
    issuedAt: now.toISOString(),
    parties: {
      buyer: {
        name:
          escrow.buyerUser?.displayName?.trim() ||
          escrow.buyerUser?.email?.trim() ||
          "Buyer",
        wallet: escrow.buyerAddress || "Not linked",
      },
      seller: {
        name:
          escrow.sellerUser?.displayName?.trim() ||
          escrow.sellerUser?.email?.trim() ||
          (escrow.sellerUserId ? "Seller" : "Not joined yet"),
        wallet: escrow.sellerAddress || "Not linked",
      },
    },
    contractAddress: escrow.contractAddress || "Not deployed yet",
    transactions,
  };
  const snapshotHash = hashTradeSnapshot(snapshot);
  const signature = signTradeSnapshot(recordId, snapshotHash, config.jwtSecret);
  await prisma.tradeRecord.create({
    data: { id: recordId, escrowId: escrow.id, snapshot: snapshot as Prisma.InputJsonValue, snapshotHash, signature },
  });
  const verifyUrl = `${config.webOrigin.replace(/\/$/, "")}/verify/${recordId}`;
  const pdf = buildTradeRecordPdf({ recordId, verifyUrl, snapshotHash, snapshot, mark: await readBrandPng("logo") });
  return reply
    .type("application/pdf")
    .header("Content-Disposition", `attachment; filename="2pescrow-agreement-${escrow.id.slice(0, 8)}.pdf"`)
    .send(pdf);
});

app.get("/v1/public/trade-records/:recordId", async (req, reply) => {
  const { recordId } = req.params as { recordId: string };
  const record = await prisma.tradeRecord.findUnique({ where: { id: recordId } });
  if (!record) return reply.code(404).send({ error: "Trade record not found" });
  const actualHash = hashTradeSnapshot(record.snapshot);
  const expectedSignature = signTradeSnapshot(record.id, actualHash, config.jwtSecret);
  const signatureBytes = /^[a-f0-9]{64}$/i.test(record.signature) ? Buffer.from(record.signature, "hex") : Buffer.alloc(0);
  const expectedBytes = Buffer.from(expectedSignature, "hex");
  const valid = actualHash === record.snapshotHash && signatureBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, signatureBytes);
  if (!valid) return { valid: false, issuedAt: record.createdAt };
  return { valid: true, issuedAt: record.createdAt, snapshotHash: record.snapshotHash, snapshot: record.snapshot };
});

app.get("/v1/escrows/:id/timeline", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Shared trade not found" });
  const role = await escrowPartyRole(auth, escrow);
  if (!role) return reply.code(403).send({ error: "Only the buyer, seller, or admin can view this timeline" });
  const [events, messages] = await Promise.all([
    prisma.escrowEvent.findMany({
      where: { escrowId: id, NOT: { eventName: { startsWith: "DeadlineReminder:" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.chatMessage.findMany({
      where: role === "admin" ? { escrowId: id } : { escrowId: id, OR: [{ recipientUserId: null }, { recipientUserId: auth.id }] },
      select: { id: true, authorUserId: true, recipientUserId: true, kind: true, body: true, fileName: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    events: events.map((event) => ({ ...event, id: event.id.toString(), blockNumber: event.blockNumber?.toString() ?? null })),
    messages,
  };
});

app.post("/v1/escrows/:id/messages", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Shared trade not found" });
  const role = await escrowPartyRole(auth, escrow);
  const openDispute = await prisma.dispute.findFirst({ where: { escrowId: id, status: "open" } });
  if (!role) return reply.code(403).send({ error: "Only the buyer, seller, or dispute staff can post to this trade chat" });
  if (role === "admin") {
    if (escrow.status !== "Disputed" || !openDispute) {
      return reply.code(403).send({ error: "Staff can chat here only while a dispute is open on this trade" });
    }
  } else if (role !== "buyer" && role !== "seller") {
    return reply.code(403).send({ error: "Only the buyer and seller can post to this trade chat" });
  }
  const body = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const messageKind = role === "admin" ? "admin" : "user";
  const message = await prisma.chatMessage.create({
    data: { escrowId: id, authorUserId: auth.id, kind: messageKind, body: body.body },
    select: { id: true, authorUserId: true, kind: true, body: true, fileName: true, createdAt: true },
  });
  if (role === "admin" && openDispute) {
    await prisma.dispute.update({
      where: { id: openDispute.id },
      data: {
        handledByAdmin: true,
        handledByAdminAt: openDispute.handledByAdminAt ?? new Date(),
        handledByAdminUserId: openDispute.handledByAdminUserId ?? auth.id,
      },
    });
    await logAgentActivityIfAgent(auth, {
      action: "dispute_chat_message",
      disputeId: openDispute.id,
      escrowId: id,
      summary: `Posted in dispute chat: ${body.body.slice(0, 280)}`,
      payload: { messageId: message.id },
    }).catch(() => undefined);
  }
  broadcast("trade:timeline-updated", { escrowId: id });
  void notifyChatMessage({
    escrowId: id,
    title: escrow.title,
    messageId: message.id,
    body: body.body,
    authorUserId: auth.id,
    authorName: auth.displayName || (role === "admin" ? "Support" : role === "seller" ? "Seller" : "Buyer"),
    buyerUserId: escrow.buyerUserId,
    sellerUserId: escrow.sellerUserId,
  }).catch((err) => console.warn("[Chat] Notification error:", err));
  return message;
});

app.post("/v1/escrows/:id/evidence", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Shared trade not found" });
  const role = await escrowPartyRole(auth, escrow);
  if (!role || role === "admin") return reply.code(403).send({ error: "Only the buyer and seller can upload shared evidence" });
  let note = "Evidence uploaded";
  let kind: "evidence" | "fulfilment" = "evidence";
  let fileName = "evidence";
  let filePath: string | undefined;
  let fileBuffer: Buffer | undefined;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      fileName = path.basename(part.filename || "evidence");
      fileBuffer = await part.toBuffer();
    } else if (part.fieldname === "note") {
      note = String(part.value).trim().slice(0, 1000) || note;
    } else if (part.fieldname === "kind" && part.value === "fulfilment") {
      kind = "fulfilment";
    }
  }
  if (!fileBuffer) return reply.code(400).send({ error: "Attach a file to upload evidence" });
  if (kind === "fulfilment") {
    if (role !== "seller") return reply.code(403).send({ error: "Only the seller can submit fulfilment" });
    if (!escrow.contractAddress) {
      return reply.code(409).send({ error: "Seller fulfilment is available after the buyer creates the on-chain escrow" });
    }
    const fulfilmentBlocked = ["Completed", "Cancelled", "Resolved", "Disputed"].includes(escrow.status);
    if (fulfilmentBlocked) {
      return reply.code(409).send({ error: "This trade is no longer accepting fulfilment" });
    }
    if (!["Funded", "InProgress", "Created"].includes(escrow.status)) {
      return reply.code(409).send({ error: "Seller fulfilment is available after the buyer funds the on-chain escrow" });
    }
    note = "Seller shared fulfilment proof in the trade room.";
  }
  const storedName = `${id}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${fileName}`;
  filePath = path.join(config.uploadDir, storedName);
  fs.writeFileSync(filePath, fileBuffer);
  if (kind === "fulfilment") {
    const proofHash = `0x${crypto.createHash("sha256").update(fileBuffer).digest("hex")}`;
    await prisma.escrow.update({ where: { id }, data: { proofHash } });
  }
  const message = await prisma.chatMessage.create({
    data: { escrowId: id, authorUserId: auth.id, kind, body: note, filePath, fileName },
    select: { id: true, authorUserId: true, kind: true, body: true, fileName: true, createdAt: true },
  });
  broadcast("trade:timeline-updated", { escrowId: id });
  if (kind === "fulfilment") {
    void notifyDeliverySubmitted({
      escrowId: id,
      title: escrow.title,
      buyerUserId: escrow.buyerUserId,
    }).catch((err) => console.warn("[Evidence] Fulfilment notification error:", err));
  } else {
    void notifyChatMessage({
      escrowId: id,
      title: escrow.title,
      messageId: message.id,
      body: note || (fileName ? `Shared attachment: ${fileName}` : "Uploaded new trade evidence"),
      authorUserId: auth.id,
      authorName: auth.displayName || (role === "seller" ? "Seller" : "Buyer"),
      buyerUserId: escrow.buyerUserId,
      sellerUserId: escrow.sellerUserId,
    }).catch((err) => console.warn("[Evidence] Notification error:", err));
  }
  return message;
});

async function fulfilmentProofHashFromChat(escrowId: string): Promise<string | null> {
  const message = await prisma.chatMessage.findFirst({
    where: { escrowId, kind: "fulfilment", filePath: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!message?.filePath || !fs.existsSync(message.filePath)) return null;
  const fileBuffer = fs.readFileSync(message.filePath);
  return `0x${crypto.createHash("sha256").update(fileBuffer).digest("hex")}`;
}

app.get("/v1/escrows/:id/fulfilment-proof-hash", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Shared trade not found" });
  const role = await escrowPartyRole(auth, escrow);
  if (!role || role === "admin") return reply.code(403).send({ error: "Only the buyer or seller can read fulfilment proof" });
  let proofHash = escrow.proofHash;
  if (!proofHash || !/^0x[0-9a-fA-F]{64}$/.test(proofHash)) {
    proofHash = await fulfilmentProofHashFromChat(id);
    if (proofHash) await prisma.escrow.update({ where: { id }, data: { proofHash } });
  }
  if (!proofHash) return reply.code(404).send({ error: "No fulfilment file in chat yet" });
  return { proofHash };
});

app.get("/v1/escrows/:id/messages/:messageId/file", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id, messageId } = req.params as { id: string; messageId: string };
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Shared trade not found" });
  const role = await escrowPartyRole(auth, escrow);
  if (!role) return reply.code(403).send({ error: "Only the buyer, seller, or admin can download this evidence" });
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, escrowId: id } });
  if (!message?.filePath || !fs.existsSync(message.filePath)) return reply.code(404).send({ error: "Evidence file not found" });
  const fileName = message.fileName || "evidence";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mime =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "png" ? "image/png"
    : ext === "gif" ? "image/gif"
    : ext === "webp" ? "image/webp"
    : ext === "pdf" ? "application/pdf"
    : "application/octet-stream";
  const inline = mime.startsWith("image/") || mime === "application/pdf";
  return reply
    .type(mime)
    .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    .send(fs.createReadStream(message.filePath));
});

app.post("/v1/escrows/:id/wallet", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow || !escrow.tradeCode) return reply.code(404).send({ error: "Shared trade not found" });
  const role = await escrowPartyRole(auth, escrow);
  if (role !== "buyer" && role !== "seller") return reply.code(403).send({ error: "Only the buyer or seller can link a trade wallet" });
  const body = z.object({ address: z.string().min(1) }).parse(req.body);
  const address = normalizePartyAddress(escrow.chain as ChainKey, body.address);
  const wallet = await prisma.wallet.findFirst({
    where: { userId: auth.id, address, chainKind: escrow.chain === "tron" ? "tron" : "evm" },
  });
  if (!wallet) return reply.code(403).send({ error: "Connect and link this wallet to your profile first" });
  const updated = await prisma.$transaction(async tx => {
    if (escrow.chain === "ethereum") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${escrow.buyerAddress?.toLowerCase() || id}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 1))`;
      const current = await tx.escrow.findUniqueOrThrow({ where: { id } });
      const currentAddress = role === "buyer" ? current.buyerAddress : current.sellerAddress;
      if (currentAddress !== address && (current.contractAddress || current.createTxHash || await tx.ethereumFundingAttempt.count({ where: { escrowId: id } }))) return null;
    }
    return tx.escrow.update({ where: { id }, data: role === "buyer" ? { buyerAddress: address } : { sellerAddress: address } });
  });
  if (!updated) return reply.code(409).send({ error: "Wallets cannot change after funding has started. Continue with the wallets recorded on this trade." });
  const roleLabel = role === "buyer" ? "Buyer" : "Seller";
  await addTradeSystemMessage(escrow.id, `${roleLabel} linked wallet ${address} to this trade.`);
  if (escrow.tradeCode) {
    broadcast("trade:wallet-linked", { escrowId: updated.id, role, address });
    broadcast("trade:timeline-updated", { escrowId: updated.id });
    void notifyWalletLinked({
      escrowId: updated.id,
      title: escrow.title,
      role,
      address,
      buyerUserId: escrow.buyerUserId,
      sellerUserId: escrow.sellerUserId,
    }).catch((err) => console.warn("[Wallet] Notification error:", err));
  } else {
    broadcast("escrow:updated", updated);
  }
  return updated;
});

app.patch("/v1/escrows/:id", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const existing = await prisma.escrow.findUnique({ where: { id } });
  if (!existing) return reply.code(404).send({ error: "Not found" });
  if (!(await userMayMutateEscrow(auth, existing))) {
    return reply.code(403).send({ error: "Only escrow parties (linked wallets) or admin may update this trade" });
  }
  if (existing.tradeCode && existing.buyerUserId !== auth.id && auth.role !== "admin") {
    return reply.code(403).send({ error: "Only the buyer can deploy the on-chain escrow" });
  }
  const body = z
    .object({
      contractAddress: z.string().optional(),
      createTxHash: z.string().optional(),
      buyerAddress: z.string().optional(),
    })
    .parse(req.body);
  const data: Record<string, unknown> = {};
  if (existing.chain === "ethereum" && (body.contractAddress || body.createTxHash !== undefined)) {
    if (!body.createTxHash || !/^0x[0-9a-fA-F]{64}$/.test(body.createTxHash)) return reply.code(400).send({ error: "Use the verified Ethereum funding recovery flow" });
    try {
      const recovered = await ethereumFunding.recover(id, body.createTxHash as `0x${string}`);
      if (body.contractAddress && body.contractAddress.toLowerCase() !== recovered.contractAddress?.toLowerCase()) return reply.code(409).send({ error: "Contract does not match the creation transaction" });
      return await prisma.escrow.findUniqueOrThrow({ where: { id } });
    } catch {
      return reply.code(409).send({ error: "Creation is pending or could not be verified. Update the app and use saved funding progress." });
    }
  }
  if (body.createTxHash !== undefined) {
    data.createTxHash = body.createTxHash;
    if (existing.tradeCode) data.status = "Created";
  }
  if (body.buyerAddress) {
    if (existing.chain === "ethereum" && body.buyerAddress.toLowerCase() !== existing.buyerAddress?.toLowerCase()) {
      return reply.code(409).send({ error: "Use the trade wallet-linking action before starting Ethereum funding" });
    }
    if (existing.tradeCode && existing.buyerUserId !== auth.id && auth.role !== "admin") {
      return reply.code(403).send({ error: "Only the buyer can set the buyer wallet" });
    }
    const buyerAddress = normalizePartyAddress(existing.chain as ChainKey, body.buyerAddress);
    if (existing.tradeCode && existing.buyerUserId) {
      const wallet = await prisma.wallet.findFirst({ where: { userId: existing.buyerUserId, address: buyerAddress } });
      if (!wallet) return reply.code(403).send({ error: "Link your buyer wallet before deploying this trade" });
    }
    data.buyerAddress = buyerAddress;
  }
  if (body.contractAddress) {
    data.contractAddress = normalizeContractAddress(existing.chain as ChainKey, body.contractAddress);
    if (existing.tradeCode) data.status = "Created";
  }
  if (Object.keys(data).length === 0) {
    return reply.code(400).send({ error: "No allowed fields to update" });
  }
  const escrow = await prisma.escrow.update({ where: { id }, data });
  broadcast(existing.tradeCode ? "trade:timeline-updated" : "escrow:updated", existing.tradeCode ? { escrowId: escrow.id } : escrow);
  return escrow;
});

app.post("/v1/escrows/:id/proof", async (req, reply) => {
  const { id } = req.params as { id: string };
  const data = await req.file();
  if (!data) return reply.code(400).send({ error: "No file" });
  const buf = await data.toBuffer();
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  const proofHash = `0x${hash}`;
  const filename = `${id}-${Date.now()}-${data.filename}`;
  const filePath = path.join(config.uploadDir, filename);
  fs.writeFileSync(filePath, buf);
  const escrow = await prisma.escrow.update({
    where: { id },
    data: { proofHash, proofFilePath: filePath, status: "InProgress" },
  });
  await prisma.escrowEvent.create({
    data: {
      escrowId: id,
      eventName: "ProofUploaded",
      payload: { proofHash, filename },
    },
  });
  broadcast("escrow:proof", escrow);
  return { escrow, proofHash };
});

app.post("/v1/escrows/:id/disputes", async (req, reply) => {
  const { id } = req.params as { id: string };
  const escrowRow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrowRow) return reply.code(404).send({ error: "Trade not found" });
  let openedBy: string;
  let openedByUserId: string | null = null;
  let openerRole: "buyer" | "seller" | undefined;
  let reason: string | undefined;
  let requestedTier = normalizeRequestedTier(undefined, "moderator");
  if (escrowRow.tradeCode) {
    const auth = await requireUser(req, reply);
    if (!auth) return;
    const role = await escrowPartyRole(auth, escrowRow);
    if (role !== "buyer" && role !== "seller") return reply.code(403).send({ error: "Only the buyer or seller can raise a dispute" });
    openerRole = role;
    openedByUserId = auth.id;
    const body = z
      .object({
        reason: z.string().trim().max(2000).optional(),
        requestedResolverTier: z.enum(["agent", "moderator", "admin"]).optional(),
      })
      .parse(req.body);
    openedBy = auth.email || auth.id;
    reason = body.reason;
    const settings = await ensureSettings();
    const defaultTier = settings.resolutionMode === "agent" ? "agent" : "moderator";
    requestedTier = normalizeRequestedTier(body.requestedResolverTier, defaultTier);
  } else {
    const body = z.object({ openedBy: z.string() }).parse(req.body);
    openedBy = normalizePartyAddress(escrowRow.chain as ChainKey, body.openedBy);
  }
  const activeDispute = await prisma.dispute.findFirst({
    where: { escrowId: id, status: { in: [...ACTIVE_DISPUTE_STATUSES] } },
  });
  if (activeDispute) return reply.code(409).send({ error: "This trade already has an active dispute" });
  const priorOpen = await prisma.dispute.findFirst({
    where: {
      escrowId: id,
      OR: [
        ...(openedByUserId ? [{ openedByUserId }] : []),
        { openedBy: { equals: openedBy, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (priorOpen) {
    return reply.code(409).send({ error: "You have already used your one dispute opening for this trade" });
  }
  await prisma.escrow.update({ where: { id }, data: { status: "Disputed" } });
  const dispute = await prisma.dispute.create({
    data: { escrowId: id, openedBy, openedByUserId, status: "open", requestedResolverTier: requestedTier },
  });
  await prisma.escrowEvent.create({
    data: {
      escrowId: id,
      eventName: escrowRow.tradeCode && escrowRow.chain === "tron" ? "DisputeRequested" : "DisputeOpened",
    },
  });
  if (escrowRow.tradeCode) {
    const tierLabel = requestedTier === "agent" ? "an agent" : requestedTier === "admin" ? "admin staff" : "a moderator";
    await addTradeSystemMessage(
      id,
      reason
        ? `Dispute opened: ${reason}. Requested resolver: ${tierLabel}. Staff may join this chat to ask questions.`
        : `A party opened a dispute. Requested resolver: ${tierLabel}. Staff may join this chat to ask questions.`,
    );
    const notifyIds = await staffUserIdsForTier(requestedTier);
    await notifyStaffUsers(notifyIds, {
      type: "dispute_opened",
      title: "New dispute opened",
      message: `Trade ${escrowRow.title || id} requested a ${requestedTier} resolver.${reason ? ` Reason: ${reason.slice(0, 240)}` : ""}`,
      disputeId: dispute.id,
      escrowId: id,
      payload: { requestedResolverTier: requestedTier, tradeCode: escrowRow.tradeCode },
    });
  }
  broadcast("dispute:opened", { escrowId: id });
  if (escrowRow.tradeCode) {
    broadcast("trade:timeline-updated", { escrowId: id });
    void notifyDisputeOpened({
      escrowId: id,
      title: escrowRow.title,
      openerRole,
      buyerUserId: escrowRow.buyerUserId,
      sellerUserId: escrowRow.sellerUserId,
      openerUserId: openedByUserId || undefined,
    }).catch((err) => console.warn("[Dispute] Notification error:", err));
  }
  return dispute;
});

function escrowStatusAfterDisputeWithdraw(escrow: {
  proofHash?: string | null;
  contractAddress?: string | null;
}) {
  if (escrow.proofHash) return "InProgress";
  if (escrow.contractAddress) return "Funded";
  return "Created";
}

/** A trade party or authorized dispute staff can withdraw an open dispute and resume normal trade flow. */
app.post("/v1/disputes/:id/withdraw", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const body = z.object({ txHash: z.string().trim().min(1).optional() }).parse(req.body ?? {});
  const disputeRow = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true } });
  if (!disputeRow) return reply.code(404).send({ error: "Dispute not found" });
  if (!disputeRow.escrow.tradeCode) {
    return reply.code(400).send({ error: "Withdraw is only supported for shared code trades" });
  }
  const role = await escrowPartyRole(auth, disputeRow.escrow);
  if (role !== "buyer" && role !== "seller" && role !== "admin") {
    return reply.code(403).send({ error: "Only a trade party or authorized dispute staff can withdraw this dispute" });
  }
  if (role === "buyer" || role === "seller") {
    const isOpener = disputeRow.openedByUserId
      ? disputeRow.openedByUserId === auth.id
      : disputeRow.openedBy === (auth.email || auth.id);
    if (!isOpener) return reply.code(403).send({ error: "Only the party who opened this dispute can withdraw it" });
  }
  if (disputeRow.status !== "open") {
    return reply.code(409).send({ error: "Only an open dispute can be withdrawn" });
  }
  if (disputeRow.buyerFavor != null) {
    return reply.code(409).send({ error: "This dispute already has a ruling and cannot be withdrawn" });
  }
  const resumeStatus = escrowStatusAfterDisputeWithdraw(disputeRow.escrow);
  await prisma.$transaction([
    prisma.dispute.update({
      where: { id },
      data: { status: "withdrawn", resolvedAt: new Date(), resolution: role === "admin" ? "withdrawn_by_staff" : "withdrawn_by_party" },
    }),
    prisma.escrow.update({
      where: { id: disputeRow.escrowId },
      data: { status: resumeStatus },
    }),
    prisma.escrowEvent.create({
      data: { escrowId: disputeRow.escrowId, eventName: "DisputeWithdrawn", txHash: body.txHash, payload: { withdrawnBy: auth.id } },
    }),
  ]);
  const partyLabel = role === "admin" ? "Staff" : role === "buyer" ? "Buyer" : "Seller";
  await addTradeSystemMessage(
    disputeRow.escrowId,
    `${partyLabel} withdrew the dispute. The trade continues in normal flow — settle directly in chat if you agree.`,
  );
  broadcast("dispute:withdrawn", { escrowId: disputeRow.escrowId, disputeId: id });
  broadcast("trade:timeline-updated", { escrowId: disputeRow.escrowId });
  return { ok: true, escrowStatus: resumeStatus };
});

app.post("/v1/disputes/:id/message", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  const { id } = req.params as { id: string };
  const body = z.object({ toParty: z.enum(["buyer", "seller"]), message: z.string().trim().min(1).max(4000) }).parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true } });
  if (!dispute || !dispute.escrow.tradeCode) return reply.code(404).send({ error: "Shared trade dispute not found" });
  if (!(ACTIVE_DISPUTE_STATUSES.includes(dispute.status as (typeof ACTIVE_DISPUTE_STATUSES)[number]))) {
    return reply.code(409).send({ error: "This dispute is closed" });
  }
  if (!staffOwnsDispute(staff, dispute)) {
    return reply.code(403).send({ error: "Claim this case before messaging a party" });
  }
  const recipientUserId = body.toParty === "buyer" ? dispute.escrow.buyerUserId : dispute.escrow.sellerUserId;
  if (!recipientUserId) return reply.code(409).send({ error: `The ${body.toParty} has not joined this trade room` });
  const message = await addPrivateTradeMessage(dispute.escrowId, staff.id, recipientUserId, body.message);
  await logAgentActivityIfAgent(staff, {
    action: "dispute_private_message",
    disputeId: id,
    escrowId: dispute.escrowId,
    summary: `Sent private message to ${body.toParty}: ${body.message.slice(0, 240)}`,
    payload: { messageId: message.id, recipientUserId },
  }).catch(() => undefined);
  return message;
});

app.post("/v1/disputes/:id/evidence", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const disputeRow = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true } });
  if (!disputeRow) return reply.code(404).send({ error: "Dispute not found" });
  const role = await escrowPartyRole(auth, disputeRow.escrow);
  const staffEvidence = role === "admin";
  if (!staffEvidence && role !== "buyer" && role !== "seller") {
    return reply.code(403).send({ error: "Only the buyer, seller, or assigned staff can submit dispute evidence" });
  }
  if (disputeRow.status !== "open") return reply.code(409).send({ error: "This dispute is no longer open for evidence" });
  const parts = req.parts();
  let note = "";
  let filePath: string | undefined;
  let fileName: string | undefined;
  let contentHash: string | undefined;
  for await (const part of parts) {
    if (part.type === "file") {
      const buf = await part.toBuffer();
      contentHash = crypto.createHash("sha256").update(buf).digest("hex");
      fileName = path.basename(part.filename || "evidence");
      const filename = `dispute-${id}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${fileName}`;
      filePath = path.join(config.uploadDir, filename);
      fs.writeFileSync(filePath, buf);
    } else if (part.fieldname === "note") note = String(part.value).trim().slice(0, 2000);
  }
  const submittedBy = staffEvidence
    ? `staff:${auth.email || auth.id}`
    : role === "buyer"
      ? disputeRow.escrow.buyerAddress
      : disputeRow.escrow.sellerAddress;
  if (!submittedBy) return reply.code(409).send({ error: "Link your trade wallet before submitting dispute evidence" });
  const evidence = await prisma.disputeEvidence.create({
    data: { disputeId: id, submittedBy, filePath, fileName, contentHash, note },
    select: { id: true, disputeId: true, submittedBy: true, contentHash: true, fileName: true, note: true, createdAt: true },
  });
  if (staffEvidence) {
    await logAgentActivityIfAgent(auth, {
      action: "dispute_evidence_upload",
      disputeId: id,
      escrowId: disputeRow.escrowId,
      summary: `Uploaded dispute evidence${fileName ? `: ${fileName}` : ""}${note ? ` — ${note.slice(0, 120)}` : ""}`,
      payload: { evidenceId: evidence.id, contentHash },
    }).catch(() => undefined);
  }
  broadcast("dispute:evidence", evidence);
  return evidence;
});

app.get("/v1/disputes/:id/evidence/:evidenceId/file", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id, evidenceId } = req.params as { id: string; evidenceId: string };
  const evidence = await prisma.disputeEvidence.findFirst({
    where: { id: evidenceId, disputeId: id },
    include: { dispute: { include: { escrow: true } } },
  });
  if (!evidence) return reply.code(404).send({ error: "Dispute evidence not found" });
  const role = await escrowPartyRole(auth, evidence.dispute.escrow);
  if (!role) return reply.code(403).send({ error: "Only the trade parties or an admin can download this evidence" });
  if (!evidence.filePath || !fs.existsSync(evidence.filePath)) return reply.code(404).send({ error: "Evidence file not found" });
  const safeName = path.basename(evidence.fileName || "dispute-evidence").replace(/[\r\n";]/g, "_");
  return reply
    .type("application/octet-stream")
    .header("Content-Disposition", `attachment; filename="${safeName}"`)
    .send(fs.createReadStream(evidence.filePath));
});

app.get("/v1/admin/moderators", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const rows = await prisma.user.findMany({
    where: { role: "moderator", permissions: { has: "disputes" } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, displayName: true },
  });
  return rows;
});

app.get("/v1/admin/agents-staff", async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  return prisma.user.findMany({
    where: { role: "agent", permissions: { has: "disputes" } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, displayName: true, permissions: true },
  });
});

app.get("/v1/admin/disputes", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  const activeDispute = { status: { in: [...ACTIVE_DISPUTE_STATUSES] } };
  const where: Prisma.EscrowWhereInput = { status: "Disputed", disputes: { some: activeDispute } };
  const rows = await prisma.escrow.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      disputes: {
        orderBy: { createdAt: "desc" },
        include: {
          evidence: { select: { id: true, submittedBy: true, fileName: true, note: true, createdAt: true } },
          assignedAgent: { select: staffPersonSelect },
          assignedModerator: { select: staffPersonSelect },
          assignedBy: { select: staffPersonSelect },
          owner: { select: staffPersonSelect },
          recommendedBy: { select: { id: true, email: true, displayName: true } },
          staffMessages: {
            orderBy: { createdAt: "asc" },
            take: 80,
            include: { author: { select: staffPersonSelect } },
          },
          escalations: { orderBy: { createdAt: "desc" }, take: 3 },
          appeal: true,
        },
      },
      messages: {
        select: { id: true, authorUserId: true, kind: true, body: true, fileName: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      events: {
        where: { eventName: "DisputeFreezeConfirmed" },
        select: { id: true, eventName: true, txHash: true, createdAt: true, payload: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  for (const row of rows) {
    if (row.disputes.some((dispute) => dispute.status === "open")) continue;
    const opened = await prisma.dispute.create({
      data: { escrowId: row.id, openedBy: "on-chain", status: "open" },
      include: { evidence: { select: { id: true, submittedBy: true, fileName: true, note: true, createdAt: true } } },
    });
    row.disputes.push(opened as (typeof row.disputes)[number]);
  }
  return rows;
});

app.post("/v1/disputes/:id/assign-moderator", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z.object({ moderatorUserId: z.string().uuid().nullable() }).parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { assignedModerator: { select: { email: true, displayName: true } } } });
  if (!dispute) return reply.code(404).send({ error: "Dispute not found" });
  if (dispute.status !== "open") return reply.code(400).send({ error: "Only open disputes can be assigned" });
  if (body.moderatorUserId) {
    const mod = await prisma.user.findUnique({ where: { id: body.moderatorUserId } });
    if (!mod || mod.role !== "moderator" || !mod.permissions.includes("disputes")) {
      return reply.code(400).send({ error: "Choose a moderator with the Disputes privilege" });
    }
  }
  const updated = await prisma.dispute.update({
    where: { id },
    data: {
      assignedModeratorUserId: body.moderatorUserId,
      assignedAt: body.moderatorUserId ? new Date() : null,
      assignedByUserId: body.moderatorUserId ? admin.id : null,
      ownerUserId: body.moderatorUserId,
      claimedAt: body.moderatorUserId ? new Date() : null,
      awaitingRulingTier: null,
    },
    include: {
      assignedModerator: { select: { id: true, email: true, displayName: true } },
      assignedBy: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (body.moderatorUserId && updated.assignedModerator) {
    const label = updated.assignedModerator.displayName || updated.assignedModerator.email || "A moderator";
    await addTradeSystemMessage(dispute.escrowId, `${label} was assigned to help resolve this dispute.`);
  }
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return updated;
});

app.post("/v1/disputes/:id/assign-agent", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z.object({ agentUserId: z.string().uuid().nullable() }).parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id } });
  if (!dispute) return reply.code(404).send({ error: "Dispute not found" });
  if (dispute.status !== "open") return reply.code(400).send({ error: "Only open disputes can be assigned" });
  if (body.agentUserId) {
    const agentUser = await prisma.user.findUnique({ where: { id: body.agentUserId } });
    if (!agentUser || agentUser.role !== "agent" || !agentUser.permissions.includes("disputes")) {
      return reply.code(400).send({ error: "Choose an agent with the Disputes privilege" });
    }
    try {
      await assertAgentVolumeQualified(agentUser.id);
    } catch (e) {
      if (e instanceof AgentVolumeError) {
        return reply.code(400).send({ error: e.message, agentEligibility: e.detail });
      }
      throw e;
    }
  }
  const updated = await prisma.dispute.update({
    where: { id },
    data: {
      assignedAgentUserId: body.agentUserId,
      assignedAgentAt: body.agentUserId ? new Date() : null,
      ownerUserId: body.agentUserId,
      claimedAt: body.agentUserId ? new Date() : null,
      awaitingRulingTier: null,
    },
    include: {
      assignedAgent: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (body.agentUserId && updated.assignedAgent) {
    const label = updated.assignedAgent.displayName || updated.assignedAgent.email || "An agent";
    await addTradeSystemMessage(dispute.escrowId, `${label} was assigned to investigate this dispute.`);
    await notifyStaffUsers([body.agentUserId], {
      type: "dispute_assigned",
      title: "Dispute assigned to you",
      message: `You were assigned as agent on trade ${dispute.escrowId}. Review chat and evidence in the admin panel.`,
      disputeId: id,
      escrowId: dispute.escrowId,
    });
    await logAgentActivity({
      agentUserId: body.agentUserId,
      action: "dispute_assigned",
      disputeId: id,
      escrowId: dispute.escrowId,
      summary: `Assigned to dispute on trade ${dispute.escrowId}`,
      payload: { assignedByAdminId: admin.id },
    }).catch(() => undefined);
  }
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return updated;
});

const staffMessageInclude = {
  author: { select: staffPersonSelect },
} as const;

app.post("/v1/disputes/:id/claim", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  const { id } = req.params as { id: string };
  const dispute = await prisma.dispute.findUnique({ where: { id } });
  if (!dispute) return reply.code(404).send({ error: "Dispute not found" });
  if (!canClaimDispute(staff, dispute)) {
    return reply.code(409).send({
      error: dispute.ownerUserId
        ? "This case already has an owner. Only an admin can take it over."
        : "This case is waiting for a different staff tier to claim it.",
    });
  }
  const claimData: {
    ownerUserId: string;
    claimedAt: Date;
    awaitingRulingTier: null;
    assignedAgentUserId?: string;
    assignedAgentAt?: Date;
    assignedModeratorUserId?: string;
    assignedAt?: Date;
    assignedByUserId?: string;
  } = {
    ownerUserId: staff.id,
    claimedAt: new Date(),
    awaitingRulingTier: null,
  };
  if (staff.role === "agent") {
    claimData.assignedAgentUserId = staff.id;
    claimData.assignedAgentAt = new Date();
  }
  if (staff.role === "moderator") {
    claimData.assignedModeratorUserId = staff.id;
    claimData.assignedAt = new Date();
    claimData.assignedByUserId = staff.id;
  }
  const claimWhere: Prisma.DisputeWhereInput = { id, status: "open", ownerUserId: null };
  if (staff.role === "agent") claimWhere.awaitingRulingTier = null;
  if (staff.role === "moderator") claimWhere.OR = [{ awaitingRulingTier: null }, { awaitingRulingTier: "moderator" }];
  const claimed = await prisma.dispute.updateMany({
    where: claimWhere,
    data: claimData,
  });
  if (claimed.count === 0) return reply.code(409).send({ error: "This case was just claimed by someone else." });
  const updated = await prisma.dispute.findUnique({
    where: { id },
    include: { owner: { select: staffPersonSelect } },
  });
  await logAgentActivityIfAgent(staff, {
    action: "dispute_claimed",
    disputeId: id,
    escrowId: dispute.escrowId,
    summary: "Claimed the case from the shared queue",
  }).catch(() => undefined);
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return updated;
});

app.post("/v1/disputes/:id/takeover", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { owner: { select: staffPersonSelect } } });
  if (!dispute) return reply.code(404).send({ error: "Dispute not found" });
  if (dispute.status !== "open") return reply.code(409).send({ error: "Only an open case can be taken over" });
  if (!dispute.ownerUserId) return reply.code(409).send({ error: "This case is available. Claim it instead of taking it over." });
  if (dispute.ownerUserId === admin.id) return reply.code(409).send({ error: "You are already handling this case" });
  const previous = dispute.owner?.displayName || dispute.owner?.email || "another staff member";
  const updated = await prisma.dispute.update({
    where: { id },
    data: {
      ownerUserId: admin.id,
      claimedAt: new Date(),
      awaitingRulingTier: null,
      assignedByUserId: admin.id,
    },
    include: { owner: { select: staffPersonSelect } },
  });
  await prisma.disputeStaffMessage.create({
    data: {
      disputeId: id,
      authorUserId: admin.id,
      body: `Took over this case from ${previous}.`,
    },
  });
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return updated;
});

app.post("/v1/disputes/:id/recommend", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  if (staff.role !== "agent") return reply.code(403).send({ error: "Only the agent handling a case can submit a recommendation" });
  const { id } = req.params as { id: string };
  const body = z.object({
    buyerFavor: z.boolean(),
    note: z.string().trim().min(1).max(4000),
    handTo: z.enum(["moderator", "admin"]),
  }).parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true } });
  if (!dispute || dispute.status !== "open") return reply.code(400).send({ error: "Dispute not open" });
  if (dispute.ownerUserId !== staff.id) return reply.code(403).send({ error: "You are not handling this case" });
  const favorLabel = body.buyerFavor ? "buyer favor" : "seller favor";
  const handLabel = body.handTo === "admin" ? "an admin" : "a moderator";
  const updated = await prisma.dispute.update({
    where: { id },
    data: {
      ownerUserId: null,
      awaitingRulingTier: body.handTo,
      recommendationBuyerFavor: body.buyerFavor,
      recommendationNote: body.note,
      recommendedAt: new Date(),
      recommendedByUserId: staff.id,
      assignedAgentUserId: staff.id,
      assignedAgentAt: dispute.assignedAgentAt ?? new Date(),
    },
  });
  await prisma.disputeStaffMessage.create({
    data: {
      disputeId: id,
      authorUserId: staff.id,
      body: `Recommendation: ${favorLabel}. Handed to ${handLabel} for a ruling.\n\n${body.note}`,
    },
  });
  await prisma.disputeEscalation.create({
    data: {
      disputeId: id,
      fromUserId: staff.id,
      fromTier: "agent",
      toTier: body.handTo,
      preliminaryBuyerFavor: body.buyerFavor,
      note: body.note,
      chatSummary: await buildDisputeChatSummary(dispute.escrowId),
    },
  });
  const notifyIds = await staffUserIdsForTier(body.handTo, id);
  await notifyStaffUsers(notifyIds, {
    type: "dispute_recommendation",
    title: `Case ready for a ${body.handTo} ruling`,
    message: `${staff.displayName || staff.email || "An agent"} recommends ${favorLabel}.\n\n${body.note}`,
    disputeId: id,
    escrowId: dispute.escrowId,
  });
  await logAgentActivity({
    agentUserId: staff.id,
    action: "dispute_recommended",
    disputeId: id,
    escrowId: dispute.escrowId,
    summary: `Recommended ${favorLabel} and handed the case to ${handLabel}`,
    payload: { buyerFavor: body.buyerFavor, handTo: body.handTo },
  }).catch(() => undefined);
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return updated;
});

app.get("/v1/disputes/:id/staff-messages", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  const { id } = req.params as { id: string };
  const dispute = await prisma.dispute.findUnique({ where: { id }, select: { id: true } });
  if (!dispute) return reply.code(404).send({ error: "Dispute not found" });
  return prisma.disputeStaffMessage.findMany({
    where: { disputeId: id },
    orderBy: { createdAt: "asc" },
    take: 80,
    include: staffMessageInclude,
  });
});

app.post("/v1/disputes/:id/staff-messages", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  const { id } = req.params as { id: string };
  const body = z.object({ message: z.string().trim().min(1).max(4000) }).parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, select: { id: true, escrowId: true, status: true } });
  if (!dispute) return reply.code(404).send({ error: "Dispute not found" });
  if (!ACTIVE_DISPUTE_STATUSES.includes(dispute.status as (typeof ACTIVE_DISPUTE_STATUSES)[number])) {
    return reply.code(409).send({ error: "This dispute is closed" });
  }
  const message = await prisma.disputeStaffMessage.create({
    data: { disputeId: id, authorUserId: staff.id, body: body.message },
    include: staffMessageInclude,
  });
  await logAgentActivityIfAgent(staff, {
    action: "dispute_staff_chat",
    disputeId: id,
    escrowId: dispute.escrowId,
    summary: body.message.slice(0, 240),
  }).catch(() => undefined);
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return message;
});

app.post("/v1/disputes/:id/escalate", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const body = z
    .object({
      note: z.string().trim().min(1).max(4000),
      preliminaryBuyerFavor: z.boolean().optional(),
      externalProof: z.string().trim().max(4000).optional(),
    })
    .parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true } });
  if (!dispute || dispute.status !== "open") return reply.code(400).send({ error: "Dispute not open" });
  if (!(await canStaffDisputeEscrow(auth, dispute.escrowId))) {
    return reply.code(403).send({ error: "You are not assigned to this dispute" });
  }
  const fromTier = staffTier(auth);
  if (!fromTier) return reply.code(403).send({ error: "Staff role required" });
  if (fromTier === "admin") return reply.code(400).send({ error: "Admin is the highest tier; use resolve instead of escalate" });
  const toTier = escalationTargetTier(fromTier);
  const chatSummary = await buildDisputeChatSummary(dispute.escrowId);
  const escalation = await prisma.disputeEscalation.create({
    data: {
      disputeId: id,
      fromUserId: auth.id,
      fromTier,
      toTier,
      preliminaryBuyerFavor: body.preliminaryBuyerFavor,
      note: body.note,
      externalProof: body.externalProof,
      chatSummary,
    },
  });
  const notifyIds = await staffUserIdsForTier(toTier, id);
  await notifyStaffUsers(notifyIds, {
    type: "dispute_escalation",
    title: `Dispute escalated to ${toTier}`,
    message: `${auth.displayName || auth.email || "Staff"} recommends ${body.preliminaryBuyerFavor === true ? "buyer favor" : body.preliminaryBuyerFavor === false ? "seller favor" : "review"}.\n\n${body.note}`,
    disputeId: id,
    escrowId: dispute.escrowId,
    payload: {
      escalationId: escalation.id,
      preliminaryBuyerFavor: body.preliminaryBuyerFavor,
      externalProof: body.externalProof,
      chatSummary,
      tradeTitle: dispute.escrow.title,
    },
  });
  await addTradeSystemMessage(
    dispute.escrowId,
    `Dispute escalated from ${fromTier} to ${toTier} for payout review.`,
  );
  await logAgentActivityIfAgent(auth, {
    action: "dispute_escalated",
    disputeId: id,
    escrowId: dispute.escrowId,
    summary: `Escalated to ${toTier}: ${body.note.slice(0, 280)}`,
    payload: {
      escalationId: escalation.id,
      preliminaryBuyerFavor: body.preliminaryBuyerFavor,
      externalProof: body.externalProof,
    },
  }).catch(() => undefined);
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return escalation;
});

app.get("/v1/me/staff-notifications", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  if (!staffTier(auth)) return reply.code(403).send({ error: "Staff only" });
  return prisma.staffNotification.findMany({
    where: { userId: auth.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
});

app.post("/v1/me/staff-notifications/read", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const body = z.object({ ids: z.array(z.string().uuid()).optional() }).parse(req.body ?? {});
  const where = body.ids?.length ? { userId: auth.id, id: { in: body.ids } } : { userId: auth.id, readAt: null };
  await prisma.staffNotification.updateMany({ where, data: { readAt: new Date() } });
  return { ok: true };
});

async function hasConfirmedTronDisputeFreeze(escrowId: string, disputeId: string): Promise<boolean> {
  const events = await prisma.escrowEvent.findMany({
    where: { escrowId, eventName: "DisputeFreezeConfirmed" },
    select: { payload: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return events.some((event) => {
    const payload = event.payload;
    return !!payload && typeof payload === "object" && !Array.isArray(payload)
      && (payload as Record<string, unknown>).disputeId === disputeId;
  });
}

app.post("/v1/disputes/:id/freeze", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes_release");
  if (!staff) return;
  const { id } = req.params as { id: string };
  const body = z.object({
    resolverAddress: z.string().trim().min(1),
    txHash: z.string().trim().min(1).optional(),
    alreadyFrozen: z.boolean().optional(),
  }).parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true } });
  if (!dispute || !dispute.escrow.tradeCode) return reply.code(404).send({ error: "Shared trade dispute not found" });
  if (dispute.status !== "open") return reply.code(409).send({ error: "Only an open dispute can be frozen for review" });
  if (dispute.escrow.chain !== "tron" || !dispute.escrow.contractAddress) {
    return reply.code(400).send({ error: "Resolver-paid freezing is only available for deployed TRON escrows" });
  }
  if (!body.txHash && !body.alreadyFrozen) {
    return reply.code(400).send({ error: "A confirmed freeze transaction is required" });
  }
  const settings = await ensureSettings();
  const configuredResolver = settings.tronResolverWallet || config.tronResolverWallet;
  if (!configuredResolver || normalizePartyAddress("tron", configuredResolver) !== normalizePartyAddress("tron", body.resolverAddress)) {
    return reply.code(403).send({ error: "The connected wallet is not the configured TRON resolver" });
  }
  if (await hasConfirmedTronDisputeFreeze(dispute.escrowId, id)) return { ok: true, alreadyRecorded: true };
  await prisma.escrowEvent.create({
    data: {
      escrowId: dispute.escrowId,
      eventName: "DisputeFreezeConfirmed",
      txHash: body.txHash,
      payload: { disputeId: id, resolverAddress: configuredResolver, alreadyFrozen: body.alreadyFrozen === true },
    },
  });
  broadcast("dispute:frozen", { escrowId: dispute.escrowId, disputeId: id });
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return { ok: true };
});

/** Moderator/agent rulings start an appeal window; super admin rulings are final. */
app.post("/v1/disputes/:id/resolve", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  const { id } = req.params as { id: string };
  const body = z
    .object({ buyerFavor: z.boolean(), rulingNote: z.string().trim().max(4000).optional() })
    .parse(req.body);
  const existing = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true } });
  if (!existing) return reply.code(404).send({ error: "Dispute not found" });
  if (existing.status !== "open") return reply.code(409).send({ error: "Dispute is not open for a new ruling" });
  if (existing.escrow.tradeCode && existing.escrow.chain === "tron" && existing.escrow.contractAddress
      && !(await hasConfirmedTronDisputeFreeze(existing.escrowId, id))) {
    return reply.code(409).send({ error: "The configured resolver must freeze this TRON escrow on-chain before staff can rule" });
  }
  if (!(await canStaffResolveDispute(staff, existing))) {
    return reply.code(403).send({
      error: canStaffReleaseFunds(staff)
        ? "You are not assigned to resolve this dispute"
        : "Your tier can investigate but cannot release funds — escalate to moderator or admin",
    });
  }
  const isFinalAdminRuling = staff.role === "admin";
  const deadline = isFinalAdminRuling ? null : appealDeadlineFrom();
  const dispute = await prisma.dispute.update({
    where: { id },
    data: {
      status: isFinalAdminRuling ? "final_ruling" : "ruled_pending_appeal",
      buyerFavor: body.buyerFavor,
      rulingNote: body.rulingNote ?? null,
      ruledByUserId: staff.id,
      ruledAt: new Date(),
      appealDeadlineAt: deadline,
      resolution: isFinalAdminRuling
        ? body.buyerFavor ? "buyer_favor_admin_final" : "seller_favor_admin_final"
        : body.buyerFavor ? "buyer_favor_provisional" : "seller_favor_provisional",
    },
  });
  await addTradeSystemMessage(
    dispute.escrowId,
    isFinalAdminRuling
      ? `Super admin issued a final ruling: ${body.buyerFavor ? "buyer favor" : "seller favor"}. The appeal window is closed. On-chain payout may now be finalized.`
      : `Provisional ruling: ${body.buyerFavor ? "buyer favor" : "seller favor"}. The losing party may appeal within 3 days. Funds stay in escrow until the appeal window ends or an appeal is decided.`,
  );
  const losingUserId = body.buyerFavor ? existing.escrow.sellerUserId : existing.escrow.buyerUserId;
  if (losingUserId) {
    const settings = await ensureSettings();
    const deadlineLabel = deadline?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) || "closed";
    const values = {
        tradeTitle: existing.escrow.title,
        favoredParty: body.buyerFavor ? "Buyer" : "Seller",
        appealDays: deadline ? String(Math.max(1, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000))) : "0",
        appealDeadline: deadline ? `${deadlineLabel} UTC` : "closed",
        tradeUrl: `${config.webOrigin}/trades/${dispute.escrowId}`,
      };
    await sendAutomatedDisputeNotification({
      enabled: settings.disputeEmailNotificationsEnabled,
      authorUserId: staff.id,
      recipientUserId: losingUserId,
      escrowId: dispute.escrowId,
      subjectTemplate: isFinalAdminRuling ? settings.disputeFinalEmailSubject : settings.disputeAppealEmailSubject,
      messageTemplate: isFinalAdminRuling ? settings.disputeFinalMessage : settings.disputeAppealMessage,
      values,
      log: req.log,
    });
  }
  if (existing.assignedAgentUserId) {
    await logAgentActivity({
      agentUserId: existing.assignedAgentUserId,
      action: "dispute_ruled",
      disputeId: id,
      escrowId: dispute.escrowId,
      summary: `${isFinalAdminRuling ? "Final" : "Provisional"} ruling (${body.buyerFavor ? "buyer favor" : "seller favor"})${deadline ? ` — appeal until ${deadline.toISOString().slice(0, 10)}` : ""}`,
      payload: { buyerFavor: body.buyerFavor, ruledByUserId: staff.id, rulingNote: body.rulingNote },
    }).catch(() => undefined);
  }
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return dispute;
});

/** Super admin can replace a provisional ruling and close its appeal window with a final ruling. */
app.post("/v1/disputes/:id/final-ruling", async (req, reply) => {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const { id } = req.params as { id: string };
  const body = z
    .object({ buyerFavor: z.boolean(), rulingNote: z.string().trim().max(4000).optional() })
    .parse(req.body);
  const existing = await prisma.dispute.findUnique({ where: { id }, include: { appeal: true, escrow: true } });
  if (!existing) return reply.code(404).send({ error: "Dispute not found" });
  if (existing.status !== "ruled_pending_appeal" || existing.appeal) {
    return reply.code(409).send({ error: "Only a ruling pending appeal without a filed appeal can be changed" });
  }
  const now = new Date();
  const changed = await prisma.dispute.updateMany({
    where: { id, status: "ruled_pending_appeal" },
    data: {
      status: "final_ruling",
      buyerFavor: body.buyerFavor,
      rulingNote: body.rulingNote ?? null,
      ruledByUserId: admin.id,
      ruledAt: now,
      appealDeadlineAt: null,
      resolution: body.buyerFavor ? "buyer_favor_admin_final" : "seller_favor_admin_final",
    },
  });
  if (changed.count !== 1) return reply.code(409).send({ error: "Dispute status changed; refresh and try again" });
  const dispute = await prisma.dispute.findUniqueOrThrow({ where: { id } });
  await addTradeSystemMessage(
    dispute.escrowId,
    `Super admin issued a final ruling: ${body.buyerFavor ? "buyer favor" : "seller favor"}. The appeal window is closed. On-chain payout may now be finalized.`,
  );
  const losingUserId = body.buyerFavor ? existing.escrow.sellerUserId : existing.escrow.buyerUserId;
  if (losingUserId) {
    const settings = await ensureSettings();
    await sendAutomatedDisputeNotification({
      enabled: settings.disputeEmailNotificationsEnabled,
      authorUserId: admin.id,
      recipientUserId: losingUserId,
      escrowId: dispute.escrowId,
      subjectTemplate: settings.disputeFinalEmailSubject,
      messageTemplate: settings.disputeFinalMessage,
      values: {
        tradeTitle: existing.escrow.title,
        favoredParty: body.buyerFavor ? "Buyer" : "Seller",
        appealDays: "0",
        appealDeadline: "closed",
        tradeUrl: `${config.webOrigin}/trades/${dispute.escrowId}`,
      },
      log: req.log,
    });
  }
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return dispute;
});

app.post("/v1/disputes/:id/appeal", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const body = z.object({ reason: z.string().trim().min(1).max(4000) }).parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { escrow: true, appeal: true } });
  if (!dispute) return reply.code(404).send({ error: "Dispute not found" });
  if (dispute.status !== "ruled_pending_appeal" || !isAppealWindowOpen(dispute)) {
    return reply.code(409).send({ error: "Appeal window is closed or no provisional ruling exists" });
  }
  if (dispute.appeal) return reply.code(409).send({ error: "An appeal was already filed" });
  if (dispute.buyerFavor === null) return reply.code(409).send({ error: "No ruling to appeal" });
  const party = await partyRoleOnEscrow(auth.id, dispute.escrow);
  if (!party) return reply.code(403).send({ error: "Only the buyer or seller can appeal" });
  const loser = losingPartyRole(dispute.buyerFavor);
  if (party !== loser) return reply.code(403).send({ error: "Only the losing party can appeal this ruling" });
  const appeal = await prisma.$transaction(async (tx) => {
    const transitioned = await tx.dispute.updateMany({
      where: { id, status: "ruled_pending_appeal", appealDeadlineAt: { gt: new Date() } },
      data: { status: "appealed" },
    });
    if (transitioned.count !== 1) return null;
    return tx.disputeAppeal.create({
      data: {
        disputeId: id,
        filedByUserId: auth.id,
        filedByParty: party,
        reason: body.reason,
      },
    });
  });
  if (!appeal) return reply.code(409).send({ error: "Appeal window closed while the appeal was being submitted" });
  await addTradeSystemMessage(dispute.escrowId, `${party === "buyer" ? "Buyer" : "Seller"} filed an appeal. Payout remains on hold.`);
  const adminIds = await staffUserIdsForTier("admin");
  const modIds = dispute.assignedModeratorUserId ? [dispute.assignedModeratorUserId] : await staffUserIdsForTier("moderator", id);
  await notifyStaffUsers([...new Set([...adminIds, ...modIds])], {
    type: "dispute_appeal_filed",
    title: "Dispute appeal filed",
    message: `${party} appealed a provisional ruling on "${dispute.escrow.title}". Reason: ${body.reason.slice(0, 240)}`,
    disputeId: id,
    escrowId: dispute.escrowId,
    payload: { appealId: appeal.id, filedByParty: party },
  });
  if (dispute.assignedAgentUserId) {
    await logAgentActivity({
      agentUserId: dispute.assignedAgentUserId,
      action: "dispute_appeal_filed",
      disputeId: id,
      escrowId: dispute.escrowId,
      summary: `${party} appealed provisional ruling: ${body.reason.slice(0, 280)}`,
      payload: { appealId: appeal.id, filedByUserId: auth.id },
    }).catch(() => undefined);
  }
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return appeal;
});

app.get("/v1/disputes/:id/appeal-bundle", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  if (staff.role === "agent") return reply.code(403).send({ error: "Moderator or admin only" });
  const { id } = req.params as { id: string };
  const bundle = await buildDisputeAppealBundle(id);
  if (!bundle) return reply.code(404).send({ error: "Dispute not found" });
  return bundle;
});

app.post("/v1/disputes/:id/appeal/decide", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  const { id } = req.params as { id: string };
  const body = z
    .object({
      uphold: z.boolean(),
      newBuyerFavor: z.boolean().optional(),
      decisionNote: z.string().trim().max(4000).optional(),
    })
    .parse(req.body);
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { appeal: true, escrow: true } });
  if (!dispute?.appeal || dispute.status !== "appealed") {
    return reply.code(409).send({ error: "No open appeal on this dispute" });
  }
  if (!canDecideAppeal(staff, dispute)) {
    return reply.code(403).send({ error: "Appeals must be decided by a moderator or admin who did not issue the original agent ruling" });
  }
  if (dispute.ruledByUserId === staff.id && staff.role === "agent") {
    return reply.code(403).send({ error: "The original ruling agent cannot decide the appeal" });
  }
  let finalBuyerFavor = dispute.buyerFavor;
  if (!body.uphold) {
    if (body.newBuyerFavor === undefined) {
      return reply.code(400).send({ error: "newBuyerFavor required when overturning" });
    }
    finalBuyerFavor = body.newBuyerFavor;
  }
  const appeal = await prisma.disputeAppeal.update({
    where: { id: dispute.appeal.id },
    data: {
      status: "decided",
      upholdRuling: body.uphold,
      decisionNote: body.decisionNote,
      decidedByUserId: staff.id,
      decidedAt: new Date(),
    },
  });
  await prisma.dispute.update({
    where: { id },
    data: {
      status: "appeal_decided",
      buyerFavor: finalBuyerFavor,
      resolution: body.uphold ? "appeal_upheld" : "appeal_overturned",
    },
  });
  await addTradeSystemMessage(
    dispute.escrowId,
    body.uphold
      ? "Appeal reviewed: original ruling upheld. Admin may execute on-chain payout when ready."
      : `Appeal reviewed: ruling overturned (${finalBuyerFavor ? "buyer favor" : "seller favor"}). Admin may execute on-chain payout when ready.`,
  );
  const losingUserId = finalBuyerFavor ? dispute.escrow.sellerUserId : dispute.escrow.buyerUserId;
  if (losingUserId) {
    const settings = await ensureSettings();
    await sendAutomatedDisputeNotification({
      enabled: settings.disputeEmailNotificationsEnabled,
      authorUserId: staff.id,
      recipientUserId: losingUserId,
      escrowId: dispute.escrowId,
      subjectTemplate: settings.disputeAppealDecisionEmailSubject,
      messageTemplate: settings.disputeAppealDecisionMessage,
      values: {
        tradeTitle: dispute.escrow.title,
        favoredParty: finalBuyerFavor ? "Buyer" : "Seller",
        appealDays: "0",
        appealDeadline: "closed",
        tradeUrl: `${config.webOrigin}/trades/${dispute.escrowId}`,
      },
      log: req.log,
    });
  }
  if (dispute.assignedAgentUserId) {
    await logAgentActivity({
      agentUserId: dispute.assignedAgentUserId,
      action: "dispute_appeal_decided",
      disputeId: id,
      escrowId: dispute.escrowId,
      summary: `Appeal ${body.uphold ? "upheld" : "overturned"} by ${staff.role}`,
      payload: { uphold: body.uphold, finalBuyerFavor, decidedByUserId: staff.id },
    }).catch(() => undefined);
  }
  broadcast("trade:timeline-updated", { escrowId: dispute.escrowId });
  return appeal;
});

/** Execute on-chain payout after appeal window or appeal decision (client sends tx first, then records hash). */
app.post("/v1/disputes/:id/finalize", async (req, reply) => {
  const staff = await requirePermission(req, reply, "disputes");
  if (!staff) return;
  if (staff.role === "agent") return reply.code(403).send({ error: "Moderator or admin must finalize on-chain payout" });
  const { id } = req.params as { id: string };
  const body = z
    .object({
      buyerFavor: z.boolean(),
      resolverAddress: z.string(),
      txHash: z.string().optional(),
    })
    .parse(req.body);
  const existing = await prisma.dispute.findUnique({ where: { id }, include: { appeal: true, escrow: true } });
  if (!existing) return reply.code(404).send({ error: "Dispute not found" });
  if (existing.escrow.tradeCode && existing.escrow.chain === "tron" && existing.escrow.contractAddress
      && !(await hasConfirmedTronDisputeFreeze(existing.escrowId, id))) {
    return reply.code(409).send({ error: "The configured resolver must freeze this TRON escrow before payout can be recorded" });
  }
  if (existing.escrow.contractAddress && !body.txHash) {
    return reply.code(400).send({ error: "On-chain transaction hash is required before a deployed escrow can be marked paid" });
  }
  if (!canExecuteOnChainPayout(existing)) {
    return reply.code(409).send({
      error: "Payout not ready — wait for the 3-day appeal window to end without appeal, or decide an open appeal first",
    });
  }
  if (existing.buyerFavor !== null && existing.buyerFavor !== body.buyerFavor) {
    return reply.code(400).send({ error: "buyerFavor must match the final ruling in the database" });
  }
  const dispute = await prisma.dispute.update({
    where: { id },
    data: {
      status: "resolved",
      buyerFavor: body.buyerFavor,
      resolution: body.buyerFavor ? "buyer_favor_final" : "seller_favor_final",
      resolverAddress: body.resolverAddress.startsWith("0x") ? body.resolverAddress.toLowerCase() : body.resolverAddress,
      onChainResolveTxHash: body.txHash,
      resolvedAt: new Date(),
    },
  });
  await prisma.escrow.update({ where: { id: dispute.escrowId }, data: { status: "Resolved" } });
  if (existing.assignedAgentUserId) {
    await prisma.agent.updateMany({
      where: { userId: existing.assignedAgentUserId },
      data: { disputesResolved: { increment: 1 } },
    });
    await creditAgentForFinalizedDispute(existing.assignedAgentUserId, dispute.escrowId, dispute.id).catch(() => undefined);
    await logAgentActivity({
      agentUserId: existing.assignedAgentUserId,
      action: "dispute_payout_finalized",
      disputeId: id,
      escrowId: dispute.escrowId,
      summary: `On-chain payout finalized (${body.buyerFavor ? "buyer favor" : "seller favor"})`,
      payload: { buyerFavor: body.buyerFavor, txHash: body.txHash, finalizedByUserId: staff.id },
    }).catch(() => undefined);
  }
  await prisma.disputeEscalation.updateMany({
    where: { disputeId: id, status: "pending" },
    data: { status: "resolved" },
  });
  broadcast("dispute:resolved", dispute);
  const tradeRow = await prisma.escrow.findUnique({ where: { id: dispute.escrowId }, select: { title: true, buyerUserId: true, sellerUserId: true } });
  if (tradeRow) {
    void notifyDisputeResolved({
      escrowId: dispute.escrowId,
      title: tradeRow.title,
      buyerFavor: Boolean(body.buyerFavor),
      buyerUserId: tradeRow.buyerUserId,
      sellerUserId: tradeRow.sellerUserId,
    }).catch(() => {});
  }
  return dispute;
});

const PLATFORM_SETTING_KEYS = new Set([
  "feeRecipientWallet",
  "resolutionMode",
  "agentModeEnabled",
  "usdcAddress",
  "usdtAddress",
  "thirdStablecoinAddress",
  "factoryAddress",
  "tronSupportEnabled",
  "tronUsdtAddress",
  "tronFactoryAddress",
  "tronFeeRecipientWallet",
  "tronResolverWallet",
  "siteNoticeEnabled",
  "siteNoticeTitle",
  "siteNoticeBody",
  "siteNoticeAudience",
  "siteNoticeDelaySeconds",
]);

const SITE_NOTICE_SETTING_KEYS = new Set(["siteNoticeEnabled", "siteNoticeTitle", "siteNoticeBody", "siteNoticeAudience", "siteNoticeDelaySeconds"]);
function emailSettingsView(settings: {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  smtpSecure?: boolean;
  smtpPassConfigured?: boolean;
  remindersEnabled?: unknown;
  reminderEmailSubject?: unknown;
  reminderEmailBody?: unknown;
  disputeEmailNotificationsEnabled?: unknown;
  disputeAppealMessage?: unknown;
  disputeFinalMessage?: unknown;
  disputeAppealEmailSubject?: unknown;
  disputeFinalEmailSubject?: unknown;
  disputeAppealDecisionMessage?: unknown;
  disputeAppealDecisionEmailSubject?: unknown;
}) {
  return {
    emailConfigured: Boolean(settings.smtpHost?.trim()),
    smtpHost: settings.smtpHost ?? null,
    smtpPort: settings.smtpPort ?? null,
    smtpUser: settings.smtpUser ?? null,
    smtpFrom: settings.smtpFrom ?? null,
    smtpSecure: settings.smtpSecure ?? false,
    smtpPassConfigured: Boolean(settings.smtpPassConfigured),
    remindersEnabled: Boolean(settings.remindersEnabled),
    reminderEmailSubject: typeof settings.reminderEmailSubject === "string" ? settings.reminderEmailSubject : null,
    reminderEmailBody: typeof settings.reminderEmailBody === "string" ? settings.reminderEmailBody : null,
    disputeEmailNotificationsEnabled: settings.disputeEmailNotificationsEnabled !== false,
    disputeAppealMessage: typeof settings.disputeAppealMessage === "string" ? settings.disputeAppealMessage : null,
    disputeFinalMessage: typeof settings.disputeFinalMessage === "string" ? settings.disputeFinalMessage : null,
    disputeAppealEmailSubject: typeof settings.disputeAppealEmailSubject === "string" ? settings.disputeAppealEmailSubject : null,
    disputeFinalEmailSubject: typeof settings.disputeFinalEmailSubject === "string" ? settings.disputeFinalEmailSubject : null,
    disputeAppealDecisionMessage: typeof settings.disputeAppealDecisionMessage === "string" ? settings.disputeAppealDecisionMessage : null,
    disputeAppealDecisionEmailSubject: typeof settings.disputeAppealDecisionEmailSubject === "string" ? settings.disputeAppealDecisionEmailSubject : null,
  };
}

const EMAIL_SETTING_KEYS = new Set([
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPass",
  "smtpFrom",
  "smtpSecure",
  "clearSmtpPass",
  "remindersEnabled",
  "reminderEmailSubject",
  "reminderEmailBody",
  "disputeEmailNotificationsEnabled",
  "disputeAppealMessage",
  "disputeFinalMessage",
  "disputeAppealEmailSubject",
  "disputeFinalEmailSubject",
  "disputeAppealDecisionMessage",
  "disputeAppealDecisionEmailSubject",
]);

app.put("/v1/admin/settings", async (req, reply) => {
  const actor = await requireActor(req, reply);
  if (!actor) return;
  const body = z
    .object({
      feeRecipientWallet: z.string().optional(),
      resolutionMode: z.enum(["admin", "agent"]).optional(),
      agentModeEnabled: z.boolean().optional(),
      usdcAddress: z.string().optional(),
      usdtAddress: z.string().optional(),
      thirdStablecoinAddress: z.string().optional(),
      factoryAddress: z.string().optional(),
      tronSupportEnabled: z.boolean().optional(),
      tronUsdtAddress: z.string().optional(),
      tronFactoryAddress: z.string().optional(),
      tronFeeRecipientWallet: z.string().optional(),
      tronResolverWallet: z.string().optional(),
      smtpHost: z.string().max(255).nullable().optional(),
      smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
      smtpUser: z.string().max(255).nullable().optional(),
      smtpPass: z.string().max(512).optional(),
      smtpFrom: z.string().max(255).nullable().optional(),
      smtpSecure: z.boolean().optional(),
      clearSmtpPass: z.boolean().optional(),
      siteTitle: z.string().max(120).nullable().optional(),
      siteLogoUrl: z.string().max(2048).nullable().optional(),
      siteFaviconUrl: z.string().max(2048).nullable().optional(),
      metaDescription: z.string().max(2000).nullable().optional(),
      metaKeywords: z.string().max(4000).nullable().optional(),
      feedbackEnabled: z.boolean().optional(),
      referralLeaderboardEnabled: z.boolean().optional(),
      mobileAppsEnabled: z.boolean().optional(),
      iosAppStoreUrl: z.string().max(2048).nullable().optional(),
      androidPlayStoreUrl: z.string().max(2048).nullable().optional(),
      telegramUrl: z.string().max(2048).nullable().optional(),
      xUrl: z.string().max(2048).nullable().optional(),
      discordUrl: z.string().max(2048).nullable().optional(),
      remindersEnabled: z.boolean().optional(),
      reminderEmailSubject: z.string().max(180).nullable().optional(),
      reminderEmailBody: z.string().max(8000).nullable().optional(),
      disputeEmailNotificationsEnabled: z.boolean().optional(),
      disputeAppealEmailSubject: z.string().trim().min(1).max(180).optional(),
      disputeFinalEmailSubject: z.string().trim().min(1).max(180).optional(),
      disputeAppealDecisionEmailSubject: z.string().trim().min(1).max(180).optional(),
      disputeAppealDecisionMessage: z.string().trim().min(1).max(4000).optional(),
      siteNoticeEnabled: z.boolean().optional(),
      siteNoticeTitle: z.string().trim().min(1).max(120).optional(),
      siteNoticeBody: z.string().trim().min(1).max(3000).optional(),
      siteNoticeAudience: z.enum(["all", "mobile", "desktop"]).optional(),
      siteNoticeDelaySeconds: z.number().int().min(0).max(300).optional(),
      disputeAppealMessage: z.string().trim().min(1).max(4000).optional(),
      disputeFinalMessage: z.string().trim().min(1).max(4000).optional(),
      fieldNotesLimit: z.number().int().min(1).max(24).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    const issue = body.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const labels: Record<string, string> = {
      siteTitle: "Site title",
      metaDescription: "Meta description",
      metaKeywords: "Meta keywords",
      siteLogoUrl: "Logo",
      siteFaviconUrl: "Favicon",
    };
    const label = labels[field] || "A field";
    const maximum = issue && "maximum" in issue ? issue.maximum : undefined;
    const error = issue?.code === "too_big" && maximum !== undefined
      ? `${label} can be at most ${maximum} characters.`
      : issue?.message || "Check the form and try again.";
    return reply.code(400).send({ error });
  }

  const keys = Object.keys(body.data);
  const touchesPlatform = keys.some((key) => PLATFORM_SETTING_KEYS.has(key));
  const touchesSiteNotice = keys.some((key) => SITE_NOTICE_SETTING_KEYS.has(key));
  const touchesEmail = keys.some((key) => EMAIL_SETTING_KEYS.has(key));
  const touchesOther = keys.some((key) => !PLATFORM_SETTING_KEYS.has(key) && !EMAIL_SETTING_KEYS.has(key));
  const superAdmin = actor.role === "admin";
  const canEmail = superAdmin || actor.permissions.includes("email");
  if ((touchesPlatform || touchesOther) && !superAdmin) {
    return reply.code(403).send({ error: "Escrow platform and site settings are super admin only" });
  }
  if (touchesEmail && !canEmail) {
    return reply.code(403).send({ error: "You do not have the email privilege" });
  }
  if (!superAdmin && !canEmail) {
    return reply.code(403).send({ error: "Only the super admin can do that" });
  }

  const {
    smtpPass,
    clearSmtpPass,
    ...rest
  } = body.data;
  const data: Prisma.PlatformSettingsUpdateInput = { ...rest };
  if (touchesSiteNotice) data.siteNoticeRevision = { increment: 1 };
  if (clearSmtpPass) data.smtpPass = null;
  else if (smtpPass !== undefined && smtpPass.length > 0) data.smtpPass = smtpPass;

  const settings = await prisma.platformSettings.update({ where: { id: 1 }, data });
  invalidateSmtpCache();
  const view = adminSettingsView(settings);
  return superAdmin ? view : emailSettingsView(view);
});

app.get("/v1/admin/email/recipients", async (req, reply) => {
  const staff = await requirePermission(req, reply, "email");
  if (!staff) return;
  const query = z.object({ q: z.string().trim().min(2).max(100) }).safeParse(req.query ?? {});
  if (!query.success) return reply.code(400).send({ error: "Search with at least two characters" });
  const term = query.data.q;
  return prisma.user.findMany({
    where: {
      email: { not: null },
      OR: [
        { email: { contains: term, mode: "insensitive" } },
        { displayName: { contains: term, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
    select: { id: true, email: true, displayName: true },
  });
});

app.post("/v1/admin/email/send", async (req, reply) => {
  const staff = await requirePermission(req, reply, "email");
  if (!staff) return;
  const body = z.object({
    userId: z.string().uuid(),
    subject: z.string().trim().min(1).max(180),
    message: z.string().trim().min(1).max(8000),
  }).parse(req.body);
  const recipient = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, email: true } });
  if (!recipient) return reply.code(404).send({ error: "User not found" });
  if (!recipient.email) return reply.code(409).send({ error: "This user has no email address" });
  const result = await sendAdminEmailMessage({
    to: recipient.email,
    subject: body.subject,
    message: body.message,
    log: req.log,
  });
  if (!result.sent) return reply.code(503).send({ error: result.reason });
  req.log.info({ staffUserId: staff.id, recipientUserId: recipient.id }, "Admin email sent");
  return { ok: true };
});

app.get("/v1/activity", async () => {
  const events = await prisma.escrowEvent.findMany({
    where: { NOT: { eventName: { startsWith: "DeadlineReminder:" } } },
    take: 50,
    orderBy: { id: "desc" },
    include: { escrow: true },
  });
  return events.map((e) => ({
    ...e,
    id: e.id.toString(),
    blockNumber: e.blockNumber?.toString() ?? null,
    explorerTx: e.txHash
      ? e.escrow.chain === "tron" ? `https://tronscan.org/#/transaction/${e.txHash}` : e.escrow.chain === "ethereum" ? `https://etherscan.io/tx/${e.txHash}` : null
      : null,
    explorerContract: e.escrow.contractAddress
      ? e.escrow.chain === "tron" ? `https://tronscan.org/#/address/${e.escrow.contractAddress}` : e.escrow.chain === "ethereum" ? `https://etherscan.io/address/${e.escrow.contractAddress}` : null
      : null,
  }));
});

app.register(async (fastify) => {
  fastify.get("/v1/ws", { websocket: true }, (socket) => {
    const client = { send: (d: string) => socket.send(d) };
    const off = registerClient(client);
    socket.on("close", off);
  });
});

function signalForIndexedEvent(eventName: string, payload?: Record<string, unknown>): string | null {
  if (eventName === "CancelRequested") return "trade:cancel-requested";
  if (eventName === "CancelRefused") return "trade:cancel-refused";
  if (eventName === "Cancelled") return "trade:cancelled";
  if (eventName === "ProofSubmitted") return "trade:release-requested";
  if (eventName === "Released") return "trade:completed";
  if (eventName === "StateChanged") {
    const next = Number(payload?.newState);
    if (next === 2) return "trade:release-requested";
    if (next === 3) return "trade:completed";
    if (next === 4) return "trade:cancelled";
  }
  return null;
}

app.post("/v1/escrows/:id/signals", async (req, reply) => {
  const auth = await requireUser(req, reply);
  if (!auth) return;
  const { id } = req.params as { id: string };
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow) return reply.code(404).send({ error: "Not found" });
  const role = await escrowPartyRole(auth, escrow);
  if (!role || role === "admin") return reply.code(403).send({ error: "Only the buyer or seller can signal this trade" });
  const body = z.object({
    kind: z.enum(["cancel-requested", "cancel-refused", "cancelled", "funded", "release-requested", "completed"]),
  }).parse(req.body);
  const statusForKind: Partial<Record<typeof body.kind, string>> = {
    funded: "Funded",
    "release-requested": "InProgress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  const nextStatus = statusForKind[body.kind];
  if (escrow.chain === "ethereum" && ["funded", "completed", "cancelled"].includes(body.kind)) {
    try {
      const confirmed = await ethereumFunding.get(id);
      const valid = body.kind === "funded" ? [1, 2, 3].includes(confirmed.chainState ?? -1)
        : body.kind === "completed" ? confirmed.chainState === 3 : confirmed.chainState === 4;
      if (!valid) return reply.code(409).send({ error: "The Ethereum payment state is not confirmed. Token approval is not payment." });
    } catch {
      return reply.code(409).send({ error: "Could not verify the Ethereum payment state. The requested status change was not applied." });
    }
  }
  const statusRank: Record<string, number> = {
    AwaitingSeller: 0,
    AwaitingFunding: 0,
    Created: 0,
    Funded: 1,
    InProgress: 2,
    Completed: 3,
    Cancelled: 3,
    Disputed: 3,
    Resolved: 4,
  };
  const currentRank = statusRank[escrow.status] ?? 0;
  const nextRank = nextStatus ? statusRank[nextStatus] ?? 0 : 0;
  if (nextStatus && escrow.status !== nextStatus && nextRank > currentRank) {
    const patch: { status: string; deliveryDeadlineAt?: Date; reviewDeadlineAt?: Date } = { status: nextStatus };
    if (escrow.tradeCode && nextStatus === "Funded" && !escrow.deliveryDeadlineAt) {
      patch.deliveryDeadlineAt = new Date(Date.now() + escrow.deliveryWindowHours * 60 * 60 * 1000);
    }
    if (escrow.tradeCode && nextStatus === "InProgress" && !escrow.reviewDeadlineAt) {
      patch.reviewDeadlineAt = new Date(Date.now() + escrow.reviewWindowHours * 60 * 60 * 1000);
    }
    await prisma.escrow.update({ where: { id }, data: patch });
  }
  if (body.kind === "completed") {
    const row = await prisma.escrow.findUnique({ where: { id }, select: { status: true } });
    if (row?.status === "Completed") {
      await processEscrowCompletion(id).catch(() => undefined);
    }
  }
  broadcast(`trade:${body.kind}`, { escrowId: id });
  broadcast("trade:timeline-updated", { escrowId: id });
  if (body.kind === "cancel-requested") {
    void notifyCancelRequested({
      escrowId: id,
      title: escrow.title,
      requesterRole: role === "seller" ? "seller" : "buyer",
      buyerUserId: escrow.buyerUserId,
      sellerUserId: escrow.sellerUserId,
    }).catch(() => {});
  } else if (body.kind === "cancel-refused") {
    void notifyCancelRefused({
      escrowId: id,
      title: escrow.title,
      buyerUserId: escrow.buyerUserId,
    }).catch(() => {});
  } else if (body.kind === "cancelled") {
    void notifyTradeCancelled({
      escrowId: id,
      title: escrow.title,
      buyerUserId: escrow.buyerUserId,
      sellerUserId: escrow.sellerUserId,
    }).catch(() => {});
  } else if (body.kind === "completed") {
    void notifyTradeCompleted({
      escrowId: id,
      title: escrow.title,
      amountAtomic: escrow.amountAtomic,
      buyerUserId: escrow.buyerUserId,
      sellerUserId: escrow.sellerUserId,
    }).catch(() => {});
  }
  return { ok: true };
});

app.post("/v1/indexer/ingest", async (req, reply) => {
  const indexerKey = req.headers["x-indexer-key"];
  if (typeof indexerKey !== "string" || !indexerKey || !secretsMatch(indexerKey, config.indexerApiKey)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const body = z
    .object({
      chain: z.enum(["ethereum", "tron"]).optional(),
      contractAddress: z.string().optional(),
      eventName: z.string(),
      txHash: z.string().optional(),
      blockNumber: z.string().optional(),
      payload: z.record(z.unknown()).optional(),
    })
    .parse(req.body);

  try {
    const { escrow, eventName } = await handleIndexerIngest(body);
    broadcast("indexer:event", { escrow, eventName });
    const signal = signalForIndexedEvent(eventName, body.payload);
    if (signal) broadcast(signal, { escrowId: escrow.id });
    if (eventName === "DisputeOpened" || (eventName === "StateChanged" && Number(body.payload?.newState) === 5)) {
      broadcast("dispute:opened", { escrowId: escrow.id });
    }
    return { ok: true, escrowId: escrow.id };
  } catch (e) {
    if (e instanceof IngestError) {
      return reply.code(e.statusCode).send({ error: e.message });
    }
    throw e;
  }
});

}

const start = async () => {
  await build();
  startPushNotificationWorkers();
  await ensureSettings();
  await ensureAdminUser();
  if (await isSmtpConfigured()) {
    console.info("Outbound email: enabled (database or SMTP_* environment)");
  } else {
    console.warn("Outbound email: disabled — configure SMTP in Admin → Email delivery");
  }
  await app.listen({ port: config.port, host: "0.0.0.0" });

  const reminderLog = { info: (obj: object, msg?: string) => app.log.info(obj, msg) };
  void runDeadlineReminders(reminderLog);
  setInterval(() => {
    void runDeadlineReminders(reminderLog);
  }, 15 * 60 * 1000);
};

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
