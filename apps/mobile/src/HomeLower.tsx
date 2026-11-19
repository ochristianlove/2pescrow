import { Text, TextInput, useLanguage } from "./language";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import { webOrigin } from "./config";
import { breakable } from "./format";
import type { FaqItem, ReferralView } from "./types";
import { readableLabel, statusColor } from "./tradePresentation";

type Note = { id: string; slug: string; title: string; excerpt?: string | null; publishedAt?: string | null };
type LedgerRow = { id: string; title: string; status: string };
type ActivityRow = { id: string; eventName: string; escrow?: { title?: string | null } | null };
type SocialSettings = { telegramUrl?: string | null; xUrl?: string | null; discordUrl?: string | null };

const moves = [
  ["01", "Write the deal", "Amount, token, chain, and the wallet you already know. You leave with a code, not a public listing."],
  ["02", "Hand them the code", "They see the terms you wrote, including the wallet already lodged, and lock in their own address before the trade closes."],
  ["03", "Fund only when both are in", "The buyer deposits USDT. Release pays the seller 90% and the protocol 10%. A dispute keeps the coins in the contract until it is decided."],
] as const;

function eventLabel(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function HomeLower() {
  const { language, t } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const [socials, setSocials] = useState<SocialSettings | null>(null);
  const [referral, setReferral] = useState<ReferralView | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralBusy, setReferralBusy] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicName, setPublicName] = useState("");
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [liveNote, setLiveNote] = useState<string | null>(null);

  const loadReferral = useCallback(async () => {
    if (!user) {
      setReferral(null);
      setReferralError(null);
      return;
    }
    try {
      setReferral(await api<ReferralView>("/v1/me/referral"));
      setReferralError(null);
    } catch (err) {
      setReferral(null);
      setReferralError(err instanceof ApiError ? err.message : "Could not load your referral link.");
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    api<SocialSettings>("/v1/settings")
      .then((value) => {
        if (!cancelled) setSocials(value);
      })
      .catch(() => {});
    api<FaqItem[]>("/v1/faq")
      .then((rows) => {
        if (!cancelled) setFaq(rows.slice(0, 3));
      })
      .catch(() => {});
    api<Note[]>("/v1/blog?limit=6")
      .then((rows) => {
        if (!cancelled) setNotes(rows.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    Promise.all([api<LedgerRow[]>("/v1/escrows"), api<ActivityRow[]>("/v1/activity")])
      .then(([rows, events]) => {
        if (cancelled) return;
        setLedger(rows.slice(0, 4));
        setActivity(events.slice(0, 6));
        setLiveNote(null);
      })
      .catch(() => {
        if (!cancelled) setLiveNote("Live activity is temporarily unavailable. Please try again shortly.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadReferral();
  }, [loadReferral]);

  useEffect(() => {
    setPublicName((current) => current || user?.displayName?.trim() || user?.email?.trim() || "");
  }, [user]);

  async function createLink() {
    setReferralBusy(true);
    setReferralError(null);
    try {
      const created = await api<{ referralUrl: string }>("/v1/referral/register", {
        method: "POST",
        body: JSON.stringify({ displayName: publicName.trim() || undefined }),
      });
      setReferral({ enrolled: true, referralUrl: created.referralUrl });
    } catch (err) {
      setReferralError(err instanceof ApiError ? err.message : "Could not create your referral link.");
    } finally {
      setReferralBusy(false);
    }
  }

  async function shareLink() {
    const url = referral?.referralUrl;
    if (!url) return;
    setShareNote(null);
    try {
      await Share.share({ message: url });
    } catch {
      setShareNote("Copy the link, then paste it into the chat or app you use.");
    }
  }

  async function copyLink() {
    const url = referral?.referralUrl;
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
  }

  const rooms = [
    { label: "Telegram", hint: "Short questions and trade-day updates", href: socials?.telegramUrl?.trim() || "https://t.me/" },
    { label: "X", hint: "What just shipped", href: socials?.xUrl?.trim() || "https://x.com/" },
    { label: "Discord", hint: "Longer threads with other traders", href: socials?.discordUrl?.trim() || "https://discord.com/" },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Three moves. Then the chain does the holding.</Text>
      {moves.map(([index, title, body]) => (
        <View key={index} style={styles.card}>
          <Text style={styles.index}>{index}</Text>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      ))}

      <Text style={styles.kicker}>Community</Text>
      <Text style={styles.sectionTitle}>Ask in the room you already use.</Text>
      <Text style={styles.body}>Telegram for a fast answer, Discord when the thread needs room, X when we ship something. None of these move funds.</Text>
      {rooms.map((room) => (
        <Pressable key={room.label} accessibilityRole="link" onPress={() => void Linking.openURL(room.href)} style={styles.card}>
          <Text style={styles.cardTitle}>{room.label}</Text>
          <Text style={styles.body}>{room.hint}</Text>
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>Send someone here. Earn 2%.</Text>
      <Text style={styles.body}>When a trade from your link finishes, you earn 2% of the platform fee. Copy the link and share it. Payouts stay on your referral page.</Text>
      <Pressable onPress={() => router.push(user ? "/(app)/referrals" : "/sign-in")}>
        <Text style={styles.link}>Open the referral page</Text>
      </Pressable>
      {!user ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/sign-in")} style={styles.primary}>
          <Text style={styles.primaryLabel}>Get my link</Text>
        </Pressable>
      ) : null}
      {user && !referral && !referralError ? <Text style={styles.body}>Loading your link…</Text> : null}
      {referralError ? <Text style={styles.error}>{referralError}</Text> : null}
      {user && referral && !referral.enrolled ? (
        <>
          <Text style={styles.fieldLabel}>Public name (optional)</Text>
          <TextInput
            value={publicName}
            onChangeText={setPublicName}
            placeholder="Christian"
            placeholderTextColor="#8aa3ad"
            autoCapitalize="words"
            style={styles.field}
          />
          <Pressable accessibilityRole="button" disabled={referralBusy} onPress={() => void createLink()} style={styles.primary}>
            <Text style={styles.primaryLabel}>{referralBusy ? "Creating link…" : "Create my link"}</Text>
          </Pressable>
        </>
      ) : null}
      {user && referral?.enrolled && referral.referralUrl ? (
        <View style={styles.linkBox}>
          <Text style={styles.fieldLabel}>Your link</Text>
          <Text style={styles.field}>{breakable(referral.referralUrl)}</Text>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={() => void copyLink()} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>{copied ? "Link copied" : "Copy link"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void shareLink()} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>Share</Text>
            </Pressable>
          </View>
          {shareNote ? <Text style={styles.body}>{shareNote}</Text> : null}
        </View>
      ) : null}

      <View style={styles.headRow}>
        <Text style={styles.sectionTitle}>FAQ</Text>
      </View>
      {faq.map((item) => {
        const open = openFaq === item.id;
        return (
          <Pressable key={item.id} onPress={() => setOpenFaq(open ? null : item.id)} style={styles.card}>
            <Text style={styles.cardTitle}>{item.question}</Text>
            {open ? <Text style={styles.body}>{item.answer}</Text> : null}
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/faq")} style={styles.secondary}>
        <Text style={styles.secondaryLabel}>Load more</Text>
      </Pressable>

      <View style={styles.headRow}>
        <Text style={styles.sectionTitle}>Field notes</Text>
        <Pressable onPress={() => void Linking.openURL(`${webOrigin()}/blog`)}>
          <Text style={styles.link}>All notes</Text>
        </Pressable>
      </View>
      {notes.length === 0 ? <Text style={styles.body}>Notes land here after they are published from the admin desk.</Text> : null}
      {notes.map((post) => (
        <Pressable key={post.id} onPress={() => void Linking.openURL(`${webOrigin()}/blog/${post.slug}`)} style={styles.card}>
          {post.publishedAt ? <Text style={styles.meta}>{new Date(post.publishedAt).toLocaleDateString(language, { month: "short", day: "numeric", year: "numeric" })}</Text> : null}
          <Text style={styles.cardTitle}>{post.title}</Text>
          {post.excerpt ? <Text style={styles.body}>{post.excerpt}</Text> : null}
        </Pressable>
      ))}

      <View style={styles.headRow}>
        <Text style={styles.sectionTitle}>Latest on the ledger</Text>
        <Pressable onPress={() => router.push("/(app)/ledger")}>
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>
      {liveNote ? <Text style={styles.body}>{liveNote}</Text> : null}
      {ledger.length === 0 && !liveNote ? <Text style={styles.body}>No trades yet. The first one will show up here.</Text> : null}
      {ledger.map((row) => (
        <Pressable key={row.id} onPress={() => router.push(`/trade/${row.id}`)} style={styles.rowCard}>
          <Text translate={false} style={styles.cardTitle}>{row.title}</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: `${statusColor(row.status)}22`,
              borderWidth: 1,
              borderColor: `${statusColor(row.status)}55`,
              marginTop: 4,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor(row.status) }} />
            <Text style={{ color: statusColor(row.status), fontWeight: "700", fontSize: 12 }}>
              {readableLabel(row.status)}
            </Text>
          </View>
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>What just happened</Text>
      {activity.length === 0 && !liveNote ? <Text style={styles.body}>Deposits, proofs, and releases show up in this list.</Text> : null}
      {activity.map((item) => (
        <Text key={item.id} style={styles.activity}>
          <Text style={styles.cardTitle}>{eventLabel(item.eventName)}</Text>
          {item.escrow?.title ? <Text translate={false} style={styles.body}>{` — ${item.escrow.title}`}</Text> : null}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 28 },
  sectionTitle: { color: "#e8f4f2", fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.4, marginTop: 8 },
  kicker: { color: "#3ecf8e", fontSize: 12, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", marginTop: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1c26",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  index: { color: "#e8b84a", fontSize: 22, fontWeight: "800", marginBottom: 6 },
  cardTitle: { color: "#e8f4f2", fontSize: 16, fontWeight: "700" },
  body: { color: "#8aa3ad", fontSize: 14, lineHeight: 21, marginTop: 4 },
  link: { color: "#3ecf8e", fontSize: 15, fontWeight: "700" },
  primary: { backgroundColor: "#3ecf8e", borderRadius: 12, minHeight: 46, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: "#04130d", fontWeight: "700", fontSize: 16 },
  secondary: {
    borderRadius: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(232, 184, 74, 0.45)",
    paddingHorizontal: 14,
  },
  secondaryLabel: { color: "#e8b84a", fontWeight: "700" },
  error: { color: "#ffb4b4", lineHeight: 20 },
  linkBox: { gap: 8 },
  fieldLabel: { color: "#8aa3ad", fontSize: 13 },
  field: {
    color: "#e8f4f2",
    backgroundColor: "#07131a",
    borderWidth: 1,
    borderColor: "#1f3440",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: "row", gap: 8 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 },
  meta: { color: "#8aa3ad", fontSize: 12, marginBottom: 4 },
  rowCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1c26",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  activity: { color: "#8aa3ad", fontSize: 14, lineHeight: 21 },
});
