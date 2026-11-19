import { Text } from "../../src/language";
import { useAccount, useAppKit } from "@reown/appkit-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Share, Switch, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { walletConnectReady } from "../../src/appkit";
import { useAuth } from "../../src/auth";
import { LegalSheet, WalletAgreement, type LegalDoc } from "../../src/LegalSheet";
import { breakable, shortAddr } from "../../src/format";
import { useLiveNotifications } from "../../src/liveNotifications";
import { type SoundTone, getSavedSoundTone, saveSoundTone, playTradeBell } from "../../src/notificationSound";
import { colors } from "../../src/theme";
import type { ReferralView } from "../../src/types";
import { Button, Card, Field, Notice } from "../../src/ui";

function WalletConnectLink({ onAddress }: { onAddress: (address: string) => Promise<void> }) {
  const { open, disconnect } = useAppKit();
  const { address, isConnected } = useAccount();
  const sent = useRef("");
  const [legal, setLegal] = useState<LegalDoc | null>(null);

  useEffect(() => {
    if (!isConnected || !address || sent.current === address) return;
    sent.current = address;
    void onAddress(address).catch(() => {
      sent.current = "";
    });
  }, [address, isConnected, onAddress]);

  return (
    <View style={{ marginBottom: 12 }}>
      <Button
        label={isConnected && address ? `Connected ${shortAddr(address)}` : "Connect with WalletConnect"}
        onPress={() => open({ view: "Connect" })}
      />
      <Text style={{ color: colors.muted, marginTop: 8, marginBottom: 8, lineHeight: 20 }}>
        Opens WalletConnect. Choose MetaMask and approve. The address is linked to this account.
      </Text>
      <WalletAgreement onOpen={setLegal} />
      {legal ? <LegalSheet key={legal} doc={legal} onClose={() => setLegal(null)} /> : null}
      {isConnected ? <Button label="Disconnect WalletConnect" tone="ghost" onPress={() => { sent.current = ""; void disconnect(); }} /> : null}
    </View>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const { user, refresh, signOut } = useAuth();
  const { soundEnabled, setSoundEnabled } = useLiveNotifications();
  const [soundTone, setSoundTone] = useState<SoundTone>("subtle");

  useEffect(() => {
    void getSavedSoundTone().then(setSoundTone);
  }, []);
  const [name, setName] = useState(user?.displayName || "");
  const [publicName, setPublicName] = useState(user?.displayName || "");
  const [wallet, setWallet] = useState("");
  const [referral, setReferral] = useState<ReferralView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [legal, setLegal] = useState<LegalDoc | null>(null);
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);

  const loadReferral = useCallback(async () => {
    try {
      setReferral(await api<ReferralView>("/v1/me/referral"));
    } catch {
      setReferral(null);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadReferral();
    let cancelled = false;
    void api<{ feedbackEnabled?: boolean }>("/v1/settings")
      .then((settings) => {
        if (!cancelled) setFeedbackEnabled(Boolean(settings.feedbackEnabled));
      })
      .catch(() => {
        if (!cancelled) setFeedbackEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadReferral]));

  async function saveName() {
    setBusy("name");
    setError(null);
    try {
      await api("/v1/me/profile", { method: "PATCH", body: JSON.stringify({ displayName: name.trim() }) });
      await refresh();
      setNote("Name saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the name.");
    } finally {
      setBusy(null);
    }
  }

  const linkConnectedAddress = useCallback(async (address: string) => {
    setBusy("wallet");
    setError(null);
    try {
      await api("/v1/auth/link-wallet", { method: "POST", body: JSON.stringify({ address, chainKind: "evm" }) });
      await refresh();
      setNote("Wallet linked to this account. Funding still has to be signed in the wallet.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not link that address.");
      throw err;
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  async function linkWallet() {
    setBusy("wallet");
    setError(null);
    try {
      await api("/v1/auth/link-wallet", { method: "POST", body: JSON.stringify({ address: wallet.trim() }) });
      setWallet("");
      await refresh();
      setNote("Wallet linked to this account. Funding still has to be signed in the wallet.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not link that address.");
    } finally {
      setBusy(null);
    }
  }

  async function enroll() {
    setBusy("referral");
    setError(null);
    try {
      await api("/v1/referral/register", {
        method: "POST",
        body: JSON.stringify({ displayName: publicName.trim() || undefined }),
      });
      await loadReferral();
      setNote("Referral link is ready.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create a referral link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <AppTopBar />
    <ScrollView style={{ backgroundColor: colors.bg, flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700", width: "100%" }}>{breakable(user?.displayName || user?.email || "Account")}</Text>
      <Text style={{ color: colors.muted, marginTop: 4, marginBottom: 16, width: "100%" }}>{breakable(user?.email)}</Text>
      {error ? <Notice text={error} /> : null}
      {note ? <Notice text={note} tone="ok" /> : null}
      <Field label="Display name" value={name} onChangeText={setName} />
      <Button label="Save name" onPress={() => void saveName()} busy={busy === "name"} />
      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Wallets</Text>
        {(user?.wallets || []).length === 0 ? <Text style={{ color: colors.muted, marginBottom: 8 }}>None linked yet.</Text> : user?.wallets?.map((item) => (
          <Text key={item.address} style={{ color: colors.gold, marginBottom: 6 }}>{shortAddr(item.address)} · {item.chainKind || "wallet"}</Text>
        ))}
        {walletConnectReady ? (
          <WalletConnectLink onAddress={linkConnectedAddress} />
        ) : (
          <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 20 }}>
            WalletConnect is not configured. Set EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID from dashboard.reown.com.
          </Text>
        )}
        <Field label="Wallet address" autoCapitalize="none" autoCorrect={false} value={wallet} onChangeText={setWallet} placeholder="0x… or Tron address" />
        <Button label="Link wallet" tone="ghost" onPress={() => void linkWallet()} busy={busy === "wallet"} />
      </Card>
      {feedbackEnabled ? (
        <Card>
          <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>Feedback</Text>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 18, marginBottom: 8 }}>Send feedback</Text>
          <Text style={{ color: colors.muted, lineHeight: 20, marginBottom: 12 }}>Report bugs, suggest improvements, or tell us how the trade room feels on your device.</Text>
          <Button label="Open feedback form" tone="ghost" onPress={() => router.push("/(app)/feedback")} />
        </Card>
      ) : null}
      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Live alerts</Text>
        <Pressable onPress={() => setSoundEnabled(!soundEnabled)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Switch
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            trackColor={{ false: colors.line, true: "#1f6b4a" }}
            thumbColor={soundEnabled ? colors.accent : colors.muted}
          />
          <Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>
            Play an alert sound when trades update (wallet linked, new phase, messages).
          </Text>
        </Pressable>
        {soundEnabled ? (
          <View style={{ marginTop: 10, marginBottom: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 8 }}>Alert sound tone</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["subtle", "ping", "bell"] as const).map((tone) => {
                const isSelected = soundTone === tone;
                return (
                  <Pressable
                    key={tone}
                    accessibilityRole="button"
                    onPress={() => {
                      setSoundTone(tone);
                      void saveSoundTone(tone);
                      void playTradeBell(tone);
                    }}
                    style={{
                      backgroundColor: isSelected ? "rgba(62, 207, 142, 0.16)" : "rgba(255, 255, 255, 0.04)",
                      borderColor: isSelected ? colors.accent : colors.line,
                      borderWidth: 1,
                      borderRadius: 8,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text style={{ color: isSelected ? colors.accent : colors.text, fontWeight: "600", fontSize: 13 }}>
                      {tone === "subtle" ? "Subtle Chime (Web)" : tone === "ping" ? "Soft Ping" : "Classic Bell"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <Text style={{ color: colors.muted, lineHeight: 20 }}>Use the bell icon in the header on any page to review recent alerts.</Text>
      </Card>
      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Referral</Text>
        {referral?.enrolled && referral.referralUrl ? (
          <>
            <Text style={{ color: colors.muted, marginBottom: 8 }}>You earn 2% of the platform fee when someone you referred finishes a trade.</Text>
            <Text style={{ color: colors.text, marginBottom: 10, width: "100%" }}>{breakable(referral.referralUrl)}</Text>
            <Button label="Share link" tone="ghost" onPress={() => void Share.share({ message: referral.referralUrl || "" })} />
            <Button label="Payouts & cash out" tone="ghost" onPress={() => router.push("/(app)/referrals")} />
          </>
        ) : (
          <>
            <Field label="Public name (optional)" value={publicName} onChangeText={setPublicName} placeholder="Christian" autoCapitalize="words" />
            <Button label="Get my referral link" tone="ghost" onPress={() => void enroll()} busy={busy === "referral"} />
          </>
        )}
      </Card>
      <Button label="Privacy policy" tone="ghost" onPress={() => setLegal("privacy")} />
      {legal ? <LegalSheet key={legal} doc={legal} onClose={() => setLegal(null)} /> : null}
      <View style={{ height: 10 }} />
      <Button label="Sign out" tone="danger" onPress={() => void signOut()} />
      </ScrollView>
    <AppBottomNav active="profile" />
    </View>
  );
}
