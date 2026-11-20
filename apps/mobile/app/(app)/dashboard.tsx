import { Text, TextInput } from "../../src/language";
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { LogoLoader } from "../../src/LogoLoader";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { useLiveNotifications } from "../../src/liveNotifications";
import { breakable, formatAmount, shortAddr, tokenLabel } from "../../src/format";
import { TradeRoleTags } from "../../src/TradeRoleTags";
import { TradePartyBadge } from "../../src/TradePartyBadge";
import { readableLabel, statusColor } from "../../src/tradePresentation";
import { colors } from "../../src/theme";
import { Button, Notice } from "../../src/ui";

type Dash = {
  stats: {
    activeEscrows: number;
    completed: number;
    inDispute: number;
    totalValueLockedAtomic: string;
    totalEscrows: number;
  };
  wallets: { address: string }[];
  myTrades?: { id: string; title: string; status: string; chain?: string; partyRole?: "buyer" | "seller" | "admin" | "party"; buyerUserId?: string | null; sellerUserId?: string | null; buyerAddress?: string | null; sellerAddress?: string | null; buyerUser?: { displayName?: string | null } | null; sellerUser?: { displayName?: string | null } | null }[];
};

type HistoryRow = {
  id: string;
  eventName: string;
  escrowTitle: string;
  amountAtomic: string;
  tokenSymbol: string;
  explorerTx?: string | null;
};

type HistoryPage = { items: HistoryRow[]; nextCursor: string | null };

type Referral = {
  enrolled: boolean;
  successfulReferrals?: number;
  referees?: { email: string | null }[];
  pendingBalanceAtomic?: string;
};

type DashboardCache = {
  dash: Dash;
  history: HistoryRow[];
  cursor: string | null;
  referral: Referral | null;
};

function dashboardCacheKey(userId: string) {
  return `twopescrow.dashboard:${userId}`;
}

