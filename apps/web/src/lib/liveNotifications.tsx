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
import { api, wsUrl } from "./api";
import { useAuth } from "./auth";

const SOUND_KEY = "2pescrow_live_sound";
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
  "trade:release-requested",
  "trade:completed",
]);

export type LiveNotification = {
  id: string;
  at: number;
  event: string;
  message: string;
  escrowId?: string;
  read: boolean;
};

type WsEnvelope = {
  event?: string;
  payload?: { escrowId?: string; id?: string; role?: string; address?: string; message?: string };
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

let lastBellAt = 0;

export function playNotificationBell() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SOUND_KEY) === "off") return;
  const now = Date.now();
  if (now - lastBellAt < 450) return;
  lastBellAt = now;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.setValueAtTime(1175, t0 + 0.08);
    osc.frequency.setValueAtTime(880, t0 + 0.16);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    osc.start(t0);
    osc.stop(t0 + 0.45);
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    /* Autoplay may be blocked until user gesture. */
  }
}

type LiveNotificationsCtx = {
  notifications: LiveNotification[];
  unreadCount: number;
  soundEnabled: boolean;
  setSoundEnabled: (on: boolean) => void;
  markAllRead: () => void;
  clearAll: () => void;
  pushNotification: (n: Omit<LiveNotification, "id" | "at" | "read">) => void;
  syncEscrowIds: (ids: string[]) => void;
  trackEscrowId: (id: string) => void;
};

const LiveNotificationsContext = createContext<LiveNotificationsCtx | null>(null);

export function LiveNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, authHeaders } = useAuth();
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(SOUND_KEY) !== "off",
  );
  const escrowIdsRef = useRef<Set<string>>(new Set());
  const notificationsRef = useRef<LiveNotification[]>([]);

  const setSoundEnabled = useCallback((on: boolean) => {
    setSoundEnabledState(on);
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  }, []);

  const syncEscrowIds = useCallback((ids: string[]) => {
    escrowIdsRef.current = new Set(ids);
  }, []);

  const trackEscrowId = useCallback((id: string) => {
    escrowIdsRef.current.add(id);
  }, []);

  const pushNotification = useCallback((n: Omit<LiveNotification, "id" | "at" | "read">) => {
    const next = [
      {
        ...n,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
        read: false,
      },
      ...notificationsRef.current,
    ].slice(0, 40);
    notificationsRef.current = next;
    setNotifications(next);
    playNotificationBell();
  }, []);

  const markAllRead = useCallback(() => {
    const next = notificationsRef.current.map((n) => ({ ...n, read: true }));
    notificationsRef.current = next;
    setNotifications(next);
  }, []);

  const clearAll = useCallback(() => {
    notificationsRef.current = [];
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      escrowIdsRef.current = new Set();
      return;
    }
    void api<{ id: string }[]>("/v1/me/trades", { headers: authHeaders() })
      .then((rows) => {
        escrowIdsRef.current = new Set(rows.map((r) => r.id));
      })
      .catch(() => undefined);
  }, [user, authHeaders]);

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

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsEnvelope;
          const event = msg.event;
          if (!event || !TRADE_EVENTS.has(event)) return;
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
  }, [user, pushNotification]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      soundEnabled,
      setSoundEnabled,
      markAllRead,
      clearAll,
      pushNotification,
      syncEscrowIds,
      trackEscrowId,
    }),
    [
      notifications,
      unreadCount,
      soundEnabled,
      setSoundEnabled,
      markAllRead,
      clearAll,
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
