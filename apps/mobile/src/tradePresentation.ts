import type { TradeRow } from "./types";

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

export function tradeActivity(trade: TradeRow) {
  const events = (trade.events ?? []).filter(event => !event.eventName.startsWith("DeadlineReminder:"))
    .map(event => ({ type: "event" as const, key: `event:${event.id}`, at: event.createdAt, event }));
  const messages = (trade.messages ?? []).map(message => ({ type: "message" as const, key: `message:${message.id}`, at: message.createdAt, message }));
  return [...events, ...messages].sort((a, b) => {
    const time = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
    return time(a.at) - time(b.at) || a.key.localeCompare(b.key);
  });
}
