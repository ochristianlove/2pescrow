import crypto from "crypto";
import zlib from "zlib";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

export function hashTradeSnapshot(snapshot: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

export function signTradeSnapshot(recordId: string, snapshotHash: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`2pescrow-trade-record:${recordId}:${snapshotHash}`).digest("hex");
}

function pdfSafe(value: unknown) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/[\\()]/g, "\\$&");
}

function wrap(text: string, width = 86): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > width) {
      if (line) result.push(line);
      line = "";
      for (let i = 0; i < word.length; i += width) result.push(word.slice(i, i + width));
    } else if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else { result.push(line); line = word; }
  }
  if (line) result.push(line);
  return result;
}

type StyledRun = { text: string; bold: boolean };
type PdfItem =
  | { kind: "section"; text: string }
  | { kind: "term-heading"; level: 1 | 2 | 3; text: string }
  | { kind: "text"; runs: StyledRun[] }
  | { kind: "gap" };

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => fromCodePoint(parseInt(hex, 16)));
}

function fromCodePoint(code: number) {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
  return String.fromCodePoint(code);
}

function compactRuns(runs: StyledRun[]) {
  const compacted: StyledRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = compacted[compacted.length - 1];
    if (last && last.bold === run.bold) last.text += run.text;
    else compacted.push({ ...run });
  }
  return compacted;
}

function blankRuns(runs: StyledRun[]) {
  return !runs.some((run) => run.text.trim());
}

function wrapRuns(runs: StyledRun[], width: number): StyledRun[][] {
  const lines: StyledRun[][] = [];
  let line: StyledRun[] = [];
  let length = 0;
  const commit = () => {
    if (!line.length) return;
    lines.push(line);
    line = [];
    length = 0;
  };
  const addWord = (word: string, bold: boolean) => {
    if (/^[.,;:!?)]+$/.test(word) && line.length) {
      const last = line[line.length - 1];
      if (last && last.bold === bold) last.text += word;
      else line.push({ text: word, bold });
      length += word.length;
      return;
    }
    if (word.length > width) {
      commit();
      for (let i = 0; i < word.length; i += width) lines.push([{ text: word.slice(i, i + width), bold }]);
      return;
    }
    if (length > 0 && length + word.length + 1 > width) commit();
    const spacer = length === 0 ? "" : " ";
    const last = line[line.length - 1];
    if (last && last.bold === bold) last.text += spacer + word;
    else line.push({ text: spacer + word, bold });
    length += spacer.length + word.length;
  };
  for (const run of runs) {
    for (const word of run.text.split(/\s+/)) {
      if (word) addWord(word, run.bold);
    }
  }
  commit();
  return lines;
}

