import fs from "fs";
import { buildTradeRecordPdf } from "../src/tradeRecord";

const terms = [
  "<h2>What is being delivered</h2>",
  "<p>A tested camera, packed in the original box. The seller marks the parcel <b>fragile</b>.</p>",
  "<h3>Acceptance</h3>",
  "<ul><li>The camera powers on</li><li>There are no cracks in the body</li></ul>",
  "<p>Questions go to <a href=\"https://example.com/help\">the help desk</a> before the review window ends.</p>",
].join("");

const pdf = buildTradeRecordPdf({
  recordId: "preview",
  verifyUrl: "http://localhost:3003/verify/preview",
  snapshotHash: "abc123",
  snapshot: {
    title: "Vintage camera",
    terms,
    amount: "100.00",
    token: "USDT",
    network: "Ethereum (ERC-20 USDT)",
    createdAt: "2026-10-30T00:00:00.000Z",
    issuedAt: "2026-10-30T00:00:00.000Z",
    status: "Created",
    parties: {
      buyer: { name: "Buyer", wallet: "0x0000000000000000000000000000000000000001" },
      seller: { name: "Seller", wallet: "0x0000000000000000000000000000000000000002" },
    },
    contractAddress: "Not deployed yet",
    transactions: [],
  },
});

const text = pdf.toString("latin1");
const shown = [...text.matchAll(/\((?:\\.|[^)\\])*\)/g)].map((match) => match[0].slice(1, -1).replace(/\\([()\\])/g, "$1"));
console.log(shown.join("\n"));
console.log("---");
console.log("has raw tag", /<h[1-3]|<\/p>|<b>|<a /.test(shown.join("\n")));
fs.writeFileSync(new URL("./preview-terms.pdf", import.meta.url), pdf);