function eventLabel(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { syncEscrowIds } = useLiveNotifications();
  const fresh = useRef(false);
  const [data, setData] = useState<Dash | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [publicName, setPublicName] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dash, hist, ref] = await Promise.all([
        api<Dash>("/v1/me/dashboard"),
        api<HistoryPage>("/v1/me/history?limit=5"),
        api<Referral>("/v1/me/referral"),
      ]);
      fresh.current = true;
      setData(dash);
      if (dash.myTrades) syncEscrowIds(dash.myTrades.map((trade) => trade.id));
      setHistory(hist.items);
      setCursor(hist.nextCursor);
      setReferral(ref);
      setError(null);
      if (user?.id) {
        const payload: DashboardCache = { dash, history: hist.items, cursor: hist.nextCursor, referral: ref };
        void AsyncStorage.setItem(dashboardCacheKey(user.id), JSON.stringify(payload)).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the dashboard.");
    }
  }, [syncEscrowIds, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void AsyncStorage.getItem(dashboardCacheKey(user.id)).then((raw) => {
      if (cancelled || fresh.current || !raw) return;
      try {
        const cached = JSON.parse(raw) as DashboardCache;
        if (!cached?.dash) return;
        setData((current) => current ?? cached.dash);
        setHistory((current) => current.length > 0 ? current : cached.history ?? []);
        setCursor((current) => current ?? cached.cursor ?? null);
        setReferral((current) => current ?? cached.referral ?? null);
      } catch {
        // ignore cache parse error
      }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    setPublicName((current) => current || user?.displayName?.trim() || user?.email?.trim() || "");
  }, [user]);

  async function enroll() {
    setEnrolling(true);
    setError(null);
    try {
      await api("/v1/referral/register", {
        method: "POST",
        body: JSON.stringify({ displayName: publicName.trim() || undefined }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your referral link.");
    } finally {
      setEnrolling(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<HistoryPage>(`/v1/me/history?limit=5&cursor=${cursor}`);
      setHistory((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.items.filter((row) => !seen.has(row.id))];
      });
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load more history.");
    } finally {
      setLoadingMore(false);
    }
  }

  const trades = data?.myTrades ?? [];
  const active = data?.stats.activeEscrows ?? 0;
  const wallets = data?.wallets.length ?? 0;
  const name = user?.displayName || user?.email || "there";
  const greeting = active > 0
    ? "Good to see you again. Your active escrows are waiting below."
    : trades.length > 0
      ? "Good to see you again. Jump back into your trades whenever you're ready."
      : "Good to see you again. Start a trade or join one with a code when you're ready.";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppTopBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {error ? <Notice text={error} /> : null}
        {!data ? <LogoLoader message="Loading your dashboard…" /> : <>
        <View style={styles.welcome}>
          <Text style={styles.eyebrow}>Dashboard</Text>
          <Text style={styles.title}>
            Welcome back, <Text translate={false} style={styles.name}>{breakable(name)}</Text>
          </Text>
          <Text style={styles.lede}>{greeting}</Text>
          <Text style={styles.meta}>
            {wallets > 0 ? `${wallets} linked wallet(s)` : "Link a wallet on your profile to match escrows to your account."}
          </Text>
          <View style={styles.actions}>
            <Button label="Start a trade" onPress={() => router.push("/new-trade")} />
            <Button label="Join a trade" tone="ghost" onPress={() => router.push("/join-trade")} />
            <Button label="Profile" tone="ghost" onPress={() => router.push("/(app)/account")} />
          </View>
        </View>

        <Text style={styles.section}>My overview</Text>
        <View style={styles.stats}>
          <Stat label="Active Escrows" value={String(data?.stats.activeEscrows ?? 0)} />
          <Stat label="Total Value Locked" value={`${formatAmount(data?.stats.totalValueLockedAtomic || "0")} USDT eq.`} />
          <Stat label="Completed" value={String(data?.stats.completed ?? 0)} />
          <Stat label="In Dispute" value={String(data?.stats.inDispute ?? 0)} />
        </View>

        <View style={styles.head}>
          <Text style={styles.section}>My trades</Text>
          <Text style={styles.meta}>{data?.stats.totalEscrows ?? 0} total</Text>
        </View>
        {trades.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.lede}>No trades are linked to your profile yet.</Text>
            <Button label="Start a trade" onPress={() => router.push("/new-trade")} />
            <View style={{ height: 8 }} />
            <Button label="Join a trade" tone="ghost" onPress={() => router.push("/join-trade")} />
            <Pressable onPress={() => router.push("/(app)/account")}>
              <Text style={styles.link}>Save a wallet on your profile</Text>
            </Pressable>
          </View>
        ) : trades.map((trade) => (
          <Pressable key={trade.id} onPress={() => router.push(`/trade/${trade.id}`)} style={styles.row}>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text translate={false} style={styles.rowTitle}>{trade.title}</Text>
              <TradePartyBadge trade={trade} userId={user?.id} walletAddresses={data?.wallets.map((wallet) => wallet.address)} />
              <TradeRoleTags
                buyer={trade.buyerUser?.displayName || (trade.buyerAddress ? shortAddr(trade.buyerAddress) : "")}
                seller={trade.sellerUser?.displayName || (trade.sellerAddress ? shortAddr(trade.sellerAddress) : "")}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: `${statusColor(trade.status)}22`,
                borderColor: `${statusColor(trade.status)}55`,
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor(trade.status) }} />
              <Text style={{ color: statusColor(trade.status), fontWeight: "700", fontSize: 12 }}>
                {readableLabel(trade.status)}
              </Text>
            </View>
          </Pressable>
        ))}

        <View style={styles.card}>
          <Text style={styles.eyebrow}>Referral program</Text>
          {!referral?.enrolled ? (
            <>
              <Text style={styles.cardTitle}>Earn 2% when your traders succeed</Text>
              <Text style={styles.lede}>Share one link. We track commissions and tier status — no wallet required to start.</Text>
              <Text style={styles.meta}>Public name (optional)</Text>
              <TextInput
                value={publicName}
                onChangeText={setPublicName}
                placeholder="Christian"
                placeholderTextColor="#8aa3ad"
                autoCapitalize="words"
                style={styles.nameInput}
              />
              <Button label={enrolling ? "Creating link…" : "Get my referral link"} onPress={() => void enroll()} busy={enrolling} />
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Your referrer stats</Text>
              <StatLine label="Signups via your link" value={String(referral.referees?.length ?? 0)} />
              <StatLine label="Converted (completed trades)" value={String(referral.successfulReferrals ?? 0)} />
              <StatLine label="Pending payout" value={formatAmount(referral.pendingBalanceAtomic || "0")} />
              <Button label="Payouts & cash out" onPress={() => router.push("/(app)/referrals")} />
            </>
          )}
        </View>

        {user?.role !== "admin" ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Dispute agents</Text>
            <Text style={styles.cardTitle}>Become an agent. And earn</Text>
            <Text style={styles.lede}>Help resolve disputes after you qualify on completed trade volume. Earn commission on cases you handle.</Text>
            <Button
              label={agentOpen ? "Hide agent details" : "View qualification & apply"}
              tone={agentOpen ? "ghost" : "primary"}
              onPress={() => setAgentOpen((open) => !open)}
            />
            {agentOpen ? <Text style={styles.lede}>Qualification and the application stay on your account on the website.</Text> : null}
          </View>
        ) : null}

        <Text style={styles.section}>Transaction history</Text>
        {history.length === 0 ? <Text style={styles.lede}>Events from your escrows will show here after activity.</Text> : null}
        {history.map((item) => (
          <Text key={item.id} style={styles.history}>
            <Text style={styles.rowTitle}>{eventLabel(item.eventName)}</Text>
            <Text translate={false} style={styles.lede}>{` — ${item.escrowTitle} · ${formatAmount(item.amountAtomic)} ${tokenLabel(item.tokenSymbol)}`}</Text>
            {item.explorerTx ? <Text style={styles.link} onPress={() => void Linking.openURL(item.explorerTx!)}> tx</Text> : null}
          </Text>
        ))}
        {cursor ? <Button label={loadingMore ? "Loading…" : "Load more"} tone="ghost" onPress={() => void loadMore()} busy={loadingMore} /> : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Need Help?</Text>
          <Text style={styles.lede}>Buyer funds · seller delivers proof · approve 90/10 or open a dispute.</Text>
          <Button label="How it works" tone="ghost" onPress={() => router.replace("/")} />
        </View>
        </>}
      </ScrollView>
      <AppBottomNav active="home" />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lede}>{label}</Text>
      <Text style={styles.rowTitle}>{value}</Text>
    </View>
  );
}

