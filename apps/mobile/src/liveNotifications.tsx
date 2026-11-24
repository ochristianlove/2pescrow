import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus, Vibration } from "react-native";
import { playTradeBell } from "./notificationSound";
import { api } from "./api";
import { useAuth } from "./auth";
import { apiUrl } from "./config";
import { getToken } from "./session";
import {
  registerDevicePushToken,
  initPushNotificationListeners,
  flushPendingNotificationNavigation,
} from "./pushNotifications";


const tradeSubscribers = new Set<(escrowId?: string) => void>();
function notifyTradeSubscribers(escrowId?: string) {
  for (const cb of tradeSubscribers) {
    try { cb(escrowId); } catch { /* ignore */ }
  }
}

const SOUND_KEY = "2pescrow_live_sound";
const INBOX_CACHE_KEY = "@2pescrow_inbox_cache_v1";

const TRADE_EVENTS = new Set([
  "trade:timeline-updated",
  "trade:seller-joined",
  "trade:wallet-linked",
  "escrow:updated",
  "escrow:created",
  "escrow:proof",
  "dispute:opened",
  "dispute:evidence",
  "dispute:resolved",
  "trade:deadline-reminder",
  "trade:cancel-requested",
  "trade:cancel-refused",
  "trade:cancelled",
  "trade:funded",
  "trade:funding-submitted",
  "trade:release-requested",
  "trade:completed",
  "notification:new",
]);

export type LiveNotification = {
  id: string;
  at: number;
  event: string;
  title?: string;
  message: string;
  escrowId?: string;
  read: boolean;
  data?: Record<string, unknown> | null;
};

export type NotificationPreferences = {
  pushEnabled: boolean;
  tradeUpdates: boolean;
  chatMessages: boolean;
  deadlineReminders: boolean;
  lockScreenPrivacy: boolean;
  soundEnabled: boolean;
};

type ApiNotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  escrowId: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type WsEnvelope = {
  event?: string;
  payload?: {
    escrowId?: string;
    id?: string;
    role?: string;
    address?: string;
    message?: string;
    notification?: ApiNotificationItem;
  };
};

function payloadEscrowId(payload: WsEnvelope["payload"]): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if ("escrowId" in payload && typeof payload.escrowId === "string") return payload.escrowId;
  if ("id" in payload && typeof payload.id === "string") return payload.id;
  return undefined;
}

function messageForEvent(event: string, payload: WsEnvelope["payload"]): string {
  switch (event) {
    case "trade:wallet-linked":
      return payload?.role === "seller"
        ? "Seller linked a wallet on your trade."
        : payload?.role === "buyer"
          ? "Buyer linked a wallet on your trade."
          : "A party linked a wallet on your trade.";
    case "trade:seller-joined":
      return "Seller joined your trade room.";
    case "trade:timeline-updated":
      return "Trade activity updated — check the trade room.";
    case "escrow:proof":
      return "Delivery proof was submitted.";
    case "dispute:opened":
      return "A dispute was opened on your trade.";
    case "dispute:evidence":
      return "New dispute evidence was added.";
    case "dispute:resolved":
      return "A dispute was resolved.";
    case "escrow:updated":
    case "escrow:created":
      return "Escrow status or details changed.";
    case "trade:cancel-requested":
      return "The other party requested to cancel this trade.";
    case "trade:cancel-refused":
      return "The cancel request was refused.";
    case "trade:cancelled":
      return "The trade was cancelled. The buyer was refunded the trade amount minus the $1 cancel commission.";
    case "trade:funding-submitted":
      return "Funds left the buyer's wallet — confirming on Ethereum…";
    case "trade:funded":
      return "The buyer funded the on-chain escrow.";
    case "trade:release-requested":
      return "Please release funds.";
    case "trade:completed":
      return "The trade is complete.";
    case "trade:deadline-reminder":
      return typeof payload?.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : "Trade deadline reminder — check your trade room.";
    default:
      return "Live trade update.";
  }
}

function wsUrl(): string {
  const base = apiUrl().replace(/^http/, "ws");
  const token = getToken();
  return token ? `${base}/v1/ws?token=${encodeURIComponent(token)}` : `${base}/v1/ws`;
}

let lastBellAt = 0;

function playNotificationBell() {
  const now = Date.now();
  if (now - lastBellAt < 500) return;
  lastBellAt = now;
  Vibration.vibrate([0, 40, 70, 50]);
  void playTradeBell().catch(() => undefined);
}

function apiItemToLive(item: ApiNotificationItem): LiveNotification {
  return {
    id: item.id,
    at: new Date(item.createdAt).getTime(),
    event: item.type,
    title: item.title,
    message: item.message,
    escrowId: item.escrowId ?? undefined,
    read: Boolean(item.readAt),
    data: item.data,
  };
}

