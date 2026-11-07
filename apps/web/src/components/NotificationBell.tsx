import { useEffect, useRef, useState } from "react";
import { useLiveNotifications } from "../lib/liveNotifications";
import { useRouter } from "../lib/router";
import { useLanguage } from "../lib/language";

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll, soundEnabled, setSoundEnabled } =
    useLiveNotifications();
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="notification-bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="notification-bell-btn"
        aria-label={t("Notifications")}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
      >
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.73 21a2 2 0 0 1-3.46 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-bell-badge" aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-panel notification-panel-dropdown card-surface" role="dialog" aria-label={t("Notifications")}>
          <div className="notification-panel-head">
            <strong>{t("Live updates")}</strong>
            <label className="notification-sound-toggle">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
              {t("Bell sound")}
            </label>
          </div>
          {notifications.length === 0 ? (
            <p className="muted notification-empty">{t("Trade and wallet activity will appear here in real time.")}</p>
          ) : (
            <ul className="notification-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="notification-item"
                    onClick={() => {
                      setOpen(false);
                      if (n.escrowId) navigate(`/trades/${n.escrowId}`);
                    }}
                  >
                    <span>{n.message}</span>
                    <time className="muted">{new Date(n.at).toLocaleTimeString()}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {notifications.length > 0 && (
            <button type="button" className="linkish notification-clear" onClick={clearAll}>
              {t("Clear all")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