/** Turns saved contract HTML into PDF lines. The stored snapshot keeps the original HTML. */
function layoutTerms(raw: string): PdfItem[] {
  const source = String(raw ?? "").trim();
  if (!source) return [];
  if (!/<[a-z!/]/i.test(source)) {
    return source.split(/\n\s*\n/).flatMap((paragraph, index) => {
      const text = paragraph.replace(/\s*\n\s*/g, " ").trim();
      if (!text) return [];
      const lines = wrapRuns([{ text, bold: false }], 92).map((runs) => ({ kind: "text" as const, runs }));
      return index === 0 ? lines : [{ kind: "gap" as const }, ...lines];
    });
  }

  const items: PdfItem[] = [];
  let runs: StyledRun[] = [];
  let bold = false;
  let role: "p" | "h1" | "h2" | "h3" | "li" = "p";
  let listKind: "ul" | "ol" | null = null;
  let olCount = 0;
  let skipUntil: string | null = null;
  let linkHref: string | null = null;

  const flush = () => {
    const compacted = compactRuns(runs);
    runs = [];
    if (blankRuns(compacted)) return;
    if (role === "h1" || role === "h2" || role === "h3") {
      const text = compacted.map((run) => run.text).join("").replace(/\s+/g, " ").trim();
      if (!text) return;
      const level = role === "h1" ? 1 : role === "h2" ? 2 : 3;
      const width = level === 1 ? 62 : level === 2 ? 68 : 74;
      items.push({ kind: "gap" });
      for (const line of wrap(text, width)) items.push({ kind: "term-heading", level, text: line });
      items.push({ kind: "gap" });
      return;
    }
    let next = compacted;
    if (role === "li") {
      const marker = listKind === "ol" ? `${++olCount}. ` : "- ";
      next = [{ text: marker, bold: false }, ...compacted];
    } else if (items.length && items[items.length - 1].kind === "text") {
      items.push({ kind: "gap" });
    }
    for (const line of wrapRuns(next, role === "li" ? 88 : 92)) items.push({ kind: "text", runs: line });
  };

  const tokens = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(source))) {
    if (match[3] !== undefined) {
      if (skipUntil) continue;
      const text = decodeEntities(match[3]).replace(/[ \t\f\v]+/g, " ").replace(/\n+/g, " ");
      if (!text) continue;
      const last = runs[runs.length - 1];
      if (last && last.bold === bold) last.text += text;
      else runs.push({ text, bold });
      continue;
    }
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    const attrs = match[2] || "";
    if (skipUntil) {
      if (closing && tag === skipUntil) skipUntil = null;
      continue;
    }
    if (!closing && (tag === "script" || tag === "style")) {
      skipUntil = tag;
      continue;
    }
    if (tag === "br") {
      flush();
      continue;
    }
    if (tag === "strong" || tag === "b") {
      bold = !closing;
      continue;
    }
    if (tag === "a") {
      if (!closing) {
        const href = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        linkHref = decodeEntities(href?.[1] || href?.[2] || "").trim();
      } else if (linkHref) {
        const visible = runs.map((run) => run.text).join("").trim();
        if (visible !== linkHref && !visible.endsWith(linkHref)) {
          const last = runs[runs.length - 1];
          const suffix = ` (${linkHref})`;
          if (last) last.text += suffix;
          else runs.push({ text: linkHref, bold: false });
        }
        linkHref = null;
      }
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      flush();
      if (!closing) {
        listKind = tag;
        if (tag === "ol") olCount = 0;
      } else listKind = null;
      continue;
    }
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "p" || tag === "div" || tag === "li" || tag === "blockquote") {
      if (!closing) {
        flush();
        role = tag === "div" || tag === "blockquote" ? "p" : tag;
      } else {
        flush();
        role = "p";
      }
      continue;
    }
    if (tag === "tr" && closing) {
      flush();
      continue;
    }
    if ((tag === "td" || tag === "th") && !closing && runs.some((run) => run.text.trim())) {
      const last = runs[runs.length - 1];
      if (last && !last.text.endsWith(" ")) last.text += " | ";
    }
  }
  flush();
  while (items[0]?.kind === "gap") items.shift();
  while (items[items.length - 1]?.kind === "gap") items.pop();
  const spaced: PdfItem[] = [];
  for (const item of items) {
    if (item.kind === "gap" && spaced[spaced.length - 1]?.kind === "gap") continue;
    spaced.push(item);
  }
  return spaced;
}

const PDF_BODY_FONT_SIZE = 9;
const PDF_BODY_LINE_LEADING = 14;
const PDF_GAP_HEIGHT = 10;
const PDF_SECTION_HEIGHT = 26;
const PDF_HEADING_LEADING = [1, 22, 20, 18] as const;

function itemHeight(item: PdfItem) {
  if (item.kind === "gap") return PDF_GAP_HEIGHT;
  if (item.kind === "section") return PDF_SECTION_HEIGHT;
  if (item.kind === "term-heading") return PDF_HEADING_LEADING[item.level];
  return PDF_BODY_LINE_LEADING;
}

function textBaseline(y: number, height: number) {
  const ascent = PDF_BODY_FONT_SIZE + 2;
  return y - (height - ascent);
}

