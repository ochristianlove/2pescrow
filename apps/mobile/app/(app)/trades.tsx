import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { formatAmount, tokenLabel } from "../../src/format";
import { colors } from "../../src/theme";
import type { TradeRow } from "../../src/types";
import { Button, Notice } from "../../src/ui";

export default function TradesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api<TradeRow[]>(user ? "/v1/me/trades" : "/v1/escrows"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load trades.");
    }
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <AppTopBar />
    <FlatList
      style={{ backgroundColor: colors.bg, flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 32 }}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 34, marginBottom: 8 }}>{user ? "My trades" : "Trades"}</Text>
          <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 16, lineHeight: 24 }}>
            {user
              ? "Every trade where you are buyer, seller, or linked by wallet."
              : "All escrow deals on the platform ledger, by chain. Sign in to see all your trades."}
          </Text>
          {error ? <Notice text={error} /> : null}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
            <View style={{ flex: 1 }}><Button label="Start a trade" onPress={() => router.push("/new-trade")} /></View>
            <View style={{ flex: 1 }}><Button label="Join a trade" tone="ghost" onPress={() => router.push(user ? "/join-trade" : "/sign-in")} /></View>
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={{ color: colors.muted, marginTop: 12 }}>No trades yet.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/trade/${item.id}`)} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: "rgba(62, 207, 142, 0.16)", padding: 14, marginTop: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{item.title}</Text>
          <Text style={{ color: colors.gold, marginTop: 6 }}>{formatAmount(item.amountAtomic)} {tokenLabel(item.tokenSymbol)}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{item.status}{item.partyRole ? ` · ${item.partyRole}` : ""}</Text>
        </Pressable>
      )}
    />
    <AppBottomNav active="escrows" />
    </View>
  );
}
