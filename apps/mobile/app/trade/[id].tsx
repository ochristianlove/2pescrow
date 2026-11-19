import { Text } from "../../src/language";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Linking, Platform, RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { webOrigin } from "../../src/config";
import { useLiveNotifications } from "../../src/liveNotifications";
import { colors } from "../../src/theme";
import type { TradeRow } from "../../src/types";
import { Button, Field, Notice } from "../../src/ui";
import { tradePermissions } from "../../src/tradePresentation";
import { TradeRoom } from "../../src/TradeRoom";
import { EvidenceComposer } from "../../src/TradeFiles";
import { TradeWallet } from "../../src/TradeWallet";
import { LogoLoader } from "../../src/LogoLoader";

export default function TradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { trackEscrowId, notifications, subscribeTradeEvents } = useLiveNotifications();
  const seenNotice = useRef("");
  const [trade, setTrade] = useState<TradeRow | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const actionLock = useRef(false);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await api<TradeRow>(`/v1/escrows/${encodeURIComponent(id)}`);
      if (request === generation.current) { setTrade(result); setError(null); }
    } catch (err) {
      if (request === generation.current) setError(err instanceof ApiError ? err.message : "Could not refresh this trade. Pull down to try again.");
    }
  }, [id, user?.id]);
  useEffect(() => { setTrade(null); setMessage(""); if (id) trackEscrowId(id); }, [id, user?.id, trackEscrowId]);
  useEffect(() => {
    const latest = notifications.find((item) => item.escrowId === id);
    if (!latest || latest.id === seenNotice.current) return;
    seenNotice.current = latest.id;
    void load();
  }, [notifications, id, load]);
  useEffect(() => {
    return subscribeTradeEvents((eventEscrowId) => {
      if (!eventEscrowId || eventEscrowId === id) {
        void load();
      }
    });
  }, [id, load, subscribeTradeEvents]);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === "active" && !actionLock.current) void load(); }, 4000);
    const listener = AppState.addEventListener("change", state => { if (state === "active" && !actionLock.current) void load(); });
    return () => { generation.current++; clearInterval(timer); listener.remove(); };
  }, [load]));
  const permission = trade ? tradePermissions(trade, user?.id) : null;
  async function openWeb() {
    try { await Linking.openURL(`${webOrigin()}/trades/${encodeURIComponent(id)}`); }
    catch { setError("Could not open the website. Please try again."); }
  }
  async function send() {
    if (!message.trim() || !permission?.canPost || actionLock.current) return;
    actionLock.current = true; setBusy("message"); setError(null);
    try {
      await api(`/v1/escrows/${id}/messages`, { method: "POST", body: JSON.stringify({ body: message.trim() }) });
      setMessage(""); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not send your message. Your text is saved here; try again."); }
    finally { actionLock.current = false; setBusy(null); }
  }
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <AppTopBar />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}>
        <Button label="Back to trades" tone="ghost" onPress={() => router.replace("/(app)/trades")} />
        {error ? <View style={{ marginTop: 16 }}><Notice text={error} /><Button label="Try again" tone="ghost" onPress={() => void load()} /></View> : null}
        {!trade || !permission ? (!error && <LogoLoader message="Loading trade room…" />) :
          <TradeRoom trade={trade} userId={user?.id} onWeb={() => void openWeb()} onError={setError} onChanged={load}
            wallet={<TradeWallet trade={trade} onLinked={load} />}
            composer={permission.canPost ? <View style={{ marginTop: 16, gap: 10 }}>
              <Field label="Message" value={message} editable={!busy} maxLength={4000} onChangeText={setMessage} placeholder="Write to the other person" multiline />
              <Button label="Send message" onPress={() => void send()} busy={busy === "message"} disabled={!message.trim() || Boolean(busy)} />
              {permission.party ? <EvidenceComposer trade={trade} seller={permission.seller} disabled={Boolean(busy)} onBusy={value => { actionLock.current = value; setBusy(value ? "file" : null); }} onUploaded={load} /> : null}
            </View> : <Text style={{ color: colors.muted, marginTop: 16 }}>{user ? "Only trade participants can send messages." : "Sign in with your trade account to send messages."}</Text>} />}
      </ScrollView>
    </KeyboardAvoidingView>
    <AppBottomNav active="escrows" />
  </View>;
}