function drawItem(item: PdfItem, y: number) {
  if (item.kind === "gap") return [`% gap`];
  if (item.kind === "section") {
    return [
      "0.05 0.52 0.57 rg",
      `BT /F2 11 Tf 48 ${y} Td (${pdfSafe(item.text.toUpperCase())}) Tj ET`,
      "0.04 0.09 0.14 rg",
    ];
  }
  if (item.kind === "term-heading") {
    const size = item.level === 1 ? 13 : item.level === 2 ? 12 : 11;
    return [
      "0.04 0.09 0.14 rg",
      `BT /F2 ${size} Tf 48 ${y} Td (${pdfSafe(item.text)}) Tj ET`,
    ];
  }
  const parts = [`BT 48 ${y} Td`];
  for (const run of item.runs) {
    parts.push(`${run.bold ? "/F2" : "/F1"} ${PDF_BODY_FONT_SIZE} Tf (${pdfSafe(run.text)}) Tj`);
  }
  parts.push("ET");
  return ["0.04 0.09 0.14 rg", parts.join(" ")];
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

/** Flattens an 8-bit PNG onto the document's dark header so the PDF can draw it. */
export function pngToPdfImage(png: Buffer): { width: number; height: number; data: Buffer } | null {
  if (png.length < 8 || png.toString("ascii", 1, 4) !== "PNG") return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || width > 4000 || height > 4000 || bitDepth !== 8 || interlace !== 0) return null;
  if (colorType !== 2 && colorType !== 6) return null;
  const channels = colorType === 6 ? 4 : 3;
  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (inflated.length < height * (stride + 1)) return null;
  const rgb = Buffer.alloc(width * height * 3);
  const row = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    for (let i = 0; i < stride; i++) {
      const raw = inflated[src++];
      const left = i >= channels ? row[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) return null;
      row[i] = value;
    }
    for (let x = 0; x < width; x++) {
      const index = x * channels;
      const alpha = channels === 4 ? row[index + 3] / 255 : 1;
      const background = [7, 16, 24];
      const out = (y * width + x) * 3;
      rgb[out] = Math.round(row[index] * alpha + background[0] * (1 - alpha));
      rgb[out + 1] = Math.round(row[index + 1] * alpha + background[1] * (1 - alpha));
      rgb[out + 2] = Math.round(row[index + 2] * alpha + background[2] * (1 - alpha));
    }
    row.copy(prev);
  }
  return { width, height, data: zlib.deflateSync(rgb) };
}

