import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { TradeMessage } from "../lib/types";

export type TradeThreadUpdate = {
  id: string;
  label: string;
  href?: string | null;
  hrefLabel?: string | null;
  createdAt?: string;
};

function fileKind(name?: string | null): "image" | "pdf" | "file" | null {
  if (!name) return null;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "file";
}

function mimeFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function formatWhen(iso: string | undefined, language: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(language, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleString(language, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function useAuthedPreview(url: string | null, fileName: string | null, headers: () => Record<string, string>) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url || !fileName || fileKind(fileName) !== "image") {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl = "";
    (async () => {
      const response = await fetch(url, { headers: headers() });
      if (!response.ok || cancelled) return;
      const bytes = await response.arrayBuffer();
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeFor(fileName) }));
      if (!cancelled) setSrc(objectUrl);
    })().catch(() => {
      if (!cancelled) setSrc(null);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, fileName, headers]);
  return src;
}

function MessageFile({
  message,
  fileUrl,
  headers,
  onDownload,
  downloadLabel,
}: {
  message: TradeMessage;
  fileUrl: string;
  headers: () => Record<string, string>;
  onDownload: () => void;
  downloadLabel: string;
}) {
  const kind = fileKind(message.fileName);
  const preview = useAuthedPreview(kind === "image" ? fileUrl : null, message.fileName || null, headers);
  return (
    <div className={`chat-file chat-file-${kind || "file"}`}>
      {kind === "image" && preview && (
        <button type="button" className="chat-file-preview" onClick={onDownload} aria-label={downloadLabel}>
          <img src={preview} alt={message.fileName || "Shared image"} />
        </button>
      )}
      {kind === "image" && !preview && <div className="chat-file-pending">Loading preview…</div>}
      <div className="chat-file-row">
        <span className="chat-file-mark">{kind === "pdf" ? "PDF" : kind === "image" ? "IMG" : "FILE"}</span>
        <span className="chat-file-name">{message.fileName}</span>
        <button type="button" className="linkish" onClick={onDownload}>
          {downloadLabel}
        </button>
      </div>
    </div>
  );
}

type ThreadItem =
  | { kind: "update"; id: string; at: number; update: TradeThreadUpdate }
  | { kind: "message"; id: string; at: number; message: TradeMessage };

export function TradeRoomChat({
  messages,
  updates = [],
  userId,
  language,
  busy,
  canPost,
  allowUpload = true,
  composerPlaceholder,
  draft,
  onDraft,
  onSend,
  onUpload,
  onDownload,
  onDownloadAgreement,
  downloadingAgreement,
  fileUrl,
  authHeaders,
  t,
}: {
  messages: TradeMessage[];
  updates?: TradeThreadUpdate[];
  userId?: string;
  language: string;
  busy: boolean;
  canPost: boolean;
  allowUpload?: boolean;
  composerPlaceholder?: string;
  draft: string;
  onDraft: (value: string) => void;
  onSend: (event: FormEvent) => void;
  onUpload: (file: File) => void;
  onDownload: (message: TradeMessage) => void;
  onDownloadAgreement: () => void;
  downloadingAgreement: boolean;
  fileUrl: (messageId: string) => string;
  authHeaders: () => Record<string, string>;
  t: (value: string) => string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const items: ThreadItem[] = [
    ...updates.map((update) => ({
      kind: "update" as const,
      id: `update-${update.id}`,
      at: update.createdAt ? new Date(update.createdAt).getTime() : 0,
      update,
    })),
    ...messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      at: message.createdAt ? new Date(message.createdAt).getTime() : 0,
      message,
    })),
  ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [items.length, messages.length, updates.length]);

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="trade-chat">
      <div className="trade-chat-head">
        <div>
          <h3>{t("Trade room")}</h3>
          <p>{t("Messages, photos, and documents stay with this trade.")}</p>
        </div>
        <button type="button" className="secondary" disabled={busy || downloadingAgreement} onClick={onDownloadAgreement}>
          {downloadingAgreement ? t("Preparing agreement…") : t("Download agreement PDF")}
        </button>
      </div>
      <div className="trade-messages" ref={scroller} role="log" aria-live="polite" aria-relevant="additions">
        {items.length === 0 && <p className="chat-empty">{t("Nothing shared yet. A message, a photo, or a PDF will show up here.")}</p>}
        {items.map((item, index) => {
          if (item.kind === "update") {
            const when = formatWhen(item.update.createdAt, language);
            return (
              <p className="thread-status" key={item.id}>
                <span>{item.update.label}</span>
                {item.update.href && item.update.hrefLabel && (
                  <a className="mono" href={item.update.href} target="_blank" rel="noreferrer">
                    {item.update.hrefLabel}
                  </a>
                )}
                {when && <time>{when}</time>}
              </p>
            );
          }
          if (item.message.kind === "system") {
            const when = formatWhen(item.message.createdAt, language);
            return (
              <p className="thread-status" key={item.id}>
                <span>{item.message.body}</span>
                {when && <time>{when}</time>}
              </p>
            );
          }
          const message = item.message;
          const isAdminMessage = message.kind === "admin";
          const mine = message.authorUserId === userId;
          const previous = items[index - 1];
          const continued =
            previous?.kind === "message" &&
            previous.message.kind !== "system" &&
            (previous.message.authorUserId === userId) === mine &&
            previous.message.kind === message.kind;
          const who = mine
            ? t("You")
            : isAdminMessage
              ? t("Admin")
              : message.kind === "fulfilment"
                ? t("Seller · fulfilment")
                : t("Trade party");
          const rowClass = isAdminMessage ? "admin" : mine ? "mine" : "theirs";
          return (
            <article className={`thread-row ${rowClass}${continued ? " continued" : ""}`} key={message.id}>
              {!continued && (
                <div className="thread-who">
                  <strong>{who}</strong>
                  <time>{formatWhen(message.createdAt, language)}</time>
                </div>
              )}
              {(message.body || message.fileName) && (
                <div className="thread-body">
                  {message.body && <p>{message.body}</p>}
                  {message.fileName && (
                    <MessageFile
                      message={message}
                      fileUrl={fileUrl(message.id)}
                      headers={authHeaders}
                      onDownload={() => onDownload(message)}
                      downloadLabel={t("Download")}
                    />
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {canPost ? (
        <form className="trade-chat-form" onSubmit={onSend}>
          {allowUpload ? (
            <label className="chat-attach">
              <span className="sr-only">{t("Share a photo or PDF")}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onUpload(file);
                }}
              />
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M8 12.5 14.2 6.3a3 3 0 0 1 4.2 4.2l-7.8 7.8a4.2 4.2 0 0 1-6-6l7.1-7.1" />
              </svg>
            </label>
          ) : null}
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={composerPlaceholder || t("Write to the other party…")}
          />
          <button type="submit" disabled={busy || !draft.trim()}>{t("Send")}</button>
        </form>
      ) : (
        <p className="muted">{t("Trade room is private to the buyer and seller.")}</p>
      )}
    </div>
  );
}
