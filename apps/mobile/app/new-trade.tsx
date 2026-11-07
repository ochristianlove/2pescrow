import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError } from "../src/api";
import { dollarsToAtomic } from "../src/format";
import { colors } from "../src/theme";
import type { TradeRow } from "../src/types";
import { Button, Field, Notice } from "../src/ui";

export default function NewTradeScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<"USDT" | "USDC">("USDT");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    const amountAtomic = dollarsToAtomic(amount);
    if (!title.trim() || terms.trim().length < 10) {
      setError("Add a title and write the terms in at least a short paragraph.");
      return;
    }
    if (!amountAtomic || amountAtomic === "0") {
      setError("Enter the amount in dollars, such as 25 or 25.50.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api<TradeRow>("/v1/escrows", {
        method: "POST",
        body: JSON.stringify({
          codeFlow: true,
          chain: "ethereum",
          tokenSymbol: token,
          amountAtomic,
          title: title.trim(),
          description: terms.trim(),
        }),
      });
      router.replace(`/trade/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the trade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        {error ? <Notice text={error} /> : null}
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="What you are trading" />
        <Field label="Terms" value={terms} onChangeText={setTerms} placeholder="What each person will do" multiline style={{ minHeight: 120, textAlignVertical: "top" }} />
        <Field label="Amount (USD)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="100" />
        <ViewRow token={token} onChange={setToken} />
        <Button label="Create trade and get a code" onPress={() => void create()} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ViewRow({ token, onChange }: { token: "USDT" | "USDC"; onChange: (next: "USDT" | "USDC") => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
      {(["USDT", "USDC"] as const).map((item) => {
        const selected = item === token;
        return (
          <Pressable key={item} onPress={() => onChange(item)} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.accent : colors.line, paddingVertical: 12, alignItems: "center", backgroundColor: selected ? colors.accent : colors.card }}>
            <Text style={{ color: selected ? "#062116" : colors.text, fontWeight: "700" }}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
