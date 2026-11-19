import { prisma } from "./db";

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  badge?: number;
  categoryId?: string;
};

export type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: "DeviceNotRegistered" | "InvalidCredentials" | "MessageTooBig" | "MessageRateExceeded" | string;
    [key: string]: unknown;
  };
};

export type ExpoPushReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: {
    error?: "DeviceNotRegistered" | "InvalidCredentials" | "MessageTooBig" | "MessageRateExceeded" | string;
    [key: string]: unknown;
  };
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

export function isExpoPushToken(token: string): boolean {
  return typeof token === "string" && /^(ExponentPushToken|ExpoPushToken)\[.*\]$/.test(token.trim());
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getExpoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Sends a batch of push messages to Expo Push Service (up to 100 per chunk).
 */
export async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  const chunks = chunkArray(messages, 100);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: getExpoHeaders(),
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(`[PushService] Expo push send HTTP ${response.status}: ${errorText}`);
        for (let i = 0; i < chunk.length; i++) {
          tickets.push({ status: "error", message: `HTTP ${response.status}: ${errorText}` });
        }
        continue;
      }

      const resJson = (await response.json()) as { data?: ExpoPushTicket[]; errors?: unknown };
      if (Array.isArray(resJson.data)) {
        tickets.push(...resJson.data);
      } else {
        console.warn("[PushService] Unexpected response structure from Expo push:", resJson);
        for (let i = 0; i < chunk.length; i++) {
          tickets.push({ status: "error", message: "Unexpected response format" });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[PushService] Failed to send push chunk to Expo: ${message}`);
      for (let i = 0; i < chunk.length; i++) {
        tickets.push({ status: "error", message });
      }
    }
  }

  return tickets;
}

/**
 * Polls Expo push receipts for ticket IDs.
 */
export async function fetchExpoPushReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
  if (ticketIds.length === 0) return {};

  const chunks = chunkArray(ticketIds, 1000);
  const receipts: Record<string, ExpoPushReceipt> = {};

  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: getExpoHeaders(),
        body: JSON.stringify({ ids: chunk }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        console.warn(`[PushService] Expo receipts HTTP ${response.status}`);
        continue;
      }

      const resJson = (await response.json()) as { data?: Record<string, ExpoPushReceipt> };
      if (resJson.data) {
        Object.assign(receipts, resJson.data);
      }
    } catch (err: unknown) {
      console.warn(`[PushService] Failed to fetch push receipts: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return receipts;
}

/**
 * Removes or deactivates invalid tokens reported by Expo (e.g. DeviceNotRegistered).
 */
export async function handleInvalidPushToken(token: string, reason: string): Promise<void> {
  console.info(`[PushService] Deactivating invalid push token (${reason}): ${token.slice(0, 24)}...`);
  try {
    await prisma.devicePushToken.updateMany({
      where: { token },
      data: { isActive: false },
    });
  } catch (err) {
    console.error("[PushService] Error deactivating push token:", err);
  }
}

/**
 * Processes queued push jobs in the database:
 * 1. Finds pending jobs whose nextRetryAt is null or past.
 * 2. Prepares messages with notification data.
 * 3. Sends in batches to Expo.
 * 4. Records ticket IDs and handles errors.
 */
export async function processPendingPushJobs(maxBatch = 50): Promise<number> {
  const now = new Date();
  const jobs = await prisma.pushDeliveryJob.findMany({
    where: {
      status: "pending",
      attempts: { lt: 3 },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    include: {
      notification: true,
    },
    take: maxBatch,
    orderBy: { createdAt: "asc" },
  });

  if (jobs.length === 0) return 0;

  const messages: ExpoPushMessage[] = jobs.map((job) => {
    const rawData = job.notification.data;
    const dataObj = rawData && typeof rawData === "object" && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};

    return {
      to: job.token,
      title: job.notification.title || "2Pescrow",
      body: job.notification.message,
      data: {
        ...dataObj,
        notificationId: job.notification.id,
        escrowId: job.notification.escrowId ?? undefined,
        type: job.notification.type,
      },
      sound: "default",
      priority: "high",
      channelId: job.notification.type.startsWith("chat:") ? "trade-messages" : "trade-updates",
    };
  });

  const tickets = await sendExpoPushBatch(messages);

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const ticket = tickets[i];
    if (!ticket) continue;

    if (ticket.status === "ok" && ticket.id) {
      await prisma.pushDeliveryJob.update({
        where: { id: job.id },
        data: {
          status: "sent",
          ticketId: ticket.id,
          lastError: null,
          attempts: job.attempts + 1,
        },
      });
    } else {
      const errDetails = ticket.details?.error;
      const errMsg = ticket.message || String(errDetails || "Unknown error");

      if (errDetails === "DeviceNotRegistered") {
        await handleInvalidPushToken(job.token, "DeviceNotRegistered");
        await prisma.pushDeliveryJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            lastError: "DeviceNotRegistered",
            attempts: job.attempts + 1,
          },
        });
      } else {
        const nextAttempts = job.attempts + 1;
        const willRetry = nextAttempts < 3;
        // Exponential backoff: 30s, 2m, 8m
        const delayMs = Math.pow(4, nextAttempts) * 7500;
        await prisma.pushDeliveryJob.update({
          where: { id: job.id },
          data: {
            status: willRetry ? "pending" : "failed",
            attempts: nextAttempts,
            lastError: errMsg.slice(0, 500),
            nextRetryAt: willRetry ? new Date(Date.now() + delayMs) : null,
          },
        });
      }
    }
  }

  return jobs.length;
}

/**
 * Polls receipts for jobs that were successfully sent and have a ticketId.
 */
export async function processPendingPushReceipts(maxBatch = 100): Promise<number> {
  const sentJobs = await prisma.pushDeliveryJob.findMany({
    where: {
      status: "sent",
      ticketId: { not: null },
    },
    take: maxBatch,
    orderBy: { createdAt: "asc" },
  });

  if (sentJobs.length === 0) return 0;

  const ticketMap = new Map<string, (typeof sentJobs)[0]>();
  for (const job of sentJobs) {
    if (job.ticketId) ticketMap.set(job.ticketId, job);
  }

  const ticketIds = Array.from(ticketMap.keys());
  const receipts = await fetchExpoPushReceipts(ticketIds);

  for (const [ticketId, receipt] of Object.entries(receipts)) {
    const job = ticketMap.get(ticketId);
    if (!job) continue;

    if (receipt.status === "ok") {
      await prisma.pushDeliveryJob.update({
        where: { id: job.id },
        data: { status: "delivered", lastError: null },
      });
    } else {
      const errDetails = receipt.details?.error;
      const errMsg = receipt.message || String(errDetails || "Delivery failed");

      if (errDetails === "DeviceNotRegistered") {
        await handleInvalidPushToken(job.token, "DeviceNotRegistered (receipt)");
      }

      await prisma.pushDeliveryJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError: errMsg.slice(0, 500),
        },
      });
    }
  }

  return Object.keys(receipts).length;
}
