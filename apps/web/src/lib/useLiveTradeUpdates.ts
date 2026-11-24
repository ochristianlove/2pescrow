import { useEffect, useRef, useState } from "react";
import { wsUrl } from "./api";

type WsEnvelope = { event?: string; payload?: { escrowId?: string; id?: string } };

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
]);

function payloadEscrowId(payload: WsEnvelope["payload"]): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if ("escrowId" in payload && typeof payload.escrowId === "string") return payload.escrowId;
  if ("id" in payload && typeof payload.id === "string") return payload.id;
  return undefined;
}

function eventApplies(event: string | undefined, escrowId: string | undefined, filterEscrowId?: string) {
  if (!event || !TRADE_EVENTS.has(event)) return false;
  if (!filterEscrowId) return true;
  const id = escrowId;
  return !id || id === filterEscrowId;
}

type Options = {
  /** When set, only refreshes for this shared-trade id (trade room). */
  escrowId?: string;
  enabled?: boolean;
  /** Poll interval when WebSocket is down (default 20s). No polling while WS is connected. */
  pollMs?: number;
  /** Optional callback receiving the exact WebSocket event name for instant alerts/chimes. */
  onEvent?: (event: string, payload?: WsEnvelope["payload"]) => void;
};

/**
 * Keeps trade views fresh: WebSocket push from API + light polling only if the socket drops.
 */
export function useLiveTradeUpdates(onRefresh: () => void, options?: Options) {
  const enabled = options?.enabled !== false;
  const filterEscrowId = options?.escrowId;
  const pollMs = options?.pollMs ?? 20_000;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const onEventRef = useRef(options?.onEvent);
  onEventRef.current = options?.onEvent;
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLive(false);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    }

    function startPolling() {
      if (stopped) return;
      onRefreshRef.current();
      if (pollTimer) return;
      pollTimer = setInterval(() => onRefreshRef.current(), pollMs);
    }

    function scheduleReconnect() {
      if (stopped || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, 3000);
    }

    function connect() {
      if (stopped) return;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        setLive(false);
        startPolling();
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        setLive(true);
        stopPolling();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsEnvelope;
          const id = payloadEscrowId(msg.payload);
          if (eventApplies(msg.event, id, filterEscrowId)) {
            if (msg.event) onEventRef.current?.(msg.event, msg.payload);
            onRefreshRef.current();
          }
        } catch {
          onRefreshRef.current();
        }
      };

      ws.onclose = () => {
        ws = null;
        setLive(false);
        if (!stopped) {
          startPolling();
          scheduleReconnect();
        }
      };

      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      stopped = true;
      setLive(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
      ws?.close();
    };
  }, [enabled, filterEscrowId, pollMs]);

  return { live };
}