type LiveNotificationsCtx = {
  notifications: LiveNotification[];
  unreadCount: number;
  soundEnabled: boolean;
  setSoundEnabled: (on: boolean) => void;
  preferences: NotificationPreferences | null;
  updatePreferences: (patch: Partial<NotificationPreferences>) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => void;
  clearAll: () => void;
  refreshInbox: () => Promise<void>;
  pushNotification: (n: Omit<LiveNotification, "id" | "at" | "read">) => void;
  syncEscrowIds: (ids: string[]) => void;
  trackEscrowId: (id: string) => void;
  subscribeTradeEvents: (cb: (escrowId?: string) => void) => () => void;
};

const LiveNotificationsContext = createContext<LiveNotificationsCtx | null>(null);

export function LiveNotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  const escrowIdsRef = useRef<Set<string>>(new Set());
  const notificationsRef = useRef<LiveNotification[]>([]);
  const soundRef = useRef(true);
  const pushRegisteredUserRef = useRef<string | null>(null);

  // Sync state & persistent storage
  const commitNotifications = useCallback((items: LiveNotification[]) => {
    notificationsRef.current = items;
    setNotifications(items);
    setUnreadCount(items.filter((n) => !n.read).length);
    void AsyncStorage.setItem(INBOX_CACHE_KEY, JSON.stringify(items.slice(0, 100))).catch(() => undefined);
  }, []);

  // 1. Initialize local sound setting and cached inbox
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(SOUND_KEY).then((value) => {
      if (cancelled || value == null) return;
      const on = value !== "off";
      soundRef.current = on;
      setSoundEnabledState(on);
    });

    void AsyncStorage.getItem(INBOX_CACHE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const cached = JSON.parse(raw) as LiveNotification[];
        if (Array.isArray(cached) && cached.length > 0) {
          notificationsRef.current = cached;
          setNotifications(cached);
          setUnreadCount(cached.filter((n) => !n.read).length);
        }
      } catch {
        // ignore cache parse error
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Fetch authoritative inbox and preferences from API when authenticated
  const refreshInbox = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api<{ notifications: ApiNotificationItem[]; unreadCount: number }>("/v1/me/notifications?limit=50");
      if (Array.isArray(res.notifications)) {
        const converted = res.notifications.map(apiItemToLive);
        commitNotifications(converted);
        setUnreadCount(res.unreadCount);
      }
    } catch {
      // offline fallback maintains cached state
    }
  }, [user, commitNotifications]);

  const loadPreferences = useCallback(async () => {
    if (!user) return;
    try {
      const prefs = await api<NotificationPreferences>("/v1/me/notification-preferences");
      setPreferences(prefs);
      if (prefs.soundEnabled !== undefined) {
        soundRef.current = prefs.soundEnabled;
        setSoundEnabledState(prefs.soundEnabled);
      }
    } catch {
      // Ignore preference load errors
    }
  }, [user]);

  const updatePreferences = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      setPreferences((prev) => (prev ? { ...prev, ...patch } : null));
      if (patch.soundEnabled !== undefined) {
        soundRef.current = patch.soundEnabled;
        setSoundEnabledState(patch.soundEnabled);
        void AsyncStorage.setItem(SOUND_KEY, patch.soundEnabled ? "on" : "off");
      }
      try {
        const saved = await api<NotificationPreferences>("/v1/me/notification-preferences", {
          method: "PUT",
          body: JSON.stringify(patch),
        });
        setPreferences(saved);
      } catch (err) {
        console.warn("[Notifications] Failed to update preferences:", err);
      }
    },
    [],
  );

  const setSoundEnabled = useCallback(
    (on: boolean) => {
      soundRef.current = on;
      setSoundEnabledState(on);
      void AsyncStorage.setItem(SOUND_KEY, on ? "on" : "off");
      if (user) {
        void updatePreferences({ soundEnabled: on });
      }
    },
    [user, updatePreferences],
  );

  
  const subscribeTradeEvents = useCallback((cb: (escrowId?: string) => void) => {
    tradeSubscribers.add(cb);
    return () => { tradeSubscribers.delete(cb); };
  }, []);

  const syncEscrowIds = useCallback((ids: string[]) => {
    escrowIdsRef.current = new Set(ids);
  }, []);

  const trackEscrowId = useCallback((id: string) => {
    escrowIdsRef.current.add(id);
  }, []);

  // Mark single notification read
  const markRead = useCallback(
    async (id: string) => {
      const updated = notificationsRef.current.map((n) => (n.id === id ? { ...n, read: true } : n));
      commitNotifications(updated);
      try {
        await api(`/v1/me/notifications/${id}/read`, { method: "POST" });
      } catch {
        // Optimistic UI persists locally
      }
    },
    [commitNotifications],
  );

  // Mark all read
  const markAllRead = useCallback(() => {
    const updated = notificationsRef.current.map((n) => ({ ...n, read: true }));
    commitNotifications(updated);
    if (user) {
      void api("/v1/me/notifications/read-all", { method: "POST" }).catch(() => undefined);
    }
  }, [user, commitNotifications]);

  // Clear all notifications
  const clearAll = useCallback(() => {
    commitNotifications([]);
    if (user) {
      void api("/v1/me/notifications", { method: "DELETE" }).catch(() => undefined);
    }
  }, [user, commitNotifications]);

  // Push local in-app alert notification
  const pushNotification = useCallback(
    (n: Omit<LiveNotification, "id" | "at" | "read">) => {
      const nextItem: LiveNotification = {
        ...n,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
        read: false,
      };
      const next = [nextItem, ...notificationsRef.current].slice(0, 50);
      commitNotifications(next);
      if (soundRef.current) playNotificationBell();
    },
    [commitNotifications],
  );

  // 3. User session changes: load authoritative data, register push token, and handle pending cold starts
  useEffect(() => {
    if (!user) {
      commitNotifications([]);
      escrowIdsRef.current = new Set();
      setPreferences(null);
      pushRegisteredUserRef.current = null;
      return;
    }

    void refreshInbox();
    void loadPreferences();

    // Register push token for authorized notifications
    void registerDevicePushToken(true).then((token) => {
      if (token) pushRegisteredUserRef.current = user.id;
    });

    // Flush any pending cold start navigation
    flushPendingNotificationNavigation();

    // Load active trade IDs for client events
    void api<{ id: string }[]>("/v1/me/trades")
      .then((rows) => {
        escrowIdsRef.current = new Set(rows.map((row) => row.id));
      })
      .catch(() => undefined);
  }, [user, refreshInbox, loadPreferences, commitNotifications]);

  // 4. AppState listener: refresh inbox on resume from background/locked screen
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active" && user) {
        void refreshInbox();
        flushPendingNotificationNavigation();
        if (pushRegisteredUserRef.current !== user.id) {
          void registerDevicePushToken(true).then((token) => {
            if (token) pushRegisteredUserRef.current = user.id;
          });
        }
      }
    });
    return () => {
      sub.remove();
    };
  }, [user, refreshInbox]);

  // 5. Initialize foreground push notification listeners
  useEffect(() => {
    const cleanup = initPushNotificationListeners({
      isAuthenticated: () => Boolean(user),
      onForegroundNotification: (notif) => {
        // When a push arrives in foreground, refresh inbox to ensure consistent authoritative state
        void refreshInbox();
        if (soundRef.current) playNotificationBell();
      },
    });
    return cleanup;
  }, [user, refreshInbox]);

  // 6. WebSocket connection for live trade room and inbox updates
  useEffect(() => {
    if (!user) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function scheduleReconnect() {
      if (stopped || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, 4000);
    }

    function connect() {
      if (stopped) return;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        const token = getToken();
        if (token && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "auth", token }));
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsEnvelope;
          const event = msg.event;
          if (!event || !TRADE_EVENTS.has(event)) return;
          notifyTradeSubscribers(payloadEscrowId(msg.payload));

          // Dedicated server-sent notification
          if (event === "notification:new" && msg.payload?.notification) {
            const newItem = apiItemToLive(msg.payload.notification);
            const exists = notificationsRef.current.some((n) => n.id === newItem.id);
            if (!exists) {
              const next = [newItem, ...notificationsRef.current].slice(0, 50);
              commitNotifications(next);
              if (soundRef.current) playNotificationBell();
            }
            return;
          }

          // Trade-specific event
          const escrowId = payloadEscrowId(msg.payload);
          if (!escrowId || !escrowIdsRef.current.has(escrowId)) return;

          const recent = notificationsRef.current.some(
            (n) => n.event === event && n.escrowId === escrowId && Date.now() - n.at < 12_000,
          );
          if (recent) return;

          pushNotification({
            event,
            message: messageForEvent(event, msg.payload),
            escrowId,
          });
        } catch {
          /* ignore malformed */
        }
      };

      ws.onclose = () => {
        ws = null;
        if (!stopped) scheduleReconnect();
      };

      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [user, pushNotification, commitNotifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      soundEnabled,
      setSoundEnabled,
      preferences,
      updatePreferences,
      markRead,
      markAllRead,
      clearAll,
      refreshInbox,
      pushNotification,
      syncEscrowIds,
      trackEscrowId,
      subscribeTradeEvents,
    }),
    [
      subscribeTradeEvents,
      notifications,
      unreadCount,
      soundEnabled,
      setSoundEnabled,
      preferences,
      updatePreferences,
      markRead,
      markAllRead,
      clearAll,
      refreshInbox,
      pushNotification,
      syncEscrowIds,
      trackEscrowId,
    ],
  );

  return <LiveNotificationsContext.Provider value={value}>{children}</LiveNotificationsContext.Provider>;
}

export function useLiveNotifications() {
  const ctx = useContext(LiveNotificationsContext);
  if (!ctx) throw new Error("useLiveNotifications outside LiveNotificationsProvider");
  return ctx;
}