const styles = {
  welcome: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.22)",
    backgroundColor: "#0e1c26",
    padding: 16,
    marginBottom: 18,
    gap: 8,
  },
  eyebrow: { color: "#e8b84a", fontSize: 12, fontWeight: "700" as const, letterSpacing: 1.2, textTransform: "uppercase" as const },
  title: { color: "#e8f4f2", fontSize: 28, lineHeight: 34, fontWeight: "800" as const },
  name: { color: "#2bb8c8" },
  lede: { color: "#8aa3ad", fontSize: 15, lineHeight: 22 },
  meta: { color: "#8aa3ad", fontSize: 13 },
  actions: { gap: 8, marginTop: 6 },
  section: { color: "#e8f4f2", fontSize: 22, fontWeight: "800" as const, marginTop: 8, marginBottom: 8 },
  stats: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  stat: {
    width: "48%" as const,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1c26",
    padding: 12,
    gap: 4,
  },
  statValue: { color: "#3ecf8e", fontSize: 20, fontWeight: "800" as const },
  head: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "flex-end" as const },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1c26",
    padding: 14,
    gap: 8,
    marginTop: 12,
  },
  cardTitle: { color: "#e8f4f2", fontSize: 18, fontWeight: "700" as const },
  nameInput: {
    color: "#e8f4f2",
    backgroundColor: "#07131a",
    borderWidth: 1,
    borderColor: "#1f3440",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  row: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1c26",
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { color: "#e8f4f2", fontWeight: "700" as const, flexShrink: 1 },
  link: { color: "#3ecf8e", fontWeight: "700" as const, marginTop: 8 },
  line: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: 12 },
  history: { color: "#8aa3ad", fontSize: 14, lineHeight: 22, marginBottom: 8 },
};
