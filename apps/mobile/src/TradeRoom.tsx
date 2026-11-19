import { Text, useLanguage } from "./language";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { api } from "./api";
import { formatAmount, shortAddr, tokenLabel } from "./format";
import { dateLabel, plainTerms, readableLabel, statusColor, tradeActivity, tradePermissions } from "./tradePresentation";
import { colors } from "./theme";
import type { TradeRow } from "./types";
import { Button, Card } from "./ui";
import { downloadTradeAgreement, MessageFile } from "./TradeFiles";
import { TradeActions } from "./TradeActions";
import { TradeRoleTags } from "./TradeRoleTags";

export function TradeRoom({ trade, userId, onWeb, onError, onChanged, composer, wallet }: {
  trade: TradeRow; userId?: string; onWeb: () => void; onError: (message: string) => void; onChanged: () => Promise<void>; composer?: ReactNode; wallet?: ReactNode;
}) {
  const { t, language } = useLanguage();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadLock = useRef(false);
  const date = (value?: string | null) => dateLabel(value, language);
  const permission = tradePermissions(trade, userId);
  const activity = tradeActivity(trade);
  const terms = plainTerms(trade.description || "");
  const canDownload = Boolean(trade.tradeCode && (permission.buyer || permission.seller || trade.partyRole === "admin"));
  const canDownloadSigned = Boolean(canDownload && trade.buyerUserId && trade.sellerUserId && trade.contractAddress && (permission.buyer || permission.seller));
  async function downloadAgreement() {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setDownloading(true);
    try {
      await downloadTradeAgreement(trade.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not create the agreement record");
    } finally {
      downloadLock.current = false;
      setDownloading(false);
    }
  }
  return <>
    <Text translate={false} style={s.title} accessibilityRole="header">{trade.title}</Text>
    <TradeRoleTags
      buyer={trade.buyerUser?.displayName || (trade.buyerAddress ? shortAddr(trade.buyerAddress) : "")}
      seller={trade.sellerUser?.displayName || (trade.sellerAddress ? shortAddr(trade.sellerAddress) : "")}
    />
    <View style={s.meta}><Text style={s.amount}>{formatAmount(trade.amountAtomic)} {tokenLabel(trade.tokenSymbol)}</Text><Text style={s.muted}>{trade.chain === "tron" ? "Tron" : "Ethereum"}</Text></View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10 }}>
      <View style={{
        backgroundColor: `${statusColor(trade.status)}22`,
        borderColor: `${statusColor(trade.status)}55`,
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: statusColor(trade.status) }} />
        <Text style={{ color: statusColor(trade.status), fontWeight: "700", fontSize: 13 }}>
          {readableLabel(trade.status)}
        </Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {permission.buyer ? `· ${t("You are the buyer")}` : permission.seller ? `· ${t("You are the seller")}` : ""}
      </Text>
    </View>
    <TradeProgress status={trade.status} />
    {trade.tradeCode && permission.buyer && !trade.sellerUserId ? <Card>
      <Text style={s.heading}>Invite the seller</Text><Text style={s.muted}>Share this private code so the seller can join your trade.</Text>
      <Text selectable style={s.code}>{trade.tradeCode}</Text>
      <Button label="Share join code" tone="ghost" onPress={() => { void Share.share({ message: t("Join my 2Pescrow trade with code {code}", { code: trade.tradeCode || "" }) }).catch(() => onError("Could not share the code. Select and copy it above.")); }} />
    </Card> : null}
    <Card>
      <Text style={s.heading}>Deal summary</Text>
      {terms ? <Text translate={false} selectable numberOfLines={summaryOpen ? undefined : 4} style={s.body}>{terms}</Text> : null}
      {terms ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: summaryOpen }} onPress={() => setSummaryOpen((open) => !open)} style={s.more}>
          <Text style={s.moreLabel}>{summaryOpen ? "View less" : "View more"}</Text>
        </Pressable>
      ) : null}
      <Detail userContent label="buyer" value={trade.buyerUser?.displayName || shortAddr(trade.buyerAddress)} />
      <Detail userContent label="seller" value={trade.sellerUser?.displayName || (trade.sellerUserId ? t("Joined") : trade.sellerAddress ? shortAddr(trade.sellerAddress) : t("Waiting for seller"))} />
      {trade.deliveryWindowHours ? <Detail label="Delivery window" value={t("{count} days after funding", { count: trade.deliveryWindowHours / 24 })} /> : null}
      {trade.reviewWindowHours ? <Detail label="Buyer protection period" value={t("{count} days after delivery proof", { count: trade.reviewWindowHours / 24 })} /> : null}
      {([["Seller joins by", trade.joinDeadlineAt], ["Fund by", trade.fundDeadlineAt], ["Delivery due", trade.deliveryDeadlineAt], ["Review ends", trade.reviewDeadlineAt]] as const).map(([label, value]) => value ? <Detail key={label} label={label} value={date(value)} /> : null)}
      {trade.contractAddress ? (
        <View style={s.detail}>
          <Text style={s.muted}>{t("Escrow contract")}</Text>
          <Text selectable style={s.body}>{trade.contractAddress}</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              const url = trade.chain === "tron"
                ? `https://tronscan.org/#/address/${trade.contractAddress}`
                : `https://etherscan.io/address/${trade.contractAddress}`;
              void Linking.openURL(url);
            }}
            style={{ marginTop: 4, alignSelf: "flex-start" }}
          >
            <Text style={s.linkText}>{t("View escrow contract on explorer")} ↗</Text>
          </Pressable>
        </View>
      ) : null}
      {trade.createTxHash ? (
        <View style={s.detail}>
          <Text style={s.muted}>{t("Deployment transaction")}</Text>
          <Text selectable style={s.body}>{trade.createTxHash}</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              const url = trade.chain === "tron"
                ? `https://tronscan.org/#/transaction/${trade.createTxHash}`
                : `https://etherscan.io/tx/${trade.createTxHash}`;
              void Linking.openURL(url);
            }}
            style={{ marginTop: 4, alignSelf: "flex-start" }}
          >
            <Text style={s.linkText}>{t("View deployment transaction")} ↗</Text>
          </Pressable>
        </View>
      ) : null}
      {trade.proofHash ? <Detail label="Delivery proof" value={trade.proofHash} /> : null}
      {trade.tradeCode ? <Text style={s.note}>Windows are reminders. They do not automatically release or refund funds.</Text> : null}
      {canDownloadSigned ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Button label={downloading ? "Preparing agreement…" : "Download signed agreement PDF"} tone="ghost" busy={downloading} onPress={() => void downloadAgreement()} />
          <Text style={s.note}>Includes the agreed terms, linked wallets, on-chain escrow reference, and a public verification link. It does not include private chat or evidence.</Text>
        </View>
      ) : null}
    </Card>
    {trade.tradeCode ? <WalletLinkStatus trade={trade} /> : null}
    {wallet}
    <Card>
      <View style={s.activityHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.heading}>{trade.tradeCode ? "Shared activity" : "Events"}</Text>
          {trade.tradeCode ? <Text style={s.muted}>Messages, photos, and documents stay with this trade.</Text> : null}
        </View>
      </View>
      {canDownload ? <Button label={downloading ? "Preparing agreement…" : "Download agreement PDF"} tone="ghost" busy={downloading} onPress={() => void downloadAgreement()} /> : null}
      {activity.map(item => item.type === "event" ? <View key={item.key} style={s.event}>
        <Text style={s.body}>{readableLabel(item.event.eventName)}</Text><Text style={s.note}>{date(item.at)}</Text>
        {item.event.txHash ? <Text selectable style={s.note}>Transaction {item.event.txHash}</Text> : null}
      </View> : <View key={item.key} style={[s.message, item.message.authorUserId === userId && { borderColor: colors.accent }]}>
        <Text translate={false} style={s.author}>{item.message.kind === "system" ? "2Pescrow" : item.message.kind === "admin" ? t("Dispute staff") : item.message.authorUserId === userId ? t("You") : item.message.authorUserId === trade.buyerUserId ? trade.buyerUser?.displayName || t("Buyer") : item.message.authorUserId === trade.sellerUserId ? trade.sellerUser?.displayName || t("Seller") : t("Participant")}</Text>
        {item.message.body ? <Text translate={item.message.kind === "system"} selectable style={s.body}>{item.message.body}</Text> : null}
        {item.message.fileName ? <MessageFile tradeId={trade.id} message={item.message} /> : null}
        <Text style={s.note}>{date(item.at)}</Text>
      </View>)}
      {activity.length === 0 ? <Text style={[s.body, { marginTop: 16 }]}>Nothing shared yet. Messages and trade updates will appear here.</Text> : null}
      {trade.tradeCode ? composer : null}
      {permission.party ? <View style={s.nextStep}><Text style={s.note}>Next step</Text><Text style={s.body}>{nextStep(trade, permission.buyer)}</Text></View> : null}
      {permission.party ? <TradeActions trade={trade} userId={userId} onChanged={onChanged} onError={onError} onWeb={onWeb} /> : null}
      {trade.tradeCode ? <LeaveFeedback /> : null}
    </Card>
    {(trade.disputes ?? []).map(dispute => <Card key={dispute.id}>
      <Text style={s.heading}>Dispute case file</Text><Text style={s.status}>{readableLabel(dispute.status)}</Text>
      {dispute.openedBy ? <Detail label="Opened by" value={dispute.openedBy.includes("@") ? dispute.openedBy : shortAddr(dispute.openedBy)} /> : null}
      {dispute.createdAt ? <Detail label="Opened" value={date(dispute.createdAt)} /> : null}
      {dispute.rulingNote ? <Detail userContent label="Ruling" value={dispute.rulingNote} /> : null}
      {dispute.resolution ? <Detail userContent label="Resolution" value={dispute.resolution} /> : null}
      {dispute.appealDeadlineAt ? <Detail label="Appeal deadline" value={date(dispute.appealDeadlineAt)} /> : null}
      {dispute.appeal ? <Detail userContent label={t("Appeal · {status}", { status: t(readableLabel(dispute.appeal.status)) })} value={dispute.appeal.decisionNote || dispute.appeal.reason || t("Awaiting a decision")} /> : null}
      {(dispute.evidence ?? []).map(evidence => <Detail userContent key={evidence.id} label={evidence.fileName || "Evidence"} value={evidence.note || date(evidence.createdAt)} />)}
      <Button label="View dispute on website" tone="ghost" onPress={onWeb} />
    </Card>)}
  </>;
}
function WalletLinkStatus({ trade }: { trade: TradeRow }) {
  const buyerLinked = Boolean(trade.buyerAddress);
  const sellerLinked = Boolean(trade.sellerAddress);
  const sellerLabel = sellerLinked ? "Linked" : trade.sellerUserId ? "Awaiting link" : "Not linked";
  return (
    <Card>
      <Text style={s.heading}>Wallets for this trade</Text>
      <Text style={s.muted}>Trade wallets are set only when a party connects and confirms “Link my wallet”. Disconnecting does not remove a trade wallet.</Text>
      <WalletRow label="Buyer" state={buyerLinked ? "Linked" : "Not linked"} linked={buyerLinked} address={trade.buyerAddress} />
      <WalletRow label="Seller" state={sellerLabel} linked={sellerLinked} address={trade.sellerAddress} />
      {trade.buyerUserId && trade.sellerUserId && !sellerLinked ? (
        <Text style={s.note}>The seller has joined but has not linked a receiving wallet yet. Funding stays disabled until they confirm a wallet in this room.</Text>
      ) : null}
    </Card>
  );
}

