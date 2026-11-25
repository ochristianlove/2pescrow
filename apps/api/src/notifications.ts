import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import { processPendingPushJobs } from "./pushService";
import { sendToUser } from "./wsHub";
import { formatStableDollars } from "./amountFormat";

export type TradeNotificationInput = {
  recipientUserId: string;
  escrowId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  eventId?: string;
};

export async function getOrCreateNotificationPreferences(userId: string) {
  let pref = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (!pref) {
    try {
      pref = await prisma.notificationPreference.create({
        data: { userId },
      });
    } catch {
      pref = await prisma.notificationPreference.findUnique({
        where: { userId },
      });
    }
  }

  return pref || {
    id: "",
    userId,
    pushEnabled: true,
    tradeUpdates: true,
    chatMessages: true,
    deadlineReminders: true,
    lockScreenPrivacy: "private",
    soundEnabled: true,
    muteCompletedTrades: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function createTradeNotification(input: TradeNotificationInput) {
  const { recipientUserId, escrowId, type, title, message, data, eventId } = input;
  if (!recipientUserId) return null;

  // Respect user's Privacy setting to mute incoming messages on completed/closed trades
  const prefs = await getOrCreateNotificationPreferences(recipientUserId);
  if (type.startsWith("chat:") && escrowId && prefs.muteCompletedTrades) {
    const trade = await prisma.escrow.findUnique({ where: { id: escrowId }, select: { status: true } }).catch(() => null);
    if (trade && ["Completed", "Resolved", "Cancelled"].includes(trade.status)) {
      return null;
    }
  }

  // 1. Deduplication check via eventId if provided
  if (eventId) {
    const existing = await prisma.notification.findFirst({
      where: { userId: recipientUserId, eventId },
      select: { id: true },
    });
    if (existing) {
      return existing;
    }
  }

  // 2. Persist the notification in the user's durable inbox
  let notification;
  try {
    notification = await prisma.notification.create({
      data: {
        userId: recipientUserId,
        escrowId: escrowId || null,
        type,
        title,
        message,
        data: data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
        eventId: eventId || null,
      },
    });
  } catch (err: unknown) {
    // Unique constraint violation on [userId, eventId]
    if (eventId && (err as { code?: string }).code === "P2002") {
      return prisma.notification.findFirst({
        where: { userId: recipientUserId, eventId },
      });
    }
    throw err;
  }

  // 3. Real-time in-app notification via targeted WebSocket
  sendToUser(recipientUserId, "notification:new", {
    id: notification.id,
    escrowId: notification.escrowId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    read: false,
    createdAt: notification.createdAt.toISOString(),
  });

  // Also send matching trade event to the specific user's web/mobile client
  if (type.startsWith("trade:") || type.startsWith("dispute:") || type.startsWith("escrow:")) {
    sendToUser(recipientUserId, type, { escrowId, ...data });
  }

  // 4. Check recipient push preferences
  if (!prefs.pushEnabled) {
    return notification;
  }

  const isChat = type.startsWith("chat:");
  const isDeadline = type.includes("deadline");
  if (isChat && !prefs.chatMessages) return notification;
  if (isDeadline && !prefs.deadlineReminders) return notification;
  if (!isChat && !isDeadline && !prefs.tradeUpdates) return notification;

  // 5. Privacy-conscious lock-screen text if lockScreenPrivacy === "private"
  let pushTitle = title;
  let pushBody = message;
  if (prefs.lockScreenPrivacy === "private") {
    if (isChat) {
      pushTitle = "2Pescrow";
      pushBody = "You received a new trade message. Open to view.";
    } else if (isDeadline) {
      pushTitle = "2Pescrow · Deadline notice";
      pushBody = "Action is required on your trade. Open to view details.";
    } else {
      pushTitle = "2Pescrow · Trade update";
      pushBody = "There is new activity on your trade. Open to view details.";
    }
  }

  // 6. Fetch active device push tokens for this user
  const deviceTokens = await prisma.devicePushToken.findMany({
    where: {
      userId: recipientUserId,
      isActive: true,
    },
    select: { token: true },
  });

  if (deviceTokens.length === 0) {
    return notification;
  }

  // 7. Enqueue push delivery jobs
  for (const { token } of deviceTokens) {
    await prisma.pushDeliveryJob.create({
      data: {
        notificationId: notification.id,
        token,
        status: "pending",
      },
    });
  }

  // Trigger push dispatch asynchronously
  void processPendingPushJobs().catch((pushErr) => {
    console.warn("[Push] Error during background push dispatch:", pushErr);
  });

  return notification;
}

export async function getUserInbox(
  userId: string,
  options: { limit?: number; cursor?: string; unreadOnly?: boolean } = {}
) {
  const limit = Math.min(Math.max(options.limit || 30, 1), 100);
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(options.unreadOnly ? { readAt: null } : {}),
  };

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      include: {
        escrow: {
          select: {
            id: true,
            title: true,
            status: true,
            tradeCode: true,
          },
        },
      },
    }),
    prisma.notification.count({
      where: { userId, readAt: null },
    }),
  ]);

  let nextCursor: string | null = null;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem ? nextItem.id : null;
  }

  return {
    notifications: items.map((item) => ({
      id: item.id,
      escrowId: item.escrowId,
      tradeTitle: item.escrow?.title,
      tradeCode: item.escrow?.tradeCode,
      type: item.type,
      title: item.title,
      message: item.message,
      data: item.data,
      read: item.readAt !== null,
      readAt: item.readAt ? item.readAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
    })),
    unreadCount,
    nextCursor,
  };
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function deleteNotification(userId: string, notificationId: string) {
  return prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
}

