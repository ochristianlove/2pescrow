import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError } from "../src/api";
import { formatAmount, tokenLabel } from "../src/format";
import { colors } from "../src/theme";
import type { TradeRow } from "../src/types";
import { Button, Card, Field, Notice } from "../src/ui";

type Preview = {
  id: string;
  title: string;
  description?: string | null;
  tokenSymbol: string;
  amountAtomic: string;
};

export default function JoinTradeScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"look" | "join" | null>(null);

  async function lookUp() {
    setBusy("look");
    setError(null);
    setPreview(null);
    try {
      setPreview(await api<Preview>(`/v1/escrows/code/${encodeURIComponent(code.trim())}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No open trade uses that code.");
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    setBusy("join");
    setError(null);
    try {
      const joined = await api<TradeRow>("/v1/escrows/join", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      router.replace(`/trade/${joined.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join that trade.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        {error ? <Notice text={error} /> : null}
        <Field label="Trade code" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} placeholder="Paste the code" />
        <Button label="Look up" onPress={() => void lookUp()} busy={busy === "look"} />
        {preview ? (
          <Card>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 18 }}>{preview.title}</Text>
            <Text style={{ color: colors.gold, marginVertical: 8 }}>{formatAmount(preview.amountAtomic)} {tokenLabel(preview.tokenSymbol)}</Text>
            {preview.description ? <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 20 }}>{preview.description}</Text> : null}
            <Button label="Join as seller" onPress={() => void join()} busy={busy === "join"} />
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
