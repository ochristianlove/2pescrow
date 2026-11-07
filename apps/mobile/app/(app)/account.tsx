import { useCallback, useState } from "react";
import { Linking, ScrollView, Share, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "../../src/api";
import { useAuth } from "../../src/auth";
import { apiUrl, privacyUrl } from "../../src/config";
import { shortAddr } from "../../src/format";
import { colors } from "../../src/theme";
import type { ReferralView } from "../../src/types";
import { Button, Card, Field, Notice } from "../../src/ui";

export default function AccountScreen() {
  const { user, refresh, signOut } = useAuth();
  const [name, setName] = useState(user?.displayName || "");
  const [wallet, setWallet] = useState("");
  const [referral, setReferral] = useState<ReferralView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadReferral = useCallback(async () => {
    try {
      setReferral(await api<ReferralView>("/v1/me/referral"));
    } catch {
      setReferral(null);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadReferral(); }, [loadReferral]));

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
      await api("/v1/referral/register", { method: "POST", body: JSON.stringify({}) });
      await loadReferral();
      setNote("Referral link is ready.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create a referral link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{user?.displayName || user?.email || "Account"}</Text>
      <Text style={{ color: colors.muted, marginTop: 4, marginBottom: 16 }}>{user?.email}</Text>
      {error ? <Notice text={error} /> : null}
      {note ? <Notice text={note} tone="ok" /> : null}
      <Field label="Display name" value={name} onChangeText={setName} />
      <Button label="Save name" onPress={() => void saveName()} busy={busy === "name"} />
      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Wallets</Text>
        {(user?.wallets || []).length === 0 ? <Text style={{ color: colors.muted, marginBottom: 8 }}>None linked yet.</Text> : user?.wallets?.map((item) => (
          <Text key={item.address} style={{ color: colors.gold, marginBottom: 6 }}>{shortAddr(item.address)} · {item.chainKind || "wallet"}</Text>
        ))}
        <Field label="Wallet address" autoCapitalize="none" autoCorrect={false} value={wallet} onChangeText={setWallet} placeholder="0x… or Tron address" />
        <Button label="Link wallet" tone="ghost" onPress={() => void linkWallet()} busy={busy === "wallet"} />
      </Card>
      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Referral</Text>
        {referral?.enrolled && referral.referralUrl ? (
          <>
            <Text style={{ color: colors.muted, marginBottom: 8 }}>You earn 2% of the platform fee when someone you referred finishes a trade.</Text>
            <Text style={{ color: colors.text, marginBottom: 10 }}>{referral.referralUrl}</Text>
            <Button label="Share link" tone="ghost" onPress={() => void Share.share({ message: referral.referralUrl || "" })} />
          </>
        ) : (
          <Button label="Get my referral link" tone="ghost" onPress={() => void enroll()} busy={busy === "referral"} />
        )}
      </Card>
      <Button label="Privacy policy" tone="ghost" onPress={() => void Linking.openURL(privacyUrl())} />
      <View style={{ height: 10 }} />
      <Button label="Sign out" tone="danger" onPress={() => void signOut()} />
      <Text style={{ color: colors.muted, marginTop: 18, fontSize: 12 }}>API {apiUrl()}</Text>
    </ScrollView>
  );
}
