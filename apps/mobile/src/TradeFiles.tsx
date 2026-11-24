import { Text, useLanguage } from "./language";
import { useEffect, useRef, useState } from "react";
import { Image, Modal, Platform, Pressable, SafeAreaView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DocumentPickerAsset } from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { api } from "./api";
import { apiUrl } from "./config";
import { getToken } from "./session";
import { colors } from "./theme";
import type { TradeMessage, TradeRow } from "./types";
import { Button, Field, Notice } from "./ui";

const accepted = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const mimeByExtension: Record<string, string> = {
  jpg: accepted[0],
  jpeg: accepted[0],
  png: accepted[1],
  webp: accepted[2],
  gif: accepted[3],
  pdf: accepted[4],
};
const utiByExtension: Record<string, string> = {
  jpg: "public.jpeg",
  jpeg: "public.jpeg",
  png: "public.png",
  webp: "org.webmproject.webp",
  gif: "com.compuserve.gif",
  pdf: "com.adobe.pdf",
};
const DOWNLOAD_DIR_KEY = "twopescrow.downloadDirUri";

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

function bytesToBase64(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}

async function saveBase64OnAndroid(filename: string, mimeType: string, base64: string): Promise<{ saved: boolean; cancelled?: boolean }> {
  const saf = FileSystem.StorageAccessFramework;
  const writeToDir = async (dirUri: string) => {
    const createdUri = await saf.createFileAsync(dirUri, filename, mimeType);
    await FileSystem.writeAsStringAsync(createdUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  };

  // Reuse previously approved Downloads/target directory if still permitted.
  const cachedDir = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY).catch(() => null);
  if (cachedDir) {
    try {
      await writeToDir(cachedDir);
      return { saved: true };
    } catch {
      await AsyncStorage.removeItem(DOWNLOAD_DIR_KEY).catch(() => {});
    }
  }

  let initialUri: string | undefined;
  try {
    initialUri = saf.getUriForDirectoryInRoot("Download");
  } catch {
    initialUri = undefined;
  }
  const permissions = await saf.requestDirectoryPermissionsAsync(initialUri);
  if (!permissions.granted || !permissions.directoryUri) {
    return { saved: false, cancelled: true };
  }
  await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, permissions.directoryUri).catch(() => {});
  await writeToDir(permissions.directoryUri);
  return { saved: true };
}

async function saveLocalFileToDevice(localUri: string, filename: string, mimeType: string, uti?: string): Promise<{ saved: boolean; cancelled?: boolean }> {
  if (Platform.OS === "android") {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    return saveBase64OnAndroid(filename, mimeType, base64);
  }
  const sharing = await import("expo-sharing");
  if (!await sharing.isAvailableAsync()) throw new Error("Saving files is not available on this device.");
  await sharing.shareAsync(localUri, {
    mimeType,
    dialogTitle: filename,
    UTI: uti,
  });
  return { saved: true };
}

