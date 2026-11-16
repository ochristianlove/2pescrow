import { Text, TextInput, useLanguage } from "../src/language";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAccount } from "@reown/appkit-react-native";
import { appKit } from "../src/appkit";
import { useAuth } from "../src/auth";
import { apiUrl, webOrigin } from "../src/config";
import { useRouter } from "expo-router";
import { api, ApiError } from "../src/api";
import { AppBottomNav } from "../src/AppBottomNav";
import { AppTopBar } from "../src/AppTopBar";
import { dollarsToAtomic, formatAmount } from "../src/format";
import { useCreationFee } from "../src/FundingBreakdown";
import { colors } from "../src/theme";
import type { TradeRow } from "../src/types";
import { Button, Field, Notice } from "../src/ui";

const deliveryPresets = [
  [72, "3 days"],
  [168, "7 days"],
  [336, "14 days"],
  [720, "30 days"],
] as const;
const protectionPresets = [
  [168, "7 days"],
  [336, "14 days"],
  [720, "30 days"],
] as const;

export default function NewTradeScreen() {
  const { user } = useAuth();
  return appKit ? <ConnectedNewTrade key={user?.id || "guest"} /> : <NewTradeForm key={user?.id || "guest"} />;
}
function ConnectedNewTrade() {
  const { address, isConnected, chainId, chain } = useAccount();
  return <NewTradeForm buyerAddress={isConnected && (chainId === "1" || chain?.id === 1) ? address : undefined} />;
}
function NewTradeForm({ buyerAddress }: { buyerAddress?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [amount, setAmount] = useState("");
  const [chain, setChain] = useState<"ethereum" | "tron">("ethereum");
  const [token, setToken] = useState<"USDT" | "USDC">("USDT");
  const [tronEnabled, setTronEnabled] = useState(false);
  const [delivery, setDelivery] = useState(72);
  const [protection, setProtection] = useState(336);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<TradeRow | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const creationFee = useCreationFee(chain);
  const draftKey = `trade-draft:${apiUrl()}:${user?.id || "guest"}`;
  const writes = useRef(Promise.resolve());
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(draftKey).then(raw => {
      if (!active || !raw) return;
      const draft = JSON.parse(raw);
      setTitle(typeof draft.title === "string" ? draft.title : "");
      setTerms(typeof draft.terms === "string" ? draft.terms : "");
      setAmount(typeof draft.amount === "string" ? draft.amount : "");
      setChain(draft.chain === "tron" ? "tron" : "ethereum");
      setToken(draft.token === "USDC" ? "USDC" : "USDT");
      setDelivery(Number.isInteger(draft.delivery) && draft.delivery >= 24 && draft.delivery <= 2160 ? draft.delivery : 72);
      setProtection(Number.isInteger(draft.protection) && draft.protection >= 24 && draft.protection <= 2160 ? draft.protection : 336);
      setRestored(true);
    }).catch(() => { if (active) setError("Could not restore your draft."); }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!draftReady || created) return;
    const draft = JSON.stringify({ title, terms, amount, chain, token, delivery, protection });
    writes.current = writes.current.then(() => AsyncStorage.setItem(draftKey, draft)).catch(() => setError("Could not save the draft on this device."));
  }, [draftReady, created, title, terms, amount, chain, token, delivery, protection, draftKey]);
  function discard() {
    Alert.alert(t("Discard draft?"), t("Your saved trade details on this device will be cleared."), [{ text: t("Keep draft"), style: "cancel" }, { text: t("Discard"), style: "destructive", onPress: () => {
      setTitle(""); setTerms(""); setAmount(""); setChain("ethereum"); setToken("USDT"); setDelivery(72); setProtection(336); setStep(1); setRestored(false); setError(null);
      writes.current = writes.current.then(() => AsyncStorage.removeItem(draftKey)).catch(() => setError("Could not clear the draft."));
    } }]);
  }

  useEffect(() => {
    api<{ tronSupportEnabled?: boolean }>("/v1/settings")
      .then((settings) => setTronEnabled(Boolean(settings.tronSupportEnabled)))
      .catch(() => {});
  }, []);

  function continueToReview() {
    if (!title.trim() || terms.trim().length < 10) {
      setError("Add a title and write the terms in at least a short paragraph.");
      return;
    }
    if (!dollarsToAtomic(amount) || dollarsToAtomic(amount) === "0") {
      setError("Enter the amount in dollars, such as 25 or 25.50.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function create() {
    const amountAtomic = dollarsToAtomic(amount);
    if (!amountAtomic || amountAtomic === "0" || lock.current) return;
    if (chain === "tron") { setError("Create TRON trades on the website with your TRON wallet. Your draft stays on this device."); return; }
    if (!buyerAddress) { setError("Connect a wallet on Ethereum mainnet using the header before creating this trade."); return; }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!user?.wallets?.some(wallet => wallet.address.toLowerCase() === buyerAddress.toLowerCase())) {
        await api("/v1/auth/link-wallet", { method: "POST", body: JSON.stringify({ address: buyerAddress, chainKind: "evm" }) });
        await refresh();
      }
      const created = await api<TradeRow>("/v1/escrows", {
        method: "POST",
        body: JSON.stringify({
          codeFlow: true,
          chain,
          buyerAddress,
          tokenSymbol: token,
          amountAtomic,
          title: title.trim(),
          description: terms.trim(),
          deliveryWindowHours: delivery,
          reviewWindowHours: protection,
        }),
      });
      setCreated(created);
      await writes.current;
      await AsyncStorage.removeItem(draftKey).catch(() => setError("Trade created, but the saved draft could not be cleared."));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the trade.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  const tokenName = chain === "tron" ? "USDT" : token;

  if (created) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppTopBar /><ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text style={styles.title}>Share this join code</Text><Text style={styles.muted}>Your trade is saved. The seller joins with this code and their account becomes the other party on the same trade.</Text>
    <Text selectable style={[styles.title, { color: colors.gold }]}>{created.tradeCode}</Text>
    {error ? <Notice text={error} /> : null}
    <Button label="Share code" tone="ghost" onPress={() => { void Share.share({ message: t("Join my 2Pescrow trade with code {code}", { code: created.tradeCode || "" }) }).catch(() => setError("Could not share the code.")); }} />
    <Button label="Open shared trade room" onPress={() => router.replace(`/trade/${created.id}`)} />
    <Button label="Go to dashboard" tone="ghost" onPress={() => router.replace("/(app)/dashboard")} />
  </ScrollView><AppBottomNav active="start" /></View>;
  if (!draftReady) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppTopBar /><Text style={styles.muted}>Loading your draft…</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <AppTopBar />
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Start a trade</Text>
            <Text style={styles.muted}>Set the deal terms, then invite the seller to join your shared trade room.</Text>
          </View>
          <Text style={styles.stepCount}>Step {step} of 2</Text>
        </View>

        <View style={styles.wizard}>
          <Text style={[styles.wizardStep, step === 1 && styles.wizardCurrent]}>1  Deal details</Text>
          <View style={styles.wizardRule} />
          <Text style={[styles.wizardStep, step === 2 && styles.wizardCurrent]}>2  Review & invite</Text>
        </View>

        {error ? <Notice text={error} /> : null}
        {restored ? <Notice tone="ok" text="Draft restored. Your changes are saved on this device." /> : null}
        {title || terms || amount ? <View style={{ marginBottom: 12 }}><Button label="Discard draft" tone="ghost" disabled={busy} onPress={discard} /></View> : null}

        {step === 1 ? (
          <View style={styles.card}>
            <Text style={styles.label}>Trade title</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Vintage camera" placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.label}>Contract terms</Text>
            <TextInput
              value={terms}
              onChangeText={setTerms}
              placeholder="What is being delivered, and what counts as fulfilment"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.terms]}
            />
            <Text style={styles.hint}>These terms stay visible to both parties in the trade room.</Text>
            <Text style={styles.label}>Settlement network</Text>
            <Choice
              selected={chain === "ethereum"}
              kicker="Ethereum"
              title="Ethereum"
              body="USDC and USDT are the token contracts on Ethereum. Funds stay on Ethereum."
              onPress={() => setChain("ethereum")}
            />
            {tronEnabled ? (
              <Choice
                selected={chain === "tron"}
                kicker="Tron"
                title="TRC-20 USDT"
                body="The buyer funds with Tron USDT. That balance stays on Tron."
                onPress={() => setChain("tron")}
              />
            ) : null}
            {chain === "ethereum" ? (
              <>
                <Text style={styles.label}>Token on Ethereum</Text>
                <Choice selected={token === "USDT"} kicker="Ethereum contract" title="USDT" body="Direct USDT contract on Ethereum. The buyer funds that contract into escrow." onPress={() => setToken("USDT")} />
                <Choice selected={token === "USDC"} kicker="Ethereum contract" title="USDC" body="Direct USDC contract on Ethereum. The buyer funds that contract into escrow." onPress={() => setToken("USDC")} />
              </>
            ) : null}
            <Text style={styles.label}>Payment amount</Text>
            <View style={styles.amount}>
              <Text style={styles.amountTag}>{tokenName}</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={styles.amountInput} />
            </View>
            <Pressable accessibilityRole="button" onPress={continueToReview} style={styles.primary}>
              <Text style={styles.primaryLabel}>Continue to review</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Deal summary</Text>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.muted}>{terms}</Text>
            <Line label="Amount" value={`${tokenName} ${amount || "0"}`} />
            <Line label="Creation fee" value={`${tokenName} ${formatAmount(creationFee.toString())}`} />
            <Line label="Wallet approval" value={`${tokenName} ${formatAmount(((dollarsToAtomic(amount || "0") ? BigInt(dollarsToAtomic(amount || "0") as string) : 0n) + creationFee).toString())} (${amount || "0"} trade + ${formatAmount(creationFee.toString())} creation fee)`} />
            <Line label="Network" value={chain === "tron" ? "Tron · TRC-20 USDT" : `Ethereum · ${token}`} />
            <Line label="Seller" value="Joins with a code after you create the trade" />
            <Text style={styles.label}>Delivery window</Text>
            <Text style={styles.hint}>Time for the seller to deliver after the escrow is funded. This is a reminder only — funds are not moved automatically.</Text>
            <View style={styles.chips}>
              {deliveryPresets.map(([hours, label]) => (
                <Chip key={hours} label={label} selected={delivery === hours} onPress={() => setDelivery(hours)} />
              ))}
            </View>
            <WindowDays label="Custom delivery window (days)" hours={delivery} onChange={setDelivery} />
            <Text style={styles.label}>Buyer protection period</Text>
            <Text style={styles.hint}>Time the buyer has to review fulfilment, release funds, or open a dispute after delivery proof.</Text>
            <View style={styles.chips}>
              {protectionPresets.map(([hours, label]) => (
                <Chip key={hours} label={label} selected={protection === hours} onPress={() => setProtection(hours)} />
              ))}
            </View>
            <WindowDays label="Custom buyer protection period (days)" hours={protection} onChange={setProtection} />
            <Text style={styles.hint}>{buyerAddress ? "Your connected Ethereum wallet will be linked to this trade." : "Connect an Ethereum wallet using the header before creating your trade."}</Text>
            {chain === "tron" ? <Button label="Create TRON trade on website" tone="ghost" onPress={() => { void Linking.openURL(`${webOrigin()}/trades/new`).catch(() => setError("Could not open the website.")); }} /> : null}
            <View style={styles.row}>
              <Pressable accessibilityRole="button" onPress={() => { setError(null); setStep(1); }} style={styles.secondary}>
                <Text style={styles.secondaryLabel}>Back to details</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void create()} style={styles.primaryFlex}>
                <Text style={styles.primaryLabel}>{busy ? "Creating invitation…" : "Create trade & get code"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Two profiles. One escrow.</Text>
          <Text style={styles.muted}>01  You create the deal and receive a private join code.</Text>
          <Text style={styles.muted}>02  The seller joins with the code. Their account is bound to this trade.</Text>
          <Text style={styles.muted}>03  Both parties share messages and fulfilment evidence, and can raise a dispute.</Text>
          <Text style={styles.cardTitle}>Funds stay on-chain</Text>
          <Text style={styles.muted}>Join, delivery, and review windows are reminders. They do not automatically release or refund the escrow.</Text>
        </View>
      </ScrollView>
      <AppBottomNav active="start" />
    </KeyboardAvoidingView>
    </View>
  );
}