function WalletRow({ label, state, linked, address }: { label: string; state: string; linked: boolean; address?: string | null }) {
  const color = linked ? colors.accent : colors.gold;
  return (
    <View style={s.walletRow}>
      <View style={s.walletHead}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.body}>{label}</Text>
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
        <Text style={[s.walletState, { color }]}>{state}</Text>
        <Text translate={false} selectable style={s.note}>{address ? shortAddr(address) : "—"}</Text>
      </View>
    </View>
  );
}

function LeaveFeedback() {
  const [links, setLinks] = useState<{ id: string; label: string; href: string }[]>([
    { id: "x", label: "X", href: "https://x.com/" },
    { id: "discord", label: "Discord", href: "https://discord.com/" },
    { id: "telegram", label: "Telegram", href: "https://t.me/" },
  ]);
  useEffect(() => {
    let cancelled = false;
    api<{ xUrl?: string | null; discordUrl?: string | null; telegramUrl?: string | null }>("/v1/settings")
      .then((settings) => {
        if (cancelled) return;
        setLinks([
          { id: "x", label: "X", href: settings.xUrl?.trim() || "https://x.com/" },
          { id: "discord", label: "Discord", href: settings.discordUrl?.trim() || "https://discord.com/" },
          { id: "telegram", label: "Telegram", href: settings.telegramUrl?.trim() || "https://t.me/" },
        ]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <View style={s.feedback}>
      <Text style={s.muted}>Leave feedback</Text>
      <View style={s.feedbackLinks}>
        {links.map((link) => (
          <Pressable key={link.id} accessibilityRole="link" accessibilityLabel={link.label} onPress={() => void Linking.openURL(link.href)} style={s.feedbackLink}>
            <Text style={s.feedbackLabel}>{link.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function nextStep(trade: TradeRow, buyer: boolean) {
  switch (trade.status) {
    case "AwaitingSeller": return buyer ? "Invite the seller using your join code. Funding becomes available once they join and link their receiving wallet." : "The seller needs to join before this trade can be funded.";
    case "Created": case "AwaitingFunding": return buyer ? "Check the seller and receiving wallet, then fund the escrow using the agreed token and network." : "Wait for the buyer to fund the escrow before delivering.";
    case "Funded": return buyer ? "Funds are in escrow. Wait for the seller to deliver and share evidence here." : "Deliver according to the agreed terms, share evidence in this room, then confirm fulfilment.";
    case "InProgress": return buyer ? "Review the delivery and evidence. Release funds when the agreed terms are met, or raise a dispute if there is a problem." : "Fulfilment has been submitted. The buyer can review the delivery and release funds.";
    case "Disputed": return "A dispute is active. Keep evidence in this room and review the case details and any appeal deadline below.";
    case "Completed": case "Resolved": return "This trade has finished. The agreement and shared activity remain available for your records.";
    case "Cancelled": return "This trade was cancelled. Its shared activity remains available for your records.";
    default: return "Review the shared activity for the latest trade updates.";
  }
}
function Detail({ label, value, userContent = false }: { label: string; value: string; userContent?: boolean }) {
  return <View style={s.detail}><Text style={s.muted}>{label}</Text><Text translate={!userContent} selectable style={s.body}>{value}</Text></View>;
}
function TradeProgress({ status }: { status: string }) {
  const active =
    status === "AwaitingSeller" ? 0
    : ["Created", "AwaitingFunding"].includes(status) ? 1
    : ["Funded", "InProgress"].includes(status) ? 2
    : ["Completed", "Resolved"].includes(status) ? 4
    : -1;
  const isCancelled = status === "Cancelled";
  const isDisputed = status === "Disputed";
  const activeColor = isDisputed ? colors.danger : isCancelled ? colors.muted : statusColor(status);

  return (
    <View style={s.steps}>
      {["Seller joins", "Buyer funds escrow", "Proof / delivery", "Released"].map((label, index) => {
        const isCompletedStep = index <= active && !isCancelled && !isDisputed;
        const isCurrentStep = index === active;
        const borderColor = isCompletedStep ? activeColor : colors.line;
        const textColor = isCompletedStep ? activeColor : colors.muted;
        return (
          <View key={label} style={s.step}>
            <Text style={[s.stepNumber, { borderColor, color: textColor }]}>
              {index + 1}
            </Text>
            <Text style={[s.stepLabel, isCurrentStep && { color: colors.text, fontWeight: "600" }]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 24, fontWeight: "700", lineHeight: 31, marginTop: 20, marginBottom: 8 },
  heading: { color: colors.text, fontSize: 19, fontWeight: "700", marginBottom: 10 }, body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 }, meta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  amount: { color: colors.gold, fontSize: 18, fontWeight: "700" }, status: { color: colors.accent, marginVertical: 10, fontSize: 14 },
  code: { color: colors.text, fontSize: 24, fontWeight: "700", marginVertical: 14, letterSpacing: 2 },
  detail: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, gap: 4 }, note: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8 },
  event: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line },
  message: { padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, marginTop: 12, backgroundColor: colors.bg }, author: { color: colors.accent, fontSize: 12, marginBottom: 6, fontWeight: "700" },
  more: { marginTop: 8, marginBottom: 4, alignSelf: "flex-start" },
  moreLabel: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  activityHead: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  walletRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  walletHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  walletState: { fontSize: 14, fontWeight: "700" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nextStep: { marginTop: 16, gap: 4 },
  feedback: { marginTop: 18, gap: 8 },
  feedbackLinks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  feedbackLink: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  feedbackLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  linkText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginVertical: 16 }, step: { width: "47%", flexDirection: "row", alignItems: "center", gap: 8 },
  stepNumber: { color: colors.muted, borderWidth: 1, borderColor: colors.line, borderRadius: 16, width: 30, height: 30, textAlign: "center", textAlignVertical: "center" }, stepLabel: { color: colors.muted, fontSize: 12, flex: 1, lineHeight: 18 },
});