export async function clearAllNotifications(userId: string) {
  return prisma.notification.deleteMany({
    where: { userId },
  });
}

// -------------------------------------------------------------
// Specialized, Authoritative Trade Event Notification Helpers
// -------------------------------------------------------------

export async function notifySellerJoined(opts: {
  escrowId: string;
  title: string;
  buyerUserId: string | null;
}) {
  if (!opts.buyerUserId) return;
  await createTradeNotification({
    recipientUserId: opts.buyerUserId,
    escrowId: opts.escrowId,
    type: "trade:seller-joined",
    title: "Seller joined trade",
    message: `A seller joined “${opts.title}”. Each party must link a wallet before funding.`,
    data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
    eventId: `escrow:${opts.escrowId}:seller-joined`,
  });
}

export async function notifyWalletLinked(opts: {
  escrowId: string;
  title: string;
  role: "buyer" | "seller";
  address: string;
  buyerUserId: string | null;
  sellerUserId: string | null;
}) {
  const recipient = opts.role === "buyer" ? opts.sellerUserId : opts.buyerUserId;
  if (!recipient) return;
  const roleName = opts.role === "buyer" ? "Buyer" : "Seller";
  await createTradeNotification({
    recipientUserId: recipient,
    escrowId: opts.escrowId,
    type: "trade:wallet-linked",
    title: `${roleName} linked wallet`,
    message: `${roleName} linked their wallet for “${opts.title}”.`,
    data: { escrowId: opts.escrowId, role: opts.role, address: opts.address, path: `/trade/${opts.escrowId}` },
    eventId: `escrow:${opts.escrowId}:wallet-linked:${opts.role}:${opts.address.toLowerCase()}`,
  });
}

