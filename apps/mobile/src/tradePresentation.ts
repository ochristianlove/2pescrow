import type { TradeDispute, TradeRow } from "./types";

export function readableLabel(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_:]+/g, " ");
}

// Terms arrive as editor HTML on the web and as plain text from native.
export function plainTerms(value: string = "") {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>|<\/div>|<\/h[1-6]>|<\/li>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }).replace(/\n{3,}/g, "\n\n").trim();
}

export function dateLabel(value?: string | null, language?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString(language, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function tradePermissions(trade: TradeRow, userId?: string) {
  const buyer = Boolean(userId && (trade.buyerUserId === userId || trade.partyRole === "buyer"));
  const seller = Boolean(userId && (trade.sellerUserId === userId || trade.partyRole === "seller"));
  const party = buyer || seller;
  return { buyer, seller, party, canPost: Boolean(trade.tradeCode) && (party || Boolean(userId && trade.partyRole === "admin" && trade.status === "Disputed" && trade.disputes?.some(d => d.status === "open"))),
    canConfirm: seller && Boolean(trade.tradeCode && trade.contractAddress) && trade.status === "Funded" };
}

const ACTIVE_DISPUTE_STATUSES = new Set(["open", "ruled_pending_appeal", "appealed", "appeal_decided", "final_ruling"]);

function openedByActor(dispute: TradeDispute, userId?: string, email?: string | null) {
  if (!userId) return false;
  if (dispute.openedByUserId) return dispute.openedByUserId === userId;
  return dispute.openedBy === (email || userId);
}

export function disputeEligible(trade: TradeRow, chainState?: number | null) {
  if (trade.chain === "tron") {
    return trade.status === "Funded" || trade.status === "InProgress" || chainState === 1 || chainState === 2 || chainState === 5;
  }
  if (trade.status === "Funded" || trade.status === "InProgress" || trade.status === "Completed") return true;
  if (!trade.contractAddress) return false;
  if (chainState != null && chainState >= 1 && chainState <= 2) return true;
  return trade.status === "Created" || trade.status === "AwaitingFunding";
}

export function tradeDisputeAccess(trade: TradeRow, userId?: string, email?: string | null, chainState?: number | null) {
  const disputes = trade.disputes ?? [];
  const openDispute = disputes.find((item) => item.status === "open");
  const hasActiveDispute = disputes.some((item) => ACTIVE_DISPUTE_STATUSES.has(item.status));
  const hasUsedDisputeOpening = Boolean(userId && disputes.some((item) => openedByActor(item, userId, email)));
  const isDisputeOpener = Boolean(openDispute && openedByActor(openDispute, userId, email));
  const { buyer, seller } = tradePermissions(trade, userId);
  const party = buyer || seller;
  const canOpen = Boolean(
    userId
    && party
    && trade.tradeCode
    && !hasActiveDispute
    && !hasUsedDisputeOpening
    && trade.status !== "Disputed"
    && !["Cancelled", "Resolved"].includes(trade.status)
    && disputeEligible(trade, chainState),
  );
  const canWithdraw = Boolean(
    userId
    && party
    && trade.tradeCode
    && openDispute
    && openDispute.buyerFavor == null
    && isDisputeOpener,
  );
  const frozen = Boolean(
    openDispute && (
      chainState === 5
      || (trade.events ?? []).some((event) => event.eventName === "DisputeFreezeConfirmed" && event.payload?.disputeId === openDispute.id)
    ),
  );
  return { openDispute, hasActiveDispute, hasUsedDisputeOpening, isDisputeOpener, canOpen, canWithdraw, frozen, party };
}

export function buyerFundingPending(trade: TradeRow, isBuyer: boolean, chainState?: number | null) {
  if (!isBuyer || !trade.tradeCode || !trade.sellerUserId) return false;
  if (["Funded", "InProgress", "Completed", "Resolved", "Cancelled", "Disputed"].includes(trade.status)) return false;
  if (chainState != null && chainState > 0) return false;
  return true;
}

export function tradeActivity(trade: TradeRow) {
  const events = (trade.events ?? []).filter(event => !event.eventName.startsWith("DeadlineReminder:"))
    .map(event => ({ type: "event" as const, key: `event:${event.id}`, at: event.createdAt, event }));
  const messages = (trade.messages ?? []).map(message => ({ type: "message" as const, key: `message:${message.id}`, at: message.createdAt, message }));
  return [...events, ...messages].sort((a, b) => {
    const time = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
    return time(a.at) - time(b.at) || a.key.localeCompare(b.key);
  });
}

export function statusColor(status: string): string {
  switch (status) {
    case "Created":
      return "#7dd3fc";
    case "AwaitingSeller":
      return "#c4b5fd";
    case "AwaitingFunding":
      return "#fde047";
    case "Funded":
      return "#fde047";
    case "InProgress":
      return "#fdba74";
    case "Completed":
    case "Resolved":
      return "#3ecf8e";
    case "Cancelled":
      return "#8aa3ad";
    case "Disputed":
      return "#f87171";
    default:
      return "#8aa3ad";
  }
}