export async function downloadTradeAgreement(tradeId: string): Promise<{ saved: boolean; cancelled?: boolean; filename: string }> {
  const token = getToken();
  if (!token) throw new Error("Sign in to download the agreement.");
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("File storage is not available on this device.");
  const response = await fetch(`${apiUrl()}/v1/escrows/${encodeURIComponent(tradeId)}/trade-record`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const type = response.headers.get("content-type") || "";
  if (!response.ok || type.includes("json")) {
    let message = "Could not create the agreement record";
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep fallback */
    }
    throw new Error(message);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "%PDF") {
    throw new Error("The agreement file did not come back as a PDF");
  }
  const filename = `2pescrow-agreement-${tradeId.slice(0, 8)}.pdf`;
  const destination = `${directory}${filename}`;
  try {
    await FileSystem.writeAsStringAsync(destination, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
    const res = await saveLocalFileToDevice(destination, filename, "application/pdf", "com.adobe.pdf");
    return { ...res, filename };
  } finally {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
  }
}

export function MessageFile({ tradeId, message }: { tradeId: string; message: TradeMessage }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState<"download" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const locked = useRef(false);
  const token = getToken();
  const url = `${apiUrl()}/v1/escrows/${encodeURIComponent(tradeId)}/messages/${encodeURIComponent(message.id)}/file`;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const ext = message.fileName?.split(".").pop()?.toLowerCase() || "";
  const mime = mimeByExtension[ext] || "application/octet-stream";
  const uti = utiByExtension[ext];
  const isImage = mime.startsWith("image/");
  const cleanName = (message.fileName || "evidence").replace(/[^a-zA-Z0-9._-]/g, "_");

  async function downloadFile() {
    if (locked.current) return;
    locked.current = true;
    setBusy("download");
    setError(null);
    setSavedNotice(null);
    const destination = `${FileSystem.cacheDirectory}trade-${Date.now()}-${cleanName}`;
    try {
      const result = await FileSystem.downloadAsync(url, destination, { headers });
      if (result.status !== 200) throw new Error("Could not download this attachment. Check your connection and trade access.");
      const saved = await saveLocalFileToDevice(result.uri, cleanName, mime, uti);
      if (saved.saved && Platform.OS === "android") {
        setSavedNotice(t("Saved {name} to device.", { name: cleanName }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download this attachment.");
    } finally {
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
      locked.current = false;
      setBusy(null);
    }
  }

  async function openExternalDocument() {
    if (locked.current) return;
    locked.current = true;
    setBusy("open");
    setError(null);
    const destination = `${FileSystem.cacheDirectory}trade-${Date.now()}-${cleanName}`;
    try {
      const sharing = await import("expo-sharing");
      if (!await sharing.isAvailableAsync()) throw new Error("Opening this file is not available on this device.");
      const result = await FileSystem.downloadAsync(url, destination, { headers });
      if (result.status !== 200) throw new Error("Could not download this attachment. Check your connection and trade access.");
      await sharing.shareAsync(result.uri, { mimeType: mime, UTI: uti, dialogTitle: message.fileName || "Trade attachment" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this attachment.");
    } finally {
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
      locked.current = false;
      setBusy(null);
    }
  }

  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      {message.fileAvailable === false ? (
        <Text style={{ color: colors.muted }}>Attachment unavailable: {message.fileName}</Text>
      ) : (
        <>
          {isImage ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("View full image")}
              onPress={() => setViewerOpen(true)}
              style={viewerStyles.thumbWrap}
            >
              <Image
                source={{ uri: url, headers }}
                accessibilityLabel={message.fileName || "Shared image"}
                style={viewerStyles.thumb}
                resizeMode="contain"
              />
              <Text style={viewerStyles.thumbHint}>Tap image to view full screen</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={isImage ? "View image" : "Open file"}
                tone="ghost"
                busy={busy === "open"}
                disabled={Boolean(busy)}
                onPress={() => {
                  if (isImage) setViewerOpen(true);
                  else void openExternalDocument();
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Download"
                tone="ghost"
                busy={busy === "download"}
                disabled={Boolean(busy)}
                onPress={() => void downloadFile()}
              />
            </View>
          </View>
          {isImage ? (
            <Modal
              visible={viewerOpen}
              transparent={false}
              animationType="fade"
              onRequestClose={() => setViewerOpen(false)}
            >
              <SafeAreaView style={viewerStyles.modalBackdrop}>
                <View style={viewerStyles.modalHeader}>
                  <Text translate={false} numberOfLines={1} style={viewerStyles.modalTitle}>
                    {message.fileName || "Image"}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Close")}
                    onPress={() => setViewerOpen(false)}
                    style={viewerStyles.closeBtn}
                  >
                    <Text style={viewerStyles.closeLabel}>Close</Text>
                  </Pressable>
                </View>
                <View style={viewerStyles.modalBody}>
                  <Image
                    source={{ uri: url, headers }}
                    style={viewerStyles.fullImage}
                    resizeMode="contain"
                    accessibilityLabel={message.fileName || "Shared image"}
                  />
                </View>
                <View style={viewerStyles.modalFooter}>
                  {savedNotice ? <Notice text={savedNotice} tone="ok" /> : null}
                  {error ? <Notice text={error} /> : null}
                  <Button
                    label="Download"
                    busy={busy === "download"}
                    disabled={Boolean(busy)}
                    onPress={() => void downloadFile()}
                  />
                </View>
              </SafeAreaView>
            </Modal>
          ) : null}
        </>
      )}
      {savedNotice ? <Notice text={savedNotice} tone="ok" /> : null}
      {error ? <Notice text={error} /> : null}
    </View>
  );
}

const viewerStyles = StyleSheet.create({
  thumbWrap: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: { width: "100%", height: 180 },
  thumbHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 6,
    backgroundColor: colors.bg2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#040a10",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  closeLabel: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  modalBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
