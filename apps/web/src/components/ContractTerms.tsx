import { BlogRichText } from "./BlogRichText";
import { plainText } from "./blogBody";

export function ContractTerms({ text, empty }: { text?: string | null; empty: string }) {
  if (!plainText(text || "")) return <p className="muted">{empty}</p>;
  return (
    <div className="contract-terms">
      <BlogRichText body={text || ""} />
    </div>
  );
}