export function buildTradeRecordPdf(args: {
  recordId: string;
  verifyUrl: string;
  snapshotHash: string;
  snapshot: Record<string, unknown>;
  mark?: Buffer | null;
}): Buffer {
  const snapshot = args.snapshot;
  const parties = snapshot.parties as { buyer: { name: string; wallet: string }; seller: { name: string; wallet: string } };
  const transactions = snapshot.transactions as { label: string; hash: string }[];
  const field = (text: string): PdfItem[] => wrapRuns([{ text, bold: false }], 92).map((runs) => ({ kind: "text" as const, runs }));
  const section = (text: string): PdfItem => ({ kind: "section", text });
  const terms = layoutTerms(String(snapshot.terms || ""));
  const flow: PdfItem[] = [
    section("Agreement snapshot"),
    ...field(`Trade: ${snapshot.title}`),
    section("Terms"),
    ...(terms.length ? terms : field("No additional written terms were entered.")),
    { kind: "gap" },
    ...field(`Amount: ${snapshot.amount} ${snapshot.token}`),
    ...field(`Network: ${snapshot.network}`),
    ...field(`Created: ${snapshot.createdAt}`),
    ...field(`Snapshot status: ${snapshot.status}`),
    section("Parties"),
    ...field(`Buyer: ${parties.buyer.name}`),
    ...field(`Buyer wallet: ${parties.buyer.wallet || "Not linked"}`),
    ...field(`Seller: ${parties.seller.name}`),
    ...field(`Seller wallet: ${parties.seller.wallet || "Not linked"}`),
    section("On-chain reference"),
    ...field(`Escrow contract: ${snapshot.contractAddress}`),
    ...transactions.flatMap((tx) => field(`${tx.label}: ${tx.hash}`)),
    section("Independent verification"),
    ...field(`Record ID: ${args.recordId}`),
    ...field(`Verify this document: ${args.verifyUrl}`),
    ...field(`Snapshot SHA-256: ${args.snapshotHash}`),
    ...field("The verification page confirms the signed snapshot and shows the public on-chain references when available."),
    section("Important"),
    ...field("This document records trade details held by 2Pescrow at the time it was issued. It is not a guarantee that goods or services were delivered, not a dispute decision, and not legal advice. Always verify on-chain transactions independently."),
  ];
  const pageChunks: PdfItem[][] = [];
  let page: PdfItem[] = [];
  let cursor = 646;
  for (const item of flow) {
    if (item.kind === "gap" && page.length === 0) continue;
    const height = itemHeight(item);
    if (page.length && cursor - height < 78) {
      pageChunks.push(page);
      page = [];
      cursor = 646;
      if (item.kind === "gap") continue;
    }
    page.push(item);
    cursor -= height;
  }
  if (page.length) pageChunks.push(page);

  const markImage = args.mark ? pngToPdfImage(args.mark) : null;
  const pageContents = pageChunks.map((chunk, pageIndex) => {
    const ops = [
      "0.035 0.075 0.12 rg 0 742 612 50 re f",
      "0.12 0.78 0.82 rg 48 724 68 3 re f",
    ];
    if (markImage) {
      const drawHeight = 26;
      const drawWidth = Math.min(190, (markImage.width / markImage.height) * drawHeight);
      ops.push(`q ${drawWidth.toFixed(2)} 0 0 ${drawHeight} 48 754 cm /Im0 Do Q`);
    } else {
      ops.push("BT /F2 20 Tf 48 759 Td (2PESCROW) Tj ET");
    }
    const issued = pdfSafe("Record " + args.recordId + "  |  Issued " + String(snapshot.issuedAt));
    ops.push("0.04 0.09 0.14 rg");
    ops.push("BT /F2 16 Tf 48 695 Td (P2P ESCROW DEAL RECORD) Tj ET");
    ops.push("BT /F1 9 Tf 48 679 Td (" + issued + ") Tj ET");
    let y = 646;
    for (const item of chunk) {
      const height = itemHeight(item);
      let baseline = y;
      if (item.kind === "text") baseline = textBaseline(y, height);
      else if (item.kind === "term-heading") {
        const size = item.level === 1 ? 13 : item.level === 2 ? 12 : 11;
        baseline = y - (height - (size + 2));
      } else if (item.kind === "section") baseline = y - (height - 13);
      if (item.kind !== "gap") ops.push(...drawItem(item, baseline));
      y -= height;
    }
    ops.push("0.65 0.7 0.75 RG 48 52 m 564 52 l S");
    ops.push(`BT /F1 8 Tf 48 37 Td (${pdfSafe(`Verify at ${args.verifyUrl}`)}) Tj ET`);
    ops.push(`BT /F1 8 Tf 534 37 Td (${pageIndex + 1}/${pageChunks.length}) Tj ET`);
    return Buffer.from(ops.join("\n"), "ascii");
  });

  const objects: Buffer[] = [];
  const add = (value: string | Buffer) => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, "ascii")); return objects.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const firstPage = markImage ? 6 : 5;
  add(`<< /Type /Pages /Kids [${pageContents.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ")}] /Count ${pageContents.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  if (markImage) {
    add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${markImage.width} /Height ${markImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${markImage.data.length} >>\nstream\n`, "ascii"),
      markImage.data,
      Buffer.from("\nendstream", "ascii"),
    ]));
  }
  pageContents.forEach((content, index) => {
    const pageNumber = firstPage + index * 2;
    const contentNumber = pageNumber + 1;
    const imageResource = markImage ? " /XObject << /Im0 5 0 R >>" : "";
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${imageResource} >> /Contents ${contentNumber} 0 R >>`);
    add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "ascii"), content, Buffer.from("\nendstream", "ascii")]));
  });

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets = [0];
  let offset = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "ascii"), object, Buffer.from("\nendobj\n", "ascii")]);
    parts.push(part);
    offset += part.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(Buffer.from(xref, "ascii"));
  return Buffer.concat(parts);
}
