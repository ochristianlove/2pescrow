import { Text } from "../../src/language";
import { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { useLiveNotifications } from "../../src/liveNotifications";
import { formatAmount, shortAddr, tokenLabel } from "../../src/format";
import { colors } from "../../src/theme";
import type { TradeRow } from "../../src/types";
import { Button, Notice } from "../../src/ui";
import { readableLabel, statusColor } from "../../src/tradePresentation";
import { TradeRoleTags } from "../../src/TradeRoleTags";
import { TradePartyBadge } from "../../src/TradePartyBadge";

export default function TradesScreen({ publicOnly = false }: { publicOnly?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const { syncEscrowIds } = useLiveNotifications();
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPublic, setShowPublic] = useState(publicOnly);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setError(null);
    try {
      const next = await api<TradeRow[]>(user && !showPublic ? "/v1/me/trades" : "/v1/escrows");
      if (request !== generation.current) return;
      setRows(next);
      if (user && !showPublic) syncEscrowIds(next.map((trade) => trade.id));
    } catch (err) {
      if (request === generation.current) setError(err instanceof ApiError ? err.message : "Could not load trades.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [user, showPublic, syncEscrowIds]);

  useFocusEffect(useCallback(() => { if (rows.length === 0) setLoading(true); void load(); return () => { generation.current++; }; }, [load, rows.length]));

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
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 34, marginBottom: 8 }}>{showPublic ? "Public ledger" : user ? "My trades" : "Trades"}</Text>
          <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 16, lineHeight: 24 }}>
            {user && !showPublic
              ? "Every trade where you are buyer, seller, or linked by wallet."
              : "All escrow deals on the platform ledger, by chain. Sign in to see all your trades."}
          </Text>
          {error ? <><Notice text={error} /><Button label="Try again" tone="ghost" onPress={() => void load()} /></> : null}
          {user && !publicOnly ? <View style={{ marginBottom: 12 }}><Button label={showPublic ? "Show my trades" : "Browse public ledger"} tone="ghost" onPress={() => { setRows([]); setLoading(true); setShowPublic(value => !value); }} /></View> : null}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
            <View style={{ flex: 1 }}><Button label="Start a trade" onPress={() => router.push("/new-trade")} /></View>
            <View style={{ flex: 1 }}><Button label="Join a trade" tone="ghost" onPress={() => router.push(user ? "/join-trade" : "/sign-in")} /></View>
          </View>
        </View>
      }
      ListEmptyComponent={!error ? <Text style={{ color: colors.muted, marginTop: 12 }}>{loading ? "Loading trades…" : "No trades yet."}</Text> : null}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/trade/${item.id}`)} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: "rgba(62, 207, 142, 0.16)", padding: 14, marginTop: 10, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <Text translate={false} numberOfLines={2} style={{ color: colors.text, fontWeight: "700", fontSize: 16, flex: 1, minWidth: 0 }}>
              {item.title}
            </Text>
            <View style={{
              backgroundColor: `${statusColor(item.status)}22`,
              borderColor: `${statusColor(item.status)}55`,
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 4,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
            }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor(item.status), flexShrink: 0 }} />
              <Text numberOfLines={1} style={{ color: statusColor(item.status), fontWeight: "700", fontSize: 12 }}>
                {readableLabel(item.status)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Text style={{ color: colors.gold, fontWeight: "600" }}>{formatAmount(item.amountAtomic)} {tokenLabel(item.tokenSymbol)}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>· {item.chain === "tron" ? "Tron" : "Ethereum"}</Text>
          </View>
          {user ? <TradePartyBadge trade={item} userId={user.id} walletAddresses={user.wallets?.map((wallet) => wallet.address)} /> : null}
          <TradeRoleTags
            buyer={item.buyerUser?.displayName || (item.buyerAddress ? shortAddr(item.buyerAddress) : "")}
            seller={item.sellerUser?.displayName || (item.sellerAddress ? shortAddr(item.sellerAddress) : "")}
          />
        </Pressable>
      )}
    />
    <AppBottomNav active="escrows" />
    </View>
  );
}
