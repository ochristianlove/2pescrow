import { Text, useLanguage } from "../../src/language";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { breakable, formatAmount, shortAddr } from "../../src/format";
import { colors } from "../../src/theme";
import { Button, Field, Notice } from "../../src/ui";

const PAYOUT_MIN_ATOMIC = 20_000_000n;

type PayoutRequestRow = {
  id: string;
  amountAtomic: string;
  payoutAddress: string;
  payoutChain: string;
  status: string;
  createdAt: string;
  adminNote?: string | null;
};

type ReferralProfile = {
  enrolled: boolean;
  referralUrl?: string;
  tier?: string;
  successfulReferrals?: number;
  totalEarnedAtomic?: string;
  pendingBalanceAtomic?: string;
  totalPaidAtomic?: string;
  commissionRatePercent?: number;
  referredTradeVolumeAtomic?: string;
  payoutRequests?: PayoutRequestRow[];
  notifications?: { id: string; message: string; createdAt: string }[];
  referees?: { email: string | null; joinedAt: string }[];
};

type AgentView = {
  enrolled: boolean;
  displayName: string | null;
  payoutAddress: string | null;
  payoutChain: string | null;
  commissionRatePercent: number;
  usesDefaultRate: boolean;
  coolingOffEndsAt: string | null;
  coolingOffActive: boolean;
  finalizedCaseCount: number;
  minFinalizedCases: number;
  payableAtomic: string;
  payoutRequests: { id: string; amountAtomic: string; status: string; createdAt: string }[];
};

function tierLabel(tier: string | undefined) {
  if (tier === "silver") return "Silver";
  if (tier === "gold") return "Gold";
  if (tier === "platinum") return "Platinum";
  return "Bronze";
}

function chainLabel(chain: string) {
  if (chain === "tron") return "Tron";
  if (chain === "ethereum") return "Ethereum";
  return "Earlier EVM";
}