function Choice({ selected, kicker, title, body, onPress }: { selected: boolean; kicker: string; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
    </Pressable>
  );
}

function WindowDays({ label, hours, onChange }: { label: string; hours: number; onChange: (hours: number) => void }) {
  const [draft, setDraft] = useState(String(hours / 24));
  useEffect(() => setDraft(String(hours / 24)), [hours]);
  return <Field label={label} accessibilityHint="Between 1 and 90 days" keyboardType="number-pad" value={draft} onChangeText={value => {
    setDraft(value);
    const days = Number(value);
    if (/^\d+$/.test(value) && days >= 1 && days <= 90) onChange(days * 24);
  }} onBlur={() => { const days = Math.max(1, Math.min(90, Math.round(Number(draft) || hours / 24))); onChange(days * 24); setDraft(String(days)); }} />;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.choiceOn]}>
      <Text style={{ color: selected ? "#3ecf8e" : "#e8f4f2", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = {
  eyebrow: { color: "#e8b84a", fontSize: 12, fontWeight: "700" as const, letterSpacing: 1.1, textTransform: "uppercase" as const },
  head: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 12, marginBottom: 12 },
  title: { color: "#e8f4f2", fontSize: 32, lineHeight: 36, fontWeight: "800" as const },
  muted: { color: "#8aa3ad", fontSize: 14, lineHeight: 21, marginTop: 4 },
  stepCount: { color: "#3ecf8e", fontWeight: "700" as const, marginTop: 8 },
  wizard: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginBottom: 12 },
  wizardStep: { color: "#8aa3ad", fontWeight: "700" as const, fontSize: 13 },
  wizardCurrent: { color: "#3ecf8e" },
  wizardRule: { flex: 1, height: 1, backgroundColor: "#1f3440" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1c26",
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  label: { color: "#8aa3ad", fontSize: 13, marginTop: 6 },
  hint: { color: "#8aa3ad", fontSize: 12, lineHeight: 18 },
  input: {
    color: "#e8f4f2",
    backgroundColor: "#07131a",
    borderWidth: 1,
    borderColor: "#1f3440",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  terms: { minHeight: 120, textAlignVertical: "top" as const },
  choice: { borderRadius: 14, borderWidth: 1, borderColor: "#1f3440", padding: 12, backgroundColor: "#07131a" },
  choiceOn: { borderColor: "rgba(62, 207, 142, 0.7)", backgroundColor: "rgba(62, 207, 142, 0.08)" },
  cardTitle: { color: "#e8f4f2", fontSize: 18, fontWeight: "700" as const },
  amount: { flexDirection: "row" as const, alignItems: "center" as const, borderWidth: 1, borderColor: "#1f3440", borderRadius: 10, backgroundColor: "#07131a" },
  amountTag: { color: "#e8b84a", fontWeight: "700" as const, paddingHorizontal: 12 },
  amountInput: { flex: 1, color: "#e8f4f2", paddingVertical: 12, fontSize: 16 },
  primary: { backgroundColor: "#3ecf8e", borderRadius: 12, minHeight: 46, alignItems: "center" as const, justifyContent: "center" as const, marginTop: 8 },
  primaryFlex: { flex: 1, backgroundColor: "#3ecf8e", borderRadius: 12, minHeight: 46, alignItems: "center" as const, justifyContent: "center" as const },
  primaryLabel: { color: "#04130d", fontWeight: "700" as const, textAlign: "center" as const },
  secondary: { borderRadius: 12, minHeight: 46, alignItems: "center" as const, justifyContent: "center" as const, borderWidth: 1, borderColor: "rgba(232, 184, 74, 0.45)", paddingHorizontal: 12 },
  secondaryLabel: { color: "#e8b84a", fontWeight: "700" as const },
  row: { flexDirection: "row" as const, gap: 8, marginTop: 8 },
  chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: "#1f3440", paddingHorizontal: 12, paddingVertical: 8 },
  line: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: 12 },
  lineValue: { color: "#e8f4f2", fontWeight: "700" as const, flexShrink: 1, textAlign: "right" as const },
};
