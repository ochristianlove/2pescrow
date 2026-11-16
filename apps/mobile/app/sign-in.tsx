import { Text, TextInput } from "../src/language";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { api, ApiError, tokenFromInput } from "../src/api";
import { AppTopBar } from "../src/AppTopBar";
import { LegalSheet, type LegalDoc } from "../src/LegalSheet";
import { PageWash } from "../src/PageWash";
import { useAuth } from "../src/auth";

export default function SignInScreen() {
  const params = useLocalSearchParams<{ link?: string }>();
  const router = useRouter();
  const { signInWithToken } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [legal, setLegal] = useState<LegalDoc | null>(null);

  useEffect(() => {
    const incoming = typeof params.link === "string" ? params.link : "";
    const token = tokenFromInput(incoming);
    if (!token) return;
    let cancelled = false;
    api<{ token: string }>("/v1/auth/magic-link/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(async (session) => {
        if (cancelled) return;
        await signInWithToken(session.token);
        router.replace("/");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "That sign-in link did not work.");
      });
    return () => {
      cancelled = true;
    };
  }, [params.link, router, signInWithToken]);

  async function sendLink() {
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const res = await api<{ message?: string }>("/v1/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(res.message || "Check your email for a sign-in link.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the sign-in email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <PageWash />
      <AppTopBar />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Buyers & sellers</Text>
          <Text style={styles.title}>Sign in with magic link</Text>
          <Text style={styles.lead}>
            No password. We email a one-time link — use it to open your dashboard, link your wallet, and view your full transaction history as a buyer or seller.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#8aa3ad"
              style={styles.input}
            />
            {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
            {sent ? <Text style={styles.okBanner}>{sent}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void sendLink()} style={styles.submit}>
              <Text style={styles.submitLabel}>{busy ? "Sending…" : "Email me a sign-in link"}</Text>
            </Pressable>
            <Text style={styles.legalNote}>
              By signing in, you agree to the <Text style={styles.link} onPress={() => setLegal("terms")}>Terms</Text>
              {" and "}
              <Text style={styles.link} onPress={() => setLegal("privacy")}>Privacy Policy</Text>.
            </Text>
          </View>

          <Text style={styles.hint}>
            Prefer browsing without an account?{" "}
            <Text style={styles.link} onPress={() => router.push("/(app)/ledger")}>
              View public trades
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {legal ? <LegalSheet key={legal} doc={legal} onClose={() => setLegal(null)} /> : null}

      <SafeAreaView edges={["bottom"]} style={styles.nav}>
        <NavItem label="Home" icon="home" onPress={() => router.replace("/")} />
        <NavItem label="Escrows" icon="escrows" onPress={() => router.push("/(app)/trades")} />
        <NavItem label="Start" fab icon="start" onPress={() => router.replace("/sign-in")} />
        <NavItem label="Join" icon="join" onPress={() => router.replace("/sign-in")} />
        <NavItem label="Sign in" active icon="profile" onPress={() => router.replace("/sign-in")} />
      </SafeAreaView>
    </View>
  );
}

function NavItem({
  label,
  icon,
  active,
  fab,
  onPress,
}: {
  label: string;
  icon: "home" | "escrows" | "start" | "join" | "profile";
  active?: boolean;
  fab?: boolean;
  onPress: () => void;
}) {
  const color = active ? "#3ecf8e" : "#8aa3ad";
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.navItem}>
      <View style={[styles.navIconSlot, fab && styles.navFab]}>
        <NavIcon name={icon} color={fab ? "#04130d" : color} />
      </View>
      <Text style={[styles.navLabel, active && { color: "#3ecf8e" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function NavIcon({ name, color }: { name: "home" | "escrows" | "start" | "join" | "profile"; color: string }) {
  const common = { fill: "none" as const, stroke: color, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
      </Svg>
    );
  }
  if (name === "escrows") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M7 11V7a5 5 0 0 1 10 0v4M6 11h12v10H6V11Z" />
      </Svg>
    );
  }
  if (name === "start") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M12 5v14M5 12h14" />
      </Svg>
    );
  }
  if (name === "join") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M7 11h10M7 15h6M10 7V5a2 2 0 1 1 4 0v2M6 11h12v10H6V11Z" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path {...common} d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      <Path {...common} d="M4 20a8 8 0 0 1 16 0" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#071018" },
  topbar: {
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "#1f3440",
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  logo: { height: 32, width: 148 },
  walletPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    maxWidth: 168,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1b24",
  },
  walletDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3ecf8e" },
  walletLabel: { color: "#e8f4f2", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  walletChevron: { color: "#8aa3ad", fontSize: 16, marginTop: -2 },
  scroll: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 28 },
  eyebrow: {
    color: "#e8b84a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.4,
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
  lead: { color: "rgba(232, 244, 242, 0.82)", fontSize: 16, lineHeight: 26, marginBottom: 18 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.18)",
    backgroundColor: "#0c1a24",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    marginBottom: 8,
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
    fontSize: 16,
  },
  errorBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 107, 107, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.35)",
    color: "#ffb4b4",
    width: "100%",
  },
  okBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(62, 207, 142, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.35)",
    color: "#b8f5d4",
  },
  submit: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3ecf8e",
  },
  submitLabel: { color: "#042016", fontWeight: "700", fontSize: 15 },
  legalNote: { color: "#8aa3ad", fontSize: 13, lineHeight: 20, marginTop: 12, textAlign: "center" },
  hint: { color: "#8aa3ad", fontSize: 13, lineHeight: 20, marginTop: 12, marginBottom: 16 },
  link: { color: "#2bb8c8", fontWeight: "700" },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1f3440",
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "flex-end", minHeight: 58, gap: 2 },
  navIconSlot: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  navFab: { backgroundColor: "#3ecf8e", borderRadius: 12 },
  navLabel: { color: "#8aa3ad", fontSize: 10, fontWeight: "600" },
});