export default function ReferralsScreen() {
  const { language, t } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [payoutChain, setPayoutChain] = useState<"ethereum" | "tron">("ethereum");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentChain, setAgentChain] = useState<"ethereum" | "tron">("ethereum");
  const [agentAddress, setAgentAddress] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await api<ReferralProfile>("/v1/me/referral");
    setProfile(next);
    if (user?.role === "agent") {
      setAgent(await api<AgentView>("/v1/me/agent-commission"));
    } else {
      setAgent(null);
    }
  }, [user?.role]);

  useFocusEffect(useCallback(() => {
    void load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load payouts."));
  }, [load]));

  useEffect(() => {
    if (!user || profile?.enrolled) return;
    setDisplayName((current) => current || user.displayName?.trim() || user.email?.trim() || "");
  }, [user, profile?.enrolled]);

  useEffect(() => {
    if (!user || agent?.enrolled) return;
    setAgentName((current) => current || user.displayName?.trim() || "");
  }, [user, agent?.enrolled]);

  const pendingAtomic = profile?.pendingBalanceAtomic || "0";
  let pendingBig = 0n;
  try {
    pendingBig = BigInt(pendingAtomic);
  } catch {
    pendingBig = 0n;
  }
  const meetsMinimum = pendingBig >= PAYOUT_MIN_ATOMIC;
  const hasPending = (profile?.payoutRequests || []).some((row) => row.status === "pending");

  async function enroll() {
    setBusy("enroll");
    setError(null);
    try {
      await api("/v1/referral/register", {
        method: "POST",
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
      });
      setNote("You're in. Share your link below.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your referral link.");
    } finally {
      setBusy(null);
    }
  }

  async function submitPayout() {
    setBusy("payout");
    setError(null);
    try {
      await api("/v1/me/referral/payout-requests", {
        method: "POST",
        body: JSON.stringify({
          amountAtomic: pendingAtomic,
          payoutAddress: payoutAddress.trim(),
          payoutChain,
        }),
      });
      setPayoutAddress("");
      setNote("Payout request submitted. We will review and send funds to your wallet.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit the payout request.");
    } finally {
      setBusy(null);
    }
  }

  async function enrollAgent() {
    setBusy("agent");
    setError(null);
    try {
      setAgent(await api<AgentView>("/v1/me/agent-commission/enroll", {
        method: "POST",
        body: JSON.stringify({ displayName: agentName.trim(), payoutAddress: agentAddress.trim(), payoutChain: agentChain }),
      }));
      setNote("Commission is on. The first 7 days do not pay, and the rate stays at the platform default until an admin changes it.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not opt into case commission.");
    } finally {
      setBusy(null);
    }
  }

  async function requestAgentPayout() {
    setBusy("agent-payout");
    setError(null);
    try {
      setAgent(await api<AgentView>("/v1/me/agent-commission/payout-requests", { method: "POST" }));
      setNote("Payout request submitted. An admin sends it to the wallet you confirmed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request the case payout.");
    } finally {
      setBusy(null);
    }
  }

  function useSavedWallet(address: string) {
    setPayoutAddress(address);
    setPayoutChain(address.startsWith("T") ? "tron" : "ethereum");
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppTopBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>
        <Text style={styles.eyebrow}>Earn with 2Pescrow</Text>
        <Text style={styles.title}>Refer traders. Earn 2% of platform profit.</Text>
        <Text style={styles.muted}>Share your personal link. When someone you referred completes a successful escrow, you earn 2% of the fee. No wallet is needed to track the balance.</Text>
        {error ? <Notice text={error} /> : null}
        {note ? <Notice text={note} tone="ok" /> : null}

        {user?.role === "agent" && agent ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Dispute agent commission</Text>
            <Text style={styles.cardTitle}>Case commission</Text>
            <Text style={styles.muted}>
              This is separate from referral earnings. The default is 0.5% of the platform fee on a case, paid only after the on-chain dispute payout is final. You need {agent.minFinalizedCases} finalized cases and at least $20 before cash-out.
            </Text>
            <Line label="Finalized cases" value={String(agent.finalizedCaseCount)} />
            <Line label="Your rate" value={agent.enrolled ? `${agent.commissionRatePercent}%${agent.usesDefaultRate ? ` ${t("(platform default)")}` : ""}` : "Not opted in"} />
            {!agent.enrolled ? (
              <>
                <Text style={styles.muted}>Opt in with the name you want on this profile and the wallet that should receive payouts. You cannot choose the rate.</Text>
                <Field label="Name on the commission profile" value={agentName} onChangeText={setAgentName} />
                <Text style={styles.label}>Network</Text>
                <View style={styles.choiceRow}>
                  <Choice label="Ethereum" selected={agentChain === "ethereum"} onPress={() => setAgentChain("ethereum")} />
                  <Choice label="Tron" selected={agentChain === "tron"} onPress={() => setAgentChain("tron")} />
                </View>
                <Field label="Payout wallet address" autoCapitalize="none" autoCorrect={false} value={agentAddress} onChangeText={setAgentAddress} placeholder={agentChain === "tron" ? "T…" : "0x…"} />
                <Button label="Opt into case commission" onPress={() => void enrollAgent()} busy={busy === "agent"} />
              </>
            ) : (
              <>
                <Line label="Name" value={agent.displayName || "—"} />
                <Line label="Payout wallet" value={agent.payoutAddress || "—"} />
                <Line label="Payable balance" value={formatAmount(agent.payableAtomic)} />
                {agent.coolingOffActive && agent.coolingOffEndsAt ? <Line label="Cooling-off until" value={new Date(agent.coolingOffEndsAt).toLocaleString(language)} /> : null}
                <Text style={styles.muted}>
                  {agent.coolingOffActive ? "Cases finalized before the cooling-off ends are not paid." : "Cases finalized from now on can accrue if you are not a party on that trade."}
                </Text>
                <Button label="Request payout of the payable balance" onPress={() => void requestAgentPayout()} busy={busy === "agent-payout"} />
                {agent.payoutRequests[0] ? (
                  <Text style={styles.muted}>Latest request: {agent.payoutRequests[0].status} · {formatAmount(agent.payoutRequests[0].amountAtomic)}</Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {!profile?.enrolled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Become a referrer</Text>
            <Field label="Public name (optional)" value={displayName} onChangeText={setDisplayName} placeholder="Christian" autoCapitalize="words" />
            <Button label="Get my referral link" onPress={() => void enroll()} busy={busy === "enroll"} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your link</Text>
            <Text style={styles.linkText}>{breakable(profile.referralUrl)}</Text>
            <Button
              label={copied ? "Link copied" : "Copy link"}
              tone="ghost"
              onPress={() => {
                if (!profile.referralUrl) return;
                void Clipboard.setStringAsync(profile.referralUrl).then(() => setCopied(true));
              }}
            />
            <Button label="Back to dashboard" tone="ghost" onPress={() => router.push("/(app)/dashboard")} />
            <Line label="Status tier" value={tierLabel(profile.tier)} />
            <Line label="Signups via your link" value={String(profile.referees?.length ?? 0)} />
            <Line label="Successful referral trades" value={String(profile.successfulReferrals ?? 0)} />
            <Line
              label="Conversion rate"
              value={(profile.referees?.length ?? 0) > 0 ? `${Math.round(((profile.successfulReferrals ?? 0) / (profile.referees?.length || 1)) * 100)}%` : "—"}
            />
            <Line label="Referred trade volume" value={formatAmount(profile.referredTradeVolumeAtomic || "0")} />
            <Line label="Commission rate" value={`${profile.commissionRatePercent ?? 2}% of platform profit`} />
            <Line label="Total earned" value={formatAmount(profile.totalEarnedAtomic || "0")} />
            <Line label="Pending payout" value={formatAmount(profile.pendingBalanceAtomic || "0")} />
            <Line label="Paid out" value={formatAmount(profile.totalPaidAtomic || "0")} />

            <Text style={styles.cardTitle}>Request payout</Text>
            <Text style={styles.notice}>To request a withdrawal, your pending referral balance must be $20.00 or above.</Text>
            <Text style={styles.muted}>Submit your Ethereum wallet (0x…). The phone site pays the full pending balance, and only one request can be open at a time.</Text>
            {pendingBig <= 0n ? (
              <Text style={styles.muted}>No balance available for payout yet.</Text>
            ) : !meetsMinimum ? (
              <Text style={styles.muted}>Minimum payout is $20.00. Your pending balance is below that threshold.</Text>
            ) : hasPending ? (
              <Text style={styles.muted}>You have a payout request awaiting admin review.</Text>
            ) : (
              <>
                <Text style={styles.label}>Network</Text>
                <Text style={styles.value}>{payoutChain === "tron" ? "Tron (TRC-20 USDT)" : "Ethereum (ERC-20 USDT)"}</Text>
                <Field
                  label="Payout wallet address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={payoutAddress}
                  onChangeText={setPayoutAddress}
                  placeholder={payoutChain === "tron" ? "T…" : "0x…"}
                />
                {(user?.wallets?.length ?? 0) > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.muted}>Use a wallet saved on your profile:</Text>
                    {user?.wallets?.map((wallet) => (
                      <Button key={wallet.address} label={shortAddr(wallet.address)} tone="ghost" onPress={() => useSavedWallet(wallet.address)} />
                    ))}
                  </View>
                ) : null}
                <Text style={styles.muted}>Amount: {formatAmount(pendingAtomic)} (full pending balance)</Text>
                <Button label="Submit payout request" onPress={() => void submitPayout()} busy={busy === "payout"} />
              </>
            )}

            {(profile.payoutRequests || []).length > 0 ? (
              <>
                <Text style={styles.cardTitle}>Payout history</Text>
                {profile.payoutRequests?.map((row) => (
                  <Text key={row.id} style={styles.item}>
                    {formatAmount(row.amountAtomic)} → {row.payoutAddress} ({chainLabel(row.payoutChain)}) · {row.status}
                    {row.adminNote ? ` — ${row.adminNote}` : ""} · {new Date(row.createdAt).toLocaleString(language)}
                  </Text>
                ))}
              </>
            ) : null}
          </View>
        )}

        {profile?.enrolled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your referees</Text>
            {(profile.referees || []).length === 0 ? <Text style={styles.muted}>No one has registered via your link yet.</Text> : null}
            {profile.referees?.map((row, index) => (
              <Text key={`${row.email}-${index}`} style={styles.item}>{row.email || "User"} · joined {new Date(row.joinedAt).toLocaleDateString(language)}</Text>
            ))}
            <Text style={styles.cardTitle}>Notifications</Text>
            {(profile.notifications || []).length === 0 ? <Text style={styles.muted}>Commission alerts appear here.</Text> : null}
            {profile.notifications?.map((row) => (
              <Text key={row.id} style={styles.item}>{row.message} · {new Date(row.createdAt).toLocaleString(language)}</Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <AppBottomNav />
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Text style={[styles.choiceLabel, selected && { color: colors.primaryFg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = {
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: "700" as const, letterSpacing: 1.2, textTransform: "uppercase" as const },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800" as const },
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 14, gap: 8 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" as const, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  notice: { color: colors.gold, fontSize: 14, lineHeight: 20 },
  label: { color: colors.muted, fontSize: 13 },
  value: { color: colors.text, fontWeight: "700" as const, flexShrink: 1 },
  linkText: { color: colors.text, lineHeight: 20 },
  line: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: 12 },
  item: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  choiceRow: { flexDirection: "row" as const, gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceLabel: { color: colors.text, fontWeight: "700" as const },
};
