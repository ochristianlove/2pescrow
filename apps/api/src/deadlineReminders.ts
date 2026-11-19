import { prisma } from "./db";
import { sendTradeDeadlineReminderEmail } from "./email";
import { broadcast } from "./wsHub";
import { createTradeNotification } from "./notifications";

const DEFAULT_REMINDER_SUBJECT = "2Pescrow reminder · {{tradeTitle}}";
const DEFAULT_REMINDER_BODY = [
  "Hi,",
  "",
  "{{message}}",
  "",
  "Open your trade room on 2Pescrow to take the next step.",
  "",
  "— 2Pescrow",
].join("\n");

const TERMINAL_STATUSES = new Set(["Completed", "Cancelled", "Resolved"]);
const MS_DAY = 24 * 60 * 60 * 1000;

type DeadlineKind = "join" | "fund" | "delivery" | "review";

type DeadlineTarget = {
  kind: DeadlineKind;
  at: Date;
  label: string;
  audience: "buyer" | "seller" | "both";
};

type LogLike = {
  info: (obj: object, msg?: string) => void;
  warn?: (obj: object, msg?: string) => void;
};

function reminderEventName(key: string) {
  return `DeadlineReminder:${key}`;
}

function phaseFor(deadline: Date, now: Date): "soon" | "overdue" | null {
  const diff = deadline.getTime() - now.getTime();
  if (diff > 0 && diff <= MS_DAY) return "soon";
  if (diff <= 0 && diff > -MS_DAY) return "overdue";
  return null;
}

function buildTargets(escrow: {
  status: string;
  tradeCode: string | null;
  sellerUserId: string | null;
  joinDeadlineAt: Date | null;
  fundDeadlineAt: Date | null;
  deliveryDeadlineAt: Date | null;
  reviewDeadlineAt: Date | null;
  title: string;
}): DeadlineTarget[] {
  if (!escrow.tradeCode) return [];
  const out: DeadlineTarget[] = [];
  if (escrow.status === "AwaitingSeller" && escrow.joinDeadlineAt && !escrow.sellerUserId) {
    out.push({
      kind: "join",
      at: escrow.joinDeadlineAt,
      label: "Seller join deadline",
      audience: "buyer",
    });
  }
  if (escrow.status === "AwaitingFunding" && escrow.fundDeadlineAt) {
    out.push({
      kind: "fund",
      at: escrow.fundDeadlineAt,
      label: "Buyer funding deadline",
      audience: "buyer",
    });
  }
  if (["Funded", "InProgress"].includes(escrow.status) && escrow.deliveryDeadlineAt) {
    out.push({
      kind: "delivery",
      at: escrow.deliveryDeadlineAt,
      label: "Seller delivery deadline",
      audience: "both",
    });
  }
  if (escrow.status === "InProgress" && escrow.reviewDeadlineAt) {
    out.push({
      kind: "review",
      at: escrow.reviewDeadlineAt,
      label: "Buyer protection period ends",
      audience: "both",
    });
  }
  return out;
}

function messageFor(kind: DeadlineKind, phase: "soon" | "overdue", title: string, when: Date): string {
  const whenStr = when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const prefix = phase === "soon" ? "Reminder" : "Follow-up";
  switch (kind) {
    case "join":
      return `${prefix}: seller join deadline for “${title}” is ${phase === "soon" ? "approaching" : "past"} (${whenStr}). Share your trade code or follow up in the trade room.`;
    case "fund":
      return `${prefix}: funding deadline for “${title}” is ${phase === "soon" ? "approaching" : "past"} (${whenStr}). Complete escrow funding when both wallets are linked.`;
    case "delivery":
      return `${prefix}: delivery deadline for “${title}” is ${phase === "soon" ? "approaching" : "past"} (${whenStr}). Submit fulfilment in the trade room if you are the seller.`;
    case "review":
      return `${prefix}: buyer protection ends for “${title}” ${phase === "soon" ? "soon" : "has passed"} (${whenStr}). Review fulfilment, release funds, or open a dispute if needed.`;
  }
}

async function alreadySent(escrowId: string, key: string) {
  const name = reminderEventName(key);
  const row = await prisma.escrowEvent.findFirst({
    where: { escrowId, eventName: name },
    select: { id: true },
  });
  return !!row;
}

