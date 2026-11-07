import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError, tokenFromInput } from "../src/api";
import { useAuth } from "../src/auth";
import { apiUrl } from "../src/config";
import { colors } from "../src/theme";
import { Button, Field, Notice, ScreenTitle } from "../src/ui";

export default function SignInScreen() {
  const params = useLocalSearchParams<{ link?: string }>();
  const router = useRouter();
  const { signInWithToken } = useAuth();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState(typeof params.link === "string" ? params.link : "");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);

  async function sendLink() {
    setBusy("send");
    setError(null);
    setSent(null);
    try {
      await api("/v1/auth/magic-link", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setSent("Check your email. Paste the sign-in link here. It works once and expires in 30 minutes.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the sign-in email.");
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    const token = tokenFromInput(link);
    if (!token) {
      setError("Paste the full sign-in link from the email, or the token at the end of it.");
      return;
    }
    setBusy("verify");
    setError(null);
    try {
      const session = await api<{ token: string }>("/v1/auth/magic-link/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      await signInWithToken(session.token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That sign-in link did not work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <ScreenTitle
            title="2Pescrow"
            subtitle="Two people trade directly. The payment stays in a smart contract until the deal is done."
          />
          {error ? <Notice text={error} /> : null}
          {sent ? <Notice text={sent} tone="ok" /> : null}
          <Field
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
          />
          <Button label="Email me a sign-in link" onPress={() => void sendLink()} busy={busy === "send"} />
          <Text style={{ color: colors.muted, marginVertical: 18, lineHeight: 20 }}>
            Open the email on this phone and paste the link below. Wallet funding still opens in the browser, because the signature happens in your wallet.
          </Text>
          <Field
            label="Sign-in link"
            autoCapitalize="none"
            autoCorrect={false}
            value={link}
            onChangeText={setLink}
            placeholder="https://…/auth/verify?token=…"
            multiline
          />
          <Button label="Sign in" onPress={() => void verify()} busy={busy === "verify"} />
          <Text style={{ color: colors.muted, marginTop: 22, fontSize: 12 }}>API {apiUrl()}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
