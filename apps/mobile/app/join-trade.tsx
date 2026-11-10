import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError } from "../src/api";
import { AppBottomNav } from "../src/AppBottomNav";
import { AppTopBar } from "../src/AppTopBar";
import { PageWash } from "../src/PageWash";
import { useAuth } from "../src/auth";
import { formatAmount, tokenLabel } from "../src/format";

type Preview = {
  id: string;
  tradeCode?: string;
  title: string;
  description?: string | null;
  chain?: string;
  tokenSymbol: string;
  amountAtomic: string;
};

export default function JoinTradeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"look" | "join" | null>(null);

  async function lookUp() {
    const next = code.trim().toUpperCase();
    if (!next) return;
    setBusy("look");
    setError(null);
    setPreview(null);
    try {
      const result = await api<Preview>(`/v1/escrows/code/${encodeURIComponent(next)}`);
      setPreview(result);
      if (result.tradeCode) setCode(result.tradeCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No open trade uses that code.");
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    if (!user) {
      router.push("/sign-in");
      return;
    }
    setBusy("join");
    setError(null);
    try {
      const joined = await api<{ id: string }>("/v1/escrows/join", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      router.replace(`/trade/${joined.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join that trade.");
    } finally {
      setBusy(null);
    }
  }

  const network = preview?.chain === "tron" ? "Tron" : preview?.chain === "ethereum" ? "Ethereum" : "Earlier EVM trade";

  return (
    <View style={styles.screen}>
    <PageWash />
    <AppTopBar />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Seller · Join a trade</Text>
          <Text style={styles.title}>Enter your trade code</Text>
          <Text style={styles.lead}>
            Confirm the deal details, then join with your account. Your profile will be linked as the seller in the same shared trade room.
          </Text>
          <View style={styles.card}>
            <Text style={styles.label}>Trade code</Text>
            <TextInput
              value={code}
              onChangeText={(value) => {
                setCode(value.toUpperCase());
                setPreview(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              placeholder="K7M4-QP2N"
              placeholderTextColor="#8aa3ad"
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!code.trim() || busy === "look"}
              onPress={() => void lookUp()}
              style={[styles.find, (!code.trim() || busy === "look") && styles.findDisabled]}
            >
              <Text style={styles.findLabel}>Find trade</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {preview ? (
              <View style={styles.preview}>
                <Text style={styles.eyebrow}>Review before joining</Text>
                <Text style={styles.previewTitle}>{preview.title}</Text>
                <Text style={styles.terms}>{preview.description?.trim() || "No extra terms provided."}</Text>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Amount</Text>
                  <Text style={styles.rowValue}>{tokenLabel(preview.tokenSymbol)} {formatAmount(preview.amountAtomic)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Network</Text>
                  <Text style={styles.rowValue}>{network}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Your role</Text>
                  <Text style={styles.rowValue}>Seller</Text>
                </View>
                <Text style={styles.hint}>
                  Joining links your seller account only. After you join, connect the wallet that should receive funds and tap “Link my seller wallet” in the trade room—nothing is linked automatically from your profile.
                </Text>
                <Pressable accessibilityRole="button" disabled={busy === "join"} onPress={() => void join()} style={styles.join}>
                  <Text style={styles.joinLabel}>
                    {busy === "join" ? "Joining trade…" : user ? "Join as seller" : "Sign in to join as seller"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScrollView>
    </KeyboardAvoidingView>
    <AppBottomNav active="join" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#071018" },
  scroll: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 32 },
  eyebrow: {
    color: "#e8b84a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  title: {
    color: "#e8f4f2",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  lead: { color: "#8aa3ad", fontSize: 16, lineHeight: 24, marginBottom: 18 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.18)",
    backgroundColor: "#0c1a24",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  label: { color: "#8aa3ad", fontSize: 14, marginTop: 10 },
  input: {
    marginTop: 6,
    backgroundColor: "#07131a",
    borderWidth: 1,
    borderColor: "#1f3440",
    color: "#e8f4f2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 18,
    letterSpacing: 2,
  },
  find: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(232, 184, 74, 0.38)",
    backgroundColor: "transparent",
  },
  findDisabled: { opacity: 0.55 },
  findLabel: { color: "#e8f4f2", fontWeight: "700", fontSize: 15 },
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 107, 107, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.35)",
    color: "#ffb4b4",
  },
  preview: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#1f3440" },
  previewTitle: { color: "#e8f4f2", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  terms: { color: "#e8f4f2", lineHeight: 22, marginBottom: 12 },
  row: { flexDirection: "row", gap: 12, marginBottom: 8 },
  rowLabel: { width: 88, color: "#8aa3ad" },
  rowValue: { color: "#e8f4f2", flex: 1 },
  hint: { color: "#8aa3ad", lineHeight: 20, marginVertical: 12 },
  join: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3ecf8e",
  },
  joinLabel: { color: "#042016", fontWeight: "700", fontSize: 15 },
});
