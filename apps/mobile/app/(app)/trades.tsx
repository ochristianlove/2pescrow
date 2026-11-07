import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { formatAmount, tokenLabel } from "../../src/format";
import { colors } from "../../src/theme";
import type { TradeRow } from "../../src/types";
import { Button, Notice } from "../../src/ui";

export default function TradesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api<TradeRow[]>("/v1/me/trades"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load trades.");
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.muted, marginBottom: 14, lineHeight: 20 }}>Trades you opened or joined. Codes stay off the public ledger.</Text>
          {error ? <Notice text={error} /> : null}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
            <View style={{ flex: 1 }}><Button label="New trade" onPress={() => router.push("/new-trade")} /></View>
            <View style={{ flex: 1 }}><Button label="Join" tone="ghost" onPress={() => router.push("/join-trade")} /></View>
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={{ color: colors.muted, marginTop: 12 }}>No trades yet.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/trade/${item.id}`)} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{item.title}</Text>
          <Text style={{ color: colors.gold, marginTop: 6 }}>{formatAmount(item.amountAtomic)} {tokenLabel(item.tokenSymbol)}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{item.status}{item.partyRole ? ` · ${item.partyRole}` : ""}</Text>
        </Pressable>
      )}
    />
  );
}
