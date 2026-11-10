import { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { formatAmount, tokenLabel } from "../../src/format";
import { colors } from "../../src/theme";
import type { TradeRow } from "../../src/types";
import { Notice } from "../../src/ui";

export default function LedgerScreen() {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<TradeRow[]>("/v1/escrows"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the ledger.");
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <FlatList
      style={{ backgroundColor: colors.bg, flex: 1 }}
      contentContainerStyle={{ padding: 20 }}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      ListHeaderComponent={
        <>
          <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 20 }}>Public trades only. A trade opened with a private code does not appear here.</Text>
          {error ? <Notice text={error} /> : null}
        </>
      }
      ListEmptyComponent={<Text style={{ color: colors.muted }}>Nothing on the ledger yet.</Text>}
      renderItem={({ item }) => (
        <Text style={{ color: colors.text, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          {item.title}{"\n"}
          <Text style={{ color: colors.gold }}>{formatAmount(item.amountAtomic)} {tokenLabel(item.tokenSymbol)}</Text>
          <Text style={{ color: colors.muted }}> · {item.status}</Text>
        </Text>
      )}
    />
    <AppBottomNav active="escrows" />
    </View>
  );
}
