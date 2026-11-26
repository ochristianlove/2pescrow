import { Text, useLanguage } from "./language";
import { useEffect, useRef, useState } from "react";
import { Image, Modal, Platform, Pressable, SafeAreaView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

type ExpoAvModule = typeof import("expo-av");
function LazyVideo({ source, style, shouldPlay = false }: {
  source: { uri: string; headers?: Record<string, string> };
  style: object;
  shouldPlay?: boolean;
}) {
  const [mod, setMod] = useState<ExpoAvModule | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("expo-av").then((loaded) => {
      if (!cancelled) setMod(loaded);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!mod) {
    return (
      <View style={[style, { alignItems: "center", justifyContent: "center", backgroundColor: "#040a10" }]}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Loading video player…</Text>
      </View>
    );
  }
  const VideoComponent = mod.Video;
  return (
    <VideoComponent
      source={source}
      style={style}
      useNativeControls
      shouldPlay={shouldPlay}
      resizeMode={mod.ResizeMode.CONTAIN}
    />
  );
}
import { api } from "./api";
import { apiUrl } from "./config";
import { getToken } from "./session";
import { colors } from "./theme";
import type { TradeMessage, TradeRow } from "./types";
import { Button, Field, Notice } from "./ui";

const imageMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const videoMimes = ["video/mp4", "video/quicktime", "video/x-m4v", "video/webm"];
const documentMimes = ["application/pdf"];
const acceptedAll = [...imageMimes, ...videoMimes, ...documentMimes];
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
};
const utiByExtension: Record<string, string> = {
  jpg: "public.jpeg",
  jpeg: "public.jpeg",
  png: "public.png",
  webp: "org.webmproject.webp",
  gif: "com.compuserve.gif",
  pdf: "com.adobe.pdf",
  mp4: "public.mpeg-4",
  mov: "com.apple.quicktime-movie",
  m4v: "com.apple.m4v-video",
  webm: "org.webmproject.webm",
};
const DOWNLOAD_DIR_KEY = "twopescrow.downloadDirUri";

type PickedAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

export function EvidenceComposer({ trade, seller, disabled, onBusy, onUploaded }: {
  trade: TradeRow; seller: boolean; disabled: boolean; onBusy: (value: boolean) => void; onUploaded: () => Promise<void>;
}) {
  const [file, setFile] = useState<PickedAttachment | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const locked = useRef(false);

  useEffect(() => () => {
    if (file?.uri.startsWith(FileSystem.cacheDirectory || "__none__")) {
      void FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
    }
  }, [file]);

  function validatePicked(uri: string, rawName: string, rawMime: string | undefined, size: number | undefined): PickedAttachment {
    const ext = rawName.split(".").pop()?.toLowerCase() || "";
    const mimeType = rawMime || mimeByExtension[ext] || "";
    const isVideo = mimeType.startsWith("video/");
    const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_MEDIA_BYTES;
    if (!mimeType || !acceptedAll.includes(mimeType) || size == null || size === 0 || size > maxSize) {
      throw new Error(
        isVideo
          ? "Choose an MP4, MOV, or WebM video up to 50 MB."
          : "Choose a JPG, PNG, WebP, GIF, PDF (up to 20 MB), or video (up to 50 MB).",
      );
    }
    return { uri, name: rawName, mimeType, size };
  }

  async function pickMedia() {
    if (locked.current || disabled) return;
    locked.current = true;
    setError(null);
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        throw new Error("Allow photo library access in Settings to attach photos or videos.");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const info = await FileSystem.getInfoAsync(asset.uri);
      const size = asset.fileSize ?? (info.exists && "size" in info ? info.size : undefined);
      const isVid = asset.type === "video" || asset.mimeType?.startsWith("video/");
      const fallbackExt = isVid ? "mp4" : "jpg";
      const fileName = asset.fileName || asset.uri.split("/").pop() || `evidence-${Date.now()}.${fallbackExt}`;
      const mime = asset.mimeType || mimeByExtension[fileName.split(".").pop()?.toLowerCase() || ""] || (isVid ? "video/mp4" : "image/jpeg");
      setFile(validatePicked(asset.uri, fileName, mime, size));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not choose a photo or video. Please try again.");
    } finally {
      locked.current = false;
    }
  }

  async function pickDocument() {
    if (locked.current || disabled) return;
    locked.current = true;
    setError(null);
    try {
      const picker = await import("expo-document-picker");
      const result = await picker.getDocumentAsync({
        type: [...documentMimes, ...imageMimes, ...videoMimes],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const selected = result.assets[0];
      const info = await FileSystem.getInfoAsync(selected.uri);
      const size = selected.size ?? (info.exists && "size" in info ? info.size : undefined);
      setFile(validatePicked(selected.uri, selected.name, selected.mimeType, size));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not choose a file. Please try again.");
    } finally {
      locked.current = false;
    }
  }

  async function upload() {
    if (!file || disabled || locked.current) return;
    locked.current = true;
    setUploading(true);
    onBusy(true);
    setError(null);
    try {
      const form = new FormData();
      // React Native's FormData accepts local file descriptors; DOM types only declare Blob.
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
      const fulfilment = seller && Boolean(trade.contractAddress) && ["Funded", "InProgress"].includes(trade.status);
      form.append("kind", fulfilment ? "fulfilment" : "evidence");
      form.append("note", note.trim() || (fulfilment ? "Seller shared fulfilment proof" : "Evidence shared by a trade party"));
      await api(`/v1/escrows/${encodeURIComponent(trade.id)}/evidence`, { method: "POST", body: form });
      setFile(null);
      setNote("");
      await onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Your file is still selected; try again.");
    } finally {
      locked.current = false;
      setUploading(false);
      onBusy(false);
    }
  }

  const isSelectedVideo = Boolean(file?.mimeType.startsWith("video/"));

  return (
    <View style={{ gap: 10 }}>
      {error ? <Notice text={error} /> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={file ? "Change media" : "Photo / Video"}
            tone="ghost"
            disabled={disabled || uploading}
            onPress={() => void pickMedia()}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="PDF / File"
            tone="ghost"
            disabled={disabled || uploading}
            onPress={() => void pickDocument()}
          />
        </View>
      </View>
      {file ? (
        <>
          <Text translate={false} style={{ color: colors.text }}>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </Text>
          {file.mimeType.startsWith("image/") ? (
            <Image source={{ uri: file.uri }} style={{ width: "100%", height: 180, borderRadius: 10 }} resizeMode="contain" accessibilityLabel={file.name} />
          ) : isSelectedVideo ? (
            <View style={viewerStyles.videoPreviewBox}>
              <LazyVideo source={{ uri: file.uri }} style={{ width: "100%", height: 200 }} />
            </View>
          ) : null}
          <Field label="Evidence note (optional)" value={note} onChangeText={setNote} editable={!disabled} maxLength={1000} multiline />
          <Button label="Upload to this trade" busy={uploading} disabled={disabled} onPress={() => void upload()} />
          <Button label="Remove attachment" tone="ghost" disabled={disabled || uploading} onPress={() => setFile(null)} />
        </>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Photos & PDFs up to 20 MB, or videos up to 50 MB. Review your file before uploading.
        </Text>
      )}
    </View>
  );
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

export async function saveTextFileToDevice(filename: string, mimeType: string, content: string, uti = "public.comma-separated-values-text"): Promise<{ saved: boolean; cancelled?: boolean }> {
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("File storage is not available on this device.");
  const destination = `${directory}${filename}`;
  try {
    await FileSystem.writeAsStringAsync(destination, content, { encoding: FileSystem.EncodingType.UTF8 });
    return await saveLocalFileToDevice(destination, filename, mimeType, uti);
  } finally {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
  }
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
  const isVideo = mime.startsWith("video/");
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
          ) : isVideo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Play video")}
              onPress={() => setViewerOpen(true)}
              style={viewerStyles.videoCard}
            >
              <View style={viewerStyles.playBadge}>
                <Text translate={false} style={{ color: colors.primaryFg, fontWeight: "800", fontSize: 16 }}>▶</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text translate={false} numberOfLines={1} style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>
                  {message.fileName || "Video"}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Tap to play video</Text>
              </View>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={isImage ? "View image" : isVideo ? "Play video" : "Open file"}
                tone="ghost"
                busy={busy === "open"}
                disabled={Boolean(busy)}
                onPress={() => {
                  if (isImage || isVideo) setViewerOpen(true);
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
          {isImage || isVideo ? (
            <Modal
              visible={viewerOpen}
              transparent={false}
              animationType="fade"
              onRequestClose={() => setViewerOpen(false)}
            >
              <SafeAreaView style={viewerStyles.modalBackdrop}>
                <View style={viewerStyles.modalHeader}>
                  <Text translate={false} numberOfLines={1} style={viewerStyles.modalTitle}>
                    {message.fileName || (isVideo ? "Video" : "Image")}
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
                  {isImage ? (
                    <Image
                      source={{ uri: url, headers }}
                      style={viewerStyles.fullImage}
                      resizeMode="contain"
                      accessibilityLabel={message.fileName || "Shared image"}
                    />
                  ) : (
                    <LazyVideo
                      source={{ uri: url, headers }}
                      style={viewerStyles.fullImage}
                      shouldPlay
                    />
                  )}
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
  videoPreviewBox: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#040a10",
  },
  videoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  playBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
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