async function markSent(escrowId: string, key: string, payload: object) {
  await prisma.escrowEvent.create({
    data: {
      escrowId,
      eventName: reminderEventName(key),
      payload,
    },
  });
}

async function notifyParties(opts: {
  escrowId: string;
  title: string;
  message: string;
  phase: string;
  kind: DeadlineKind;
  deadline: string;
  buyerUserId: string | null;
  sellerUserId: string | null;
  buyerEmail: string | null;
  sellerEmail: string | null;
  audience: "buyer" | "seller" | "both";
  subjectTemplate: string;
  bodyTemplate: string;
  log: LogLike;
}) {
  broadcast("trade:deadline-reminder", { escrowId: opts.escrowId, message: opts.message });

  if ((opts.audience === "buyer" || opts.audience === "both") && opts.buyerUserId) {
    void createTradeNotification({
      recipientUserId: opts.buyerUserId,
      escrowId: opts.escrowId,
      type: "trade:deadline-reminder",
      title: "Trade deadline reminder",
      message: opts.message,
      data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
      eventId: `deadline:${opts.escrowId}:${opts.phase}:${opts.kind}:buyer`,
    }).catch(() => undefined);
  }
  if ((opts.audience === "seller" || opts.audience === "both") && opts.sellerUserId) {
    void createTradeNotification({
      recipientUserId: opts.sellerUserId,
      escrowId: opts.escrowId,
      type: "trade:deadline-reminder",
      title: "Trade deadline reminder",
      message: opts.message,
      data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
      eventId: `deadline:${opts.escrowId}:${opts.phase}:${opts.kind}:seller`,
    }).catch(() => undefined);
  }

  const recipients: string[] = [];
  if ((opts.audience === "buyer" || opts.audience === "both") && opts.buyerEmail) {
    recipients.push(opts.buyerEmail);
  }
  if ((opts.audience === "seller" || opts.audience === "both") && opts.sellerEmail) {
    recipients.push(opts.sellerEmail);
  }
  const unique = [...new Set(recipients.map((e) => e.toLowerCase()))];
  const values = {
    tradeTitle: opts.title,
    message: opts.message,
    phase: opts.phase,
    deadline: opts.deadline,
  };
  for (const to of unique) {
    await sendTradeDeadlineReminderEmail({
      to,
      subject: fillTemplate(opts.subjectTemplate, values),
      body: fillTemplate(opts.bodyTemplate, values),
      log: opts.log,
    });
  }
}

function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

export async function runDeadlineReminders(log: LogLike) {
  const settings = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  if (!settings?.remindersEnabled) return;
  const now = new Date();
  const escrows = await prisma.escrow.findMany({
    where: {
      tradeCode: { not: null },
      status: { notIn: [...TERMINAL_STATUSES] },
    },
    include: {
      buyerUser: { select: { email: true } },
      sellerUser: { select: { email: true } },
    },
    take: 200,
  });

  let sent = 0;
  for (const escrow of escrows) {
    const targets = buildTargets(escrow);
    for (const target of targets) {
      const phase = phaseFor(target.at, now);
      if (!phase) continue;
      const key = `${target.kind}:${phase}:${target.at.toISOString().slice(0, 10)}`;
      if (await alreadySent(escrow.id, key)) continue;

      const message = messageFor(target.kind, phase, escrow.title, target.at);
      await notifyParties({
        escrowId: escrow.id,
        title: escrow.title,
        message,
        phase,
        kind: target.kind,
        deadline: target.at.toISOString(),
        buyerUserId: escrow.buyerUserId,
        sellerUserId: escrow.sellerUserId,
        buyerEmail: escrow.buyerUser?.email ?? null,
        sellerEmail: escrow.sellerUser?.email ?? null,
        audience: target.audience,
        subjectTemplate: settings.reminderEmailSubject?.trim() || DEFAULT_REMINDER_SUBJECT,
        bodyTemplate: settings.reminderEmailBody?.trim() || DEFAULT_REMINDER_BODY,
        log,
      });
      await markSent(escrow.id, key, { kind: target.kind, phase, deadlineAt: target.at.toISOString() });
      sent += 1;
    }
  }
  if (sent > 0) log.info({ sent }, "Deadline reminders dispatched");
}
