import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../lib/language";
import { usePlatformSettings } from "../lib/platformSettings";

export function WalletConnectionNotice() {
  const { settings } = usePlatformSettings();
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const revision = settings?.siteNoticeRevision ?? 1;
  const title = settings?.siteNoticeTitle?.trim() ?? "";
  const body = settings?.siteNoticeBody?.trim() ?? "";
  const audience = settings?.siteNoticeAudience ?? "all";
  const delaySeconds = Math.min(300, Math.max(0, settings?.siteNoticeDelaySeconds ?? 15));
  const storageKey = `2pescrow:site-notice:${revision}`;

  useEffect(() => {
    if (!settings?.siteNoticeEnabled || !title || !body) {
      setVisible(false);
      return;
    }

    const mobileQuery = window.matchMedia("(max-width: 720px)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleNotice = () => {
      if (timer) clearTimeout(timer);
      setVisible(false);
      const isMobile = mobileQuery.matches;
      if ((audience === "mobile" && !isMobile) || (audience === "desktop" && isMobile)) return;

      let dismissed = false;
      try {
        dismissed = localStorage.getItem(storageKey) === "dismissed";
      } catch {
        // Continue with an in-memory dismissal if browser storage is unavailable.
      }
      if (dismissed) return;
      timer = setTimeout(() => setVisible(true), delaySeconds * 1000);
    };

    scheduleNotice();
    mobileQuery.addEventListener("change", scheduleNotice);
    return () => {
      if (timer) clearTimeout(timer);
      mobileQuery.removeEventListener("change", scheduleNotice);
    };
  }, [settings?.siteNoticeEnabled, title, body, audience, delaySeconds, storageKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!visible || !dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [visible]);

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "dismissed");
    } catch {
      // Dismiss for this page view when storage is unavailable.
    }
    setVisible(false);
  }

  if (!settings?.siteNoticeEnabled || !title || !body || !visible) return null;

  return (
    <dialog
      ref={dialogRef}
      className="wallet-notice-modal"
      aria-labelledby="wallet-notice-title"
      aria-describedby="wallet-notice-body"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="wallet-notice-head">
        <h2 id="wallet-notice-title">{title}</h2>
        <button type="button" className="secondary wallet-notice-close" onClick={dismiss}>
          {t("Close")}
        </button>
      </div>
      <p id="wallet-notice-body" className="wallet-notice-body">{body}</p>
      <div className="wallet-notice-actions">
        <button type="button" className="primary" onClick={dismiss}>{t("Got it")}</button>
      </div>
    </dialog>
  );
}
