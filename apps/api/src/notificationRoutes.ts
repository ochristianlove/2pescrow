import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./db";
import { verifyToken } from "./auth";
import { isExpoPushToken, processPendingPushJobs, processPendingPushReceipts } from "./pushService";
import {
  getUserInbox,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getOrCreateNotificationPreferences,
} from "./notifications";

const DeviceTokenSchema = z.object({
  token: z.string().min(10).max(256),
  platform: z.enum(["ios", "android"]),
  deviceId: z.string().max(128).optional(),
  appVersion: z.string().max(32).optional(),
});

const DeleteDeviceTokenSchema = z.object({
  token: z.string().optional(),
  deviceId: z.string().optional(),
});

const PreferencesUpdateSchema = z.object({
  pushEnabled: z.boolean().optional(),
  tradeUpdates: z.boolean().optional(),
  chatMessages: z.boolean().optional(),
  deadlineReminders: z.boolean().optional(),
  lockScreenPrivacy: z.enum(["private", "detailed"]).optional(),
  soundEnabled: z.boolean().optional(),
  muteCompletedTrades: z.boolean().optional(),
});

async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Sign in required" });
    return null;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    reply.code(401).send({ error: "Invalid or expired session" });
    return null;
  }
  return payload.sub;
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  // 1. Device Token Registration
  app.post("/v1/me/device-tokens", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    const parsed = DeviceTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid device token payload", details: parsed.error.issues });
    }

    const { token, platform, deviceId, appVersion } = parsed.data;
    if (!isExpoPushToken(token)) {
      return reply.code(400).send({ error: "Invalid Expo push token format" });
    }

    // Clean up any other tokens on this deviceId for this user to prevent multi-push on token refresh
    if (deviceId) {
      await prisma.devicePushToken.updateMany({
        where: {
          userId,
          deviceId,
          token: { not: token },
        },
        data: { isActive: false },
      });
    }

    // Upsert or re-assign token (handles account switch on same physical device)
    await prisma.devicePushToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        deviceId: deviceId || null,
        appVersion: appVersion || null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
        deviceId: deviceId || null,
        appVersion: appVersion || null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    return { ok: true };
  });

  // 2. Remove / Deactivate Device Token (e.g. on logout)
  app.delete("/v1/me/device-tokens", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    const parsed = DeleteDeviceTokenSchema.safeParse(req.body || {});
    const { token, deviceId } = parsed.success ? parsed.data : { token: undefined, deviceId: undefined };

    if (token) {
      await prisma.devicePushToken.updateMany({
        where: { userId, token },
        data: { isActive: false },
      });
    } else if (deviceId) {
      await prisma.devicePushToken.updateMany({
        where: { userId, deviceId },
        data: { isActive: false },
      });
    } else {
      // Deactivate all tokens for this user
      await prisma.devicePushToken.updateMany({
        where: { userId },
        data: { isActive: false },
      });
    }

    return { ok: true };
  });

  // 3. Get Persistent Inbox Notifications
  app.get("/v1/me/notifications", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    const query = req.query as { limit?: string; cursor?: string; unreadOnly?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 30;
    const cursor = query.cursor?.trim() || undefined;
    const unreadOnly = query.unreadOnly === "true";

    const inbox = await getUserInbox(userId, { limit, cursor, unreadOnly });
    return inbox;
  });

  // 4. Mark Single Notification Read
  app.post("/v1/me/notifications/:id/read", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    await markNotificationAsRead(userId, id);
    return { ok: true };
  });

  // 5. Mark All Notifications Read
  app.post("/v1/me/notifications/read-all", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    await markAllNotificationsAsRead(userId);
    return { ok: true };
  });

  // 6. Delete Single Notification
  app.delete("/v1/me/notifications/:id", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    await deleteNotification(userId, id);
    return { ok: true };
  });

  // 7. Clear All Notifications
  app.delete("/v1/me/notifications", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    await clearAllNotifications(userId);
    return { ok: true };
  });

  // 8. Get Notification Preferences
  app.get("/v1/me/notification-preferences", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    const prefs = await getOrCreateNotificationPreferences(userId);
    return prefs;
  });

  // 9. Update Notification Preferences
  app.put("/v1/me/notification-preferences", async (req, reply) => {
    const userId = await requireAuth(req, reply);
    if (!userId) return;

    const parsed = PreferencesUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid preferences format", details: parsed.error.issues });
    }

    const updated = await prisma.notificationPreference.upsert({
      where: { userId },
      update: parsed.data,
      create: {
        userId,
        ...parsed.data,
      },
    });

    return updated;
  });
}

/**
 * Background worker interval for dispatching queued push jobs and processing receipts.
 */
export function startPushNotificationWorkers() {
  const jobInterval = setInterval(() => {
    void processPendingPushJobs().catch((err) => {
      console.warn("[PushWorker] Job worker error:", err);
    });
  }, 15000);

  const receiptInterval = setInterval(() => {
    void processPendingPushReceipts().catch((err) => {
      console.warn("[PushWorker] Receipt worker error:", err);
    });
  }, 60000);

  return () => {
    clearInterval(jobInterval);
    clearInterval(receiptInterval);
  };
}
