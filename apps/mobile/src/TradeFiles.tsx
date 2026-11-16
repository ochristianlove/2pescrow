import { Text, useLanguage } from "./language";
import { useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";
import type { DocumentPickerAsset } from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { api } from "./api";
import { apiUrl } from "./config";
import { getToken } from "./session";
import { colors } from "./theme";
import type { TradeMessage, TradeRow } from "./types";
import { Button, Field, Notice } from "./ui";

const accepted = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const mimeByExtension: Record<string, string> = { jpg: accepted[0], jpeg: accepted[0], png: accepted[1], webp: accepted[2], gif: accepted[3], pdf: accepted[4] };
export function EvidenceComposer({ trade, seller, disabled, onBusy, onUploaded }: {
  trade: TradeRow; seller: boolean; disabled: boolean; onBusy: (value: boolean) => void; onUploaded: () => Promise<void>;
}) {
  const [file, setFile] = useState<DocumentPickerAsset | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const locked = useRef(false);
  useEffect(() => () => { if (file?.uri.startsWith(FileSystem.cacheDirectory || "__none__")) void FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {}); }, [file]);
  async function pick() {
    if (locked.current || disabled) return;
    locked.current = true; setError(null);
    try {
      const picker = await import("expo-document-picker");
      const result = await picker.getDocumentAsync({ type: accepted, copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const selected = result.assets[0];
      const info = await FileSystem.getInfoAsync(selected.uri);
      const size = selected.size ?? (info.exists ? info.size : undefined);
      const mimeType = selected.mimeType || mimeByExtension[selected.name.split(".").pop()?.toLowerCase() || ""];
      if (!mimeType || !accepted.includes(mimeType) || size == null || size > 20 * 1024 * 1024 || size === 0) {
        await FileSystem.deleteAsync(selected.uri, { idempotent: true });
        throw new Error("Choose a JPG, PNG, WebP, GIF, or PDF file up to 20 MB.");
      }
      setFile({ ...selected, mimeType, size });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not choose a file. Please try again."); }
    finally { locked.current = false; }
  }
  async function upload() {
    if (!file || disabled || locked.current) return;
    locked.current = true; setUploading(true); onBusy(true); setError(null);
    try {
      const form = new FormData();
      // React Native's FormData accepts local file descriptors; DOM types only declare Blob.
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
      const fulfilment = seller && Boolean(trade.contractAddress) && ["Funded", "InProgress"].includes(trade.status);
      form.append("kind", fulfilment ? "fulfilment" : "evidence");
      form.append("note", note.trim() || (fulfilment ? "Seller shared fulfilment proof" : "Evidence shared by a trade party"));
      await api(`/v1/escrows/${encodeURIComponent(trade.id)}/evidence`, { method: "POST", body: form });
      setFile(null); setNote(""); await onUploaded();
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed. Your file is still selected; try again."); }
    finally { locked.current = false; setUploading(false); onBusy(false); }
  }
  return <View style={{ gap: 10 }}>
    {error ? <Notice text={error} /> : null}
    <Button label={file ? "Choose another file" : "Attach photo or PDF"} tone="ghost" disabled={disabled} onPress={() => void pick()} />
    {file ? <>
      <Text translate={false} style={{ color: colors.text }}>{file.name} · {((file.size || 0) / 1024 / 1024).toFixed(1)} MB</Text>
      {file.mimeType?.startsWith("image/") ? <Image source={{ uri: file.uri }} style={{ width: "100%", height: 180, borderRadius: 10 }} resizeMode="contain" accessibilityLabel={file.name} /> : null}
      <Field label="Evidence note (optional)" value={note} onChangeText={setNote} editable={!disabled} maxLength={1000} multiline />
      <Button label="Upload to this trade" busy={uploading} disabled={disabled} onPress={() => void upload()} />
      <Button label="Remove attachment" tone="ghost" disabled={disabled} onPress={() => setFile(null)} />
    </> : <Text style={{ color: colors.muted, fontSize: 12 }}>Photos and PDFs up to 20 MB. Review your file before uploading.</Text>}
  </View>;
}
export function MessageFile({ tradeId, message }: { tradeId: string; message: TradeMessage }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const token = getToken();
  const url = `${apiUrl()}/v1/escrows/${encodeURIComponent(tradeId)}/messages/${encodeURIComponent(message.id)}/file`;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const mime = mimeByExtension[message.fileName?.split(".").pop()?.toLowerCase() || ""];
  async function open() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    const filename = (message.fileName || "evidence").replace(/[^a-zA-Z0-9._-]/g, "_");
    const destination = `${FileSystem.cacheDirectory}trade-${Date.now()}-${filename}`;
    try {
      const sharing = await import("expo-sharing");
      if (!await sharing.isAvailableAsync()) throw new Error("File sharing is not available on this device.");
      const result = await FileSystem.downloadAsync(url, destination, { headers });
      if (result.status !== 200) throw new Error("Could not download this attachment. Check your connection and trade access.");
      await sharing.shareAsync(result.uri, { mimeType: mime, dialogTitle: message.fileName || "Trade attachment" });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not open this attachment."); }
    finally { await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {}); locked.current = false; setBusy(false); }
  }
  return <View style={{ marginTop: 12, gap: 8 }}>
    {message.fileAvailable === false ? <Text style={{ color: colors.muted }}>Attachment unavailable: {message.fileName}</Text> : <>
      {mime?.startsWith("image/") ? <Image source={{ uri: url, headers }} accessibilityLabel={message.fileName || "Shared image"} style={{ width: "100%", height: 180, borderRadius: 10 }} resizeMode="contain" /> : null}
      <Button label={t("Open / save {name}", { name: message.fileName || "" })} tone="ghost" busy={busy} onPress={() => void open()} />
    </>}
    {error ? <Notice text={error} /> : null}
  </View>;
}
