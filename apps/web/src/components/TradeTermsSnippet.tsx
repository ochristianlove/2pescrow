import { plainText } from "./blogBody";

const DEFAULT_MAX = 220;

function truncateTerms(text: string, max: number) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 48 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

/** Plain-text preview of trade terms — for detail headers, not full contract HTML. */
export function TradeTermsSnippet({
  text,
  maxLength = DEFAULT_MAX,
  empty,
}: {
  text?: string | null;
  maxLength?: number;
  empty?: string;
}) {
  const full = plainText(text || "").trim();
  if (!full) {
    return empty ? <p className="muted trade-terms-snippet">{empty}</p> : null;
  }
  const shown = full.length <= maxLength ? full : truncateTerms(full, maxLength);
  return <p className="muted trade-terms-snippet">{shown}</p>;
}