export async function notifyTradeFunded(opts: {
  escrowId: string;
  title: string;
  amountAtomic: string;
  buyerUserId: string | null;
  sellerUserId: string | null;
}) {
  const formatted = formatStableDollars(opts.amountAtomic);

  // Notify seller: deposit is confirmed on-chain, safe to deliver
  if (opts.sellerUserId) {
    await createTradeNotification({
      recipientUserId: opts.sellerUserId,
      escrowId: opts.escrowId,
      type: "trade:funded",
      title: "Escrow payment funded",
      message: `Buyer deposited ${formatted} into escrow for “${opts.title}”. Payment is secured in the smart contract. You can now deliver.`,
      data: { escrowId: opts.escrowId, amount: formatted, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:funded:seller`,
    });
  }

  // Notify buyer: deposit confirmed
  if (opts.buyerUserId) {
    await createTradeNotification({
      recipientUserId: opts.buyerUserId,
      escrowId: opts.escrowId,
      type: "trade:funded",
      title: "Deposit confirmed",
      message: `Your deposit of ${formatted} for “${opts.title}” is confirmed in the escrow smart contract.`,
      data: { escrowId: opts.escrowId, amount: formatted, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:funded:buyer`,
    });
  }
}

export async function notifyDeliverySubmitted(opts: {
  escrowId: string;
  title: string;
  buyerUserId: string | null;
}) {
  if (!opts.buyerUserId) return;
  await createTradeNotification({
    recipientUserId: opts.buyerUserId,
    escrowId: opts.escrowId,
    type: "trade:release-requested",
    title: "Fulfilment delivered",
    message: `The seller submitted fulfilment proof for “${opts.title}”. Review in the trade room and release funds when ready.`,
    data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
    eventId: `escrow:${opts.escrowId}:delivery-submitted`,
  });
}

export async function notifyTradeCompleted(opts: {
  escrowId: string;
  title: string;
  amountAtomic: string;
  buyerUserId: string | null;
  sellerUserId: string | null;
}) {
  const formatted = formatStableDollars(opts.amountAtomic);

  if (opts.sellerUserId) {
    await createTradeNotification({
      recipientUserId: opts.sellerUserId,
      escrowId: opts.escrowId,
      type: "trade:completed",
      title: "Payment released!",
      message: `Funds (${formatted}) for “${opts.title}” have been released to your wallet. Trade is complete.`,
      data: { escrowId: opts.escrowId, amount: formatted, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:completed:seller`,
    });
  }

  if (opts.buyerUserId) {
    await createTradeNotification({
      recipientUserId: opts.buyerUserId,
      escrowId: opts.escrowId,
      type: "trade:completed",
      title: "Trade completed",
      message: `Trade “${opts.title}” is complete. Funds have been released to the seller.`,
      data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:completed:buyer`,
    });
  }
}

export async function notifyCancelRequested(opts: {
  escrowId: string;
  title: string;
  requesterRole: "buyer" | "seller";
  buyerUserId: string | null;
  sellerUserId: string | null;
}) {
  const recipient = opts.requesterRole === "buyer" ? opts.sellerUserId : opts.buyerUserId;
  if (!recipient) return;
  const requesterLabel = opts.requesterRole === "buyer" ? "buyer" : "seller";
  await createTradeNotification({
    recipientUserId: recipient,
    escrowId: opts.escrowId,
    type: "trade:cancel-requested",
    title: "Cancellation requested",
    message: `The ${requesterLabel} requested to cancel “${opts.title}”. Review the request in your trade room.`,
    data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
    eventId: `escrow:${opts.escrowId}:cancel-requested:${Date.now()}`,
  });
}

export async function notifyCancelRefused(opts: {
  escrowId: string;
  title: string;
  buyerUserId: string | null;
}) {
  if (!opts.buyerUserId) return;
  await createTradeNotification({
    recipientUserId: opts.buyerUserId,
    escrowId: opts.escrowId,
    type: "trade:cancel-refused",
    title: "Cancellation refused",
    message: `The seller refused the cancellation request for “${opts.title}”. Trade remains active.`,
    data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
    eventId: `escrow:${opts.escrowId}:cancel-refused:${Date.now()}`,
  });
}

export async function notifyTradeCancelled(opts: {
  escrowId: string;
  title: string;
  buyerUserId: string | null;
  sellerUserId: string | null;
}) {
  if (opts.buyerUserId) {
    await createTradeNotification({
      recipientUserId: opts.buyerUserId,
      escrowId: opts.escrowId,
      type: "trade:cancelled",
      title: "Trade cancelled",
      message: `Trade “${opts.title}” was cancelled. Refund processed according to contract rules.`,
      data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:cancelled:buyer`,
    });
  }
  if (opts.sellerUserId) {
    await createTradeNotification({
      recipientUserId: opts.sellerUserId,
      escrowId: opts.escrowId,
      type: "trade:cancelled",
      title: "Trade cancelled",
      message: `Trade “${opts.title}” was cancelled.`,
      data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:cancelled:seller`,
    });
  }
}

export async function notifyDisputeOpened(opts: {
  escrowId: string;
  title: string;
  openerRole?: "buyer" | "seller" | string;
  buyerUserId: string | null;
  sellerUserId: string | null;
  openerUserId?: string;
}) {
  // Notify the other party
  const targetUserIds = [opts.buyerUserId, opts.sellerUserId].filter(
    (id): id is string => Boolean(id && id !== opts.openerUserId)
  );

  for (const uid of targetUserIds) {
    await createTradeNotification({
      recipientUserId: uid,
      escrowId: opts.escrowId,
      type: "dispute:opened",
      title: "Dispute opened",
      message: `A dispute was opened on trade “${opts.title}”. Staff will review the case in the trade room.`,
      data: { escrowId: opts.escrowId, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:dispute-opened`,
    });
  }
}

export async function notifyDisputeResolved(opts: {
  escrowId: string;
  title: string;
  buyerFavor: boolean;
  buyerUserId: string | null;
  sellerUserId: string | null;
}) {
  const outcome = opts.buyerFavor ? "in buyer's favor" : "in seller's favor";

  if (opts.buyerUserId) {
    await createTradeNotification({
      recipientUserId: opts.buyerUserId,
      escrowId: opts.escrowId,
      type: "dispute:resolved",
      title: "Dispute resolved",
      message: `Dispute on “${opts.title}” was resolved ${outcome}.`,
      data: { escrowId: opts.escrowId, buyerFavor: opts.buyerFavor, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:dispute-resolved:buyer`,
    });
  }
  if (opts.sellerUserId) {
    await createTradeNotification({
      recipientUserId: opts.sellerUserId,
      escrowId: opts.escrowId,
      type: "dispute:resolved",
      title: "Dispute resolved",
      message: `Dispute on “${opts.title}” was resolved ${outcome}.`,
      data: { escrowId: opts.escrowId, buyerFavor: opts.buyerFavor, path: `/trade/${opts.escrowId}` },
      eventId: `escrow:${opts.escrowId}:dispute-resolved:seller`,
    });
  }
}

export async function notifyChatMessage(opts: {
  escrowId: string;
  title: string;
  messageId: string;
  body: string;
  authorUserId: string;
  authorName?: string;
  buyerUserId: string | null;
  sellerUserId: string | null;
  recipientUserId?: string | null;
}) {
  // Targeted private recipient or counterpart
  let targetId = opts.recipientUserId;
  if (!targetId) {
    if (opts.authorUserId === opts.buyerUserId) {
      targetId = opts.sellerUserId;
    } else if (opts.authorUserId === opts.sellerUserId) {
      targetId = opts.buyerUserId;
    }
  }

  if (!targetId || targetId === opts.authorUserId) return;

  const senderLabel = opts.authorName ? opts.authorName : "Trade partner";
  const snippet = opts.body.length > 120 ? `${opts.body.slice(0, 117)}...` : opts.body;

  await createTradeNotification({
    recipientUserId: targetId,
    escrowId: opts.escrowId,
    type: "chat:message",
    title: `Message from ${senderLabel}`,
    message: snippet,
    data: { escrowId: opts.escrowId, messageId: opts.messageId, path: `/trade/${opts.escrowId}` },
    eventId: `chat:${opts.messageId}`,
  });
}
