import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Share, Text, View } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../src/api";
import { useAuth } from "../../src/auth";
import { webOrigin } from "../../src/config";
import { formatAmount, shortAddr, tokenLabel } from "../../src/format";
import { colors } from "../../src/theme";
import type { TradeRow } from "../../src/types";
import { Button, Card, Field, Notice } from "../../src/ui";

export default function TradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [trade, setTrade] = useState<TradeRow | null>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setTrade(await api<TradeRow>(`/v1/escrows/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open this trade.");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function send() {
    if (!message.trim() || !id) return;
    setBusy("message");
    setError(null);
    try {
      await api(`/v1/escrows/${id}/messages`, { method: "POST", body: JSON.stringify({ body: message.trim() }) });
      setMessage("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that message.");
    } finally {
      setBusy(null);
    }
  }

  async function dispute() {
    if (!id) return;
    setBusy("dispute");
    setError(null);
    try {
      await api(`/v1/escrows/${id}/disputes`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open a dispute.");
    } finally {
      setBusy(null);
    }
  }

  if (!trade) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20 }}>
        {error ? <Notice text={error} /> : <Text style={{ color: colors.muted }}>Loading the trade…</Text>}
      </View>
    );
  }

  const canFund = trade.status === "AwaitingFunding" || trade.status === "Created";
  const canDispute = trade.status === "Funded" || trade.status === "InProgress";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {error ? <Notice text={error} /> : null}
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>{trade.title}</Text>
        <Text style={{ color: colors.gold, marginTop: 8 }}>{formatAmount(trade.amountAtomic)} {tokenLabel(trade.tokenSymbol)}</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>{trade.status}{trade.partyRole ? ` · you are the ${trade.partyRole}` : ""}</Text>
        {trade.tradeCode ? (
          <Card>
            <Text style={{ color: colors.muted }}>Join code</Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700", letterSpacing: 1, marginVertical: 6 }}>{trade.tradeCode}</Text>
            <Button label="Share code" tone="ghost" onPress={() => void Share.share({ message: `Join my 2Pescrow trade with code ${trade.tradeCode}` })} />
          </Card>
        ) : null}
        {trade.description ? <Text style={{ color: colors.text, lineHeight: 22, marginBottom: 14 }}>{trade.description}</Text> : null}
        <Text style={{ color: colors.muted, marginBottom: 12 }}>Buyer {shortAddr(trade.buyerAddress)} · Seller {shortAddr(trade.sellerAddress)}</Text>
        {(trade.messages || []).map((item) => (
          <View key={item.id} style={{ marginBottom: 10 }}>
            <Text style={{ color: item.authorUserId && item.authorUserId === user?.id ? colors.accent : colors.muted, fontSize: 12 }}>{item.kind === "system" ? "2Pescrow" : item.authorUserId === user?.id ? "You" : "Other party"}</Text>
            <Text style={{ color: colors.text, lineHeight: 20 }}>{item.body}</Text>
          </View>
        ))}
        <Field label="Message" value={message} onChangeText={setMessage} placeholder="Write to the other person" multiline />
        <Button label="Send" onPress={() => void send()} busy={busy === "message"} />
        {canFund ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: colors.muted, marginBottom: 8, lineHeight: 20 }}>The coins move from the buyer’s wallet into the escrow contract. That signature happens in the wallet, on the website.</Text>
            <Button label="Open on the website to fund" tone="ghost" onPress={() => void Linking.openURL(`${webOrigin()}/trades/${trade.id}`)} />
          </View>
        ) : null}
        {canDispute ? (
          <View style={{ marginTop: 18 }}>
            <Field label="Dispute reason" value={reason} onChangeText={setReason} placeholder="What went wrong" multiline />
            <Button label="Open a dispute" tone="danger" onPress={() => void dispute()} busy={busy === "dispute"} />
          </View>
        ) : null}
        {trade.contractAddress ? (
          <View style={{ marginTop: 16 }}>
            <Button label="Open on the website" tone="ghost" onPress={() => void Linking.openURL(`${webOrigin()}/trades/${trade.id}`)} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
