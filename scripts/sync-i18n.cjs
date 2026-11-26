/**
 * Automatically extracts new English UI strings from apps/web and apps/mobile,
 * translates any keys missing from the 7 non-English languages (fr, zh, es, pt-BR, ru, id, vi)
 * into packages/shared/src/i18n/generated.ts while preserving {placeholders} and crypto/brand terms,
 * and never overwrites existing manual/reviewed translations.
 *
 * Usage:
 *   node scripts/sync-i18n.cjs           # extract & translate missing keys into generated.ts
 *   node scripts/sync-i18n.cjs --dry-run # report missing keys without modifying files
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const code = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(out, filename);
};

const { catalogs, translate } = require("../packages/shared/src/i18n/catalog.ts");
const { french } = require("../packages/shared/src/i18n/fr.ts");
const { frenchExtra } = require("../packages/shared/src/i18n/fr-extra.ts");
const { generated } = require("../packages/shared/src/i18n/generated.ts");
const { reviewed } = require("../packages/shared/src/i18n/reviewed.ts");
const { templates } = require("../packages/shared/src/i18n/templates.ts");
const requiredCopy = require("../packages/shared/src/i18n/required-copy.json");

const TARGET_LANGS = [
  { id: "fr", gtx: "fr", mm: "fr" },
  { id: "zh", gtx: "zh-CN", mm: "zh-CN" },
  { id: "es", gtx: "es", mm: "es" },
  { id: "pt-BR", gtx: "pt", mm: "pt-BR" },
  { id: "ru", gtx: "ru", mm: "ru" },
  { id: "id", gtx: "id", mm: "id" },
  { id: "vi", gtx: "vi", mm: "vi" },
];

const IMMUTABLE_TERMS = [
  "2Pescrow",
  "WalletConnect",
  "TronLink",
  "MetaMask",
  "Etherscan",
  "Sourcify",
  "GitHub",
  "Ethereum",
  "ERC-20",
  "TRC-20",
  "SHA-256",
  "USDT",
  "USDC",
  "ETH",
  "TRX",
  "CSV",
  "PDF",
  "APK",
  "OTC",
  "V1",
  "V2",
];

const DRY_RUN = process.argv.includes("--dry-run");
const INCLUDE_EDITORIAL = process.argv.includes("--include-editorial");
const FILES_ARG = process.argv.find((arg) => arg.startsWith("--files="));
const ONLY_FILES = FILES_ARG
  ? FILES_ARG.slice("--files=".length).split(",").map((f) => path.resolve(__dirname, "..", f.trim())).filter(Boolean)
  : null;
const GENERATED_PATH = path.resolve(__dirname, "../packages/shared/src/i18n/generated.ts");

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      out.push(...walkFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isCandidateCopy(raw) {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length < 2 || s.length > 420) return false;
  if (!/[a-zA-Z]{2}/.test(s)) return false;
  // Skip URLs, paths, SVG path data, CSS/hex colors, filenames, env vars, MIME types, JS identifiers
  if (/^(https?:|mailto:|twopescrow:|\/|#|rgba?\(|M\d|\d+(\.\d+)?(px|rem|em|%|ms|s)?$)/i.test(s)) return false;
  if (/^[\w./-]+\.(tsx?|jsx?|cjs|mjs|json|png|jpe?g|svg|css|pdf|apk|mp4|mov|webm)$/i.test(s)) return false;
  if (/^[a-z0-9_.-]+:[a-z0-9_.-]+$/i.test(s)) return false;
  if (/^[a-z]+([A-Z][a-z0-9]+)+$/.test(s)) return false; // camelCase identifier
  if (/^[A-Z0-9_]+$/.test(s) && s.includes("_")) return false; // SCREAMING_SNAKE
  if (/^[a-z0-9-]+$/.test(s) && s.includes("-")) return false; // kebab-case CSS class / route
  if (/^0x[a-f0-9]+$/i.test(s)) return false;
  if (/^application\/|^image\/|^video\/|^text\//i.test(s)) return false;
  if (/^(2Pescrow|Ethereum|Tron|TRON|ETH|USDT|USDC|ERC-20|TRC-20|WalletConnect|TronLink|MetaMask|Etherscan|Sourcify|GitHub|SHA-256|Telegram|Discord|X)$/.test(s)) return false;
  return true;
}

function extractKeys() {
  const keys = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    const cleaned = value
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (isCandidateCopy(cleaned)) keys.add(cleaned);
  };

  const targetFiles = ONLY_FILES
    ? ONLY_FILES.filter((f) => fs.existsSync(f))
    : [
        path.resolve(__dirname, "../apps/web/src"),
        path.resolve(__dirname, "../apps/mobile/app"),
        path.resolve(__dirname, "../apps/mobile/src"),
      ].flatMap((dir) => walkFiles(dir));

  for (const file of targetFiles) {
    if (/[\\/](language|translations|legalCopy)\.(ts|tsx)$/.test(file)) continue;
      const source = fs.readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

      function visit(node) {
        if (ts.isJsxText(node)) {
          add(node.text);
        }
        if (ts.isCallExpression(node)) {
          const callee = node.expression.getText(sf);
          const first = node.arguments[0];
          if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
            if (callee === "t" || callee.endsWith(".t") || /^(setError|setNotice|setSuccess|setLiveAlert|Alert\.alert)$/.test(callee)) {
              add(first.text);
            }
          }
          if (callee === "Alert.alert") {
            const second = node.arguments[1];
            if (second && (ts.isStringLiteral(second) || ts.isNoSubstitutionTemplateLiteral(second))) {
              add(second.text);
            }
          }
        }
        if (ts.isJsxAttribute(node)) {
          const attr = node.name.getText(sf);
          if (["label", "placeholder", "title", "subtitle", "text", "aria-label", "accessibilityLabel", "accessibilityHint", "message"].includes(attr)) {
            const init = node.initializer;
            if (init && ts.isStringLiteral(init)) add(init.text);
            else if (init && ts.isJsxExpression(init) && init.expression) {
              const expr = init.expression;
              if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
                add(expr.text);
              } else if (ts.isConditionalExpression(expr)) {
                if (ts.isStringLiteral(expr.whenTrue)) add(expr.whenTrue.text);
                if (ts.isStringLiteral(expr.whenFalse)) add(expr.whenFalse.text);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sf);
  }
  if (INCLUDE_EDITORIAL && Array.isArray(requiredCopy)) {
    for (const key of requiredCopy) {
      if (typeof key === "string" && key.trim()) keys.add(key);
    }
  }
  return [...keys].sort();
}

function hasTranslation(lang, key) {
  if (typeof reviewed[lang]?.[key] === "string" && reviewed[lang][key].trim()) return true;
  if (typeof templates[lang]?.[key] === "string" && templates[lang][key].trim()) return true;
  if (lang === "fr" && (typeof french[key] === "string" || typeof frenchExtra[key] === "string")) return true;
  for (const cat of catalogs) {
    if (typeof cat[lang]?.[key] === "string" && cat[lang][key].trim()) return true;
  }
  if (typeof generated[lang]?.[key] === "string" && generated[lang][key].trim()) return true;
  return false;
}

function protectTokens(text) {
  const tokens = [];
  let out = text.replace(/\{\w+\}/g, (match) => {
    const idx = tokens.push(match) - 1;
    return `ZZPH${idx}ZZ`;
  });
  for (const term of IMMUTABLE_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "g");
    out = out.replace(re, (match) => {
      const idx = tokens.push(match) - 1;
      return `ZZTM${idx}ZZ`;
    });
  }
  return { protectedText: out, tokens };
}

function restoreTokens(text, tokens) {
  return text.replace(/ZZ(?:PH|TM)\s*(\d+)\s*ZZ/gi, (_, indexStr) => {
    const idx = Number(indexStr);
    return tokens[idx] ?? "";
  });
}

let gtxBlocked = false;

async function translateViaMyMemory(protectedText, tokens, orig, mmLang) {
  if (protectedText.length > 480) return null;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(protectedText)}&langpair=en|${encodeURIComponent(mmLang)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.quotaFinished) return null;
      const raw = data?.responseData?.translatedText;
      if (typeof raw !== "string" || !raw.trim() || /MYMEMORY WARNING/i.test(raw)) return null;
      const restored = restoreTokens(raw, tokens).trim();
      const expectedPlaceholders = (orig.match(/\{\w+\}/g) || []).sort();
      const actualPlaceholders = (restored.match(/\{\w+\}/g) || []).sort();
      if (JSON.stringify(expectedPlaceholders) !== JSON.stringify(actualPlaceholders)) return orig;
      return restored;
    } catch {
      if (attempt < 1) await new Promise((r) => setTimeout(r, 300));
    }
  }
  return null;
}

async function translateText(text, langSpec) {
  const { protectedText, tokens } = protectTokens(text);
  if (!gtxBlocked) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(langSpec.gtx)}&dt=t&q=${encodeURIComponent(protectedText)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.status === 429) {
        gtxBlocked = true;
      } else if (res.ok) {
        const data = await res.json();
        const joined = Array.isArray(data?.[0]) ? data[0].map((seg) => (Array.isArray(seg) ? seg[0] : "")).join("") : "";
        if (joined.trim()) {
          const restored = restoreTokens(joined, tokens).trim();
          const expectedPlaceholders = (text.match(/\{\w+\}/g) || []).sort();
          const actualPlaceholders = (restored.match(/\{\w+\}/g) || []).sort();
          return JSON.stringify(expectedPlaceholders) === JSON.stringify(actualPlaceholders) ? restored : text;
        }
      }
    } catch {
      // Fall through to MyMemory
    }
  }
  return translateViaMyMemory(protectedText, tokens, text, langSpec.mm);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function writeGeneratedFile(nextGenerated) {
  const ordered = {};
  for (const { id } of TARGET_LANGS) {
    const dict = nextGenerated[id] || {};
    const sortedEntries = Object.keys(dict)
      .sort()
      .reduce((acc, k) => {
        acc[k] = dict[k];
        return acc;
      }, {});
    ordered[id] = sortedEntries;
  }
  const content =
    "// Additional interface and published editorial translations. See README.md.\n" +
    "// Auto-synced by `npm run i18n:sync` — existing reviewed/manual translations always take precedence.\n" +
    `export const generated: Record<string, Record<string, string>> = ${JSON.stringify(ordered, null, 2)};\n`;
  fs.writeFileSync(GENERATED_PATH, content, "utf8");
}

const BATCH_DELIMITER = "\n";

async function translateBatch(keys, langSpec) {
  if (keys.length === 0) return [];
  if (keys.length === 1 || gtxBlocked) {
    return mapLimit(keys, 4, async (k) => [k, await translateText(k, langSpec)]);
  }
  if (keys.some((k) => k.includes("\n"))) {
    return mapLimit(keys, 4, async (k) => [k, await translateText(k, langSpec)]);
  }
  const prepared = keys.map((k) => protectTokens(k));
  const joinedQuery = prepared.map((p) => p.protectedText).join(BATCH_DELIMITER);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(langSpec.gtx)}&dt=t`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `q=${encodeURIComponent(joinedQuery)}`,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) {
      gtxBlocked = true;
    } else if (res.ok) {
      const data = await res.json();
      const joined = Array.isArray(data?.[0]) ? data[0].map((seg) => (Array.isArray(seg) ? seg[0] : "")).join("") : "";
      const parts = joined.split(/\r?\n/);
      if (parts.length === keys.length) {
        return keys.map((orig, idx) => {
          const restored = restoreTokens(parts[idx], prepared[idx].tokens).trim();
          const expectedPh = (orig.match(/\{\w+\}/g) || []).sort();
          const actualPh = (restored.match(/\{\w+\}/g) || []).sort();
          if (!restored || JSON.stringify(expectedPh) !== JSON.stringify(actualPh)) {
            return [orig, orig];
          }
          return [orig, restored];
        });
      }
    }
  } catch {
    // Fall through
  }
  if (gtxBlocked) {
    return mapLimit(keys, 4, async (k) => [k, await translateText(k, langSpec)]);
  }
  const mid = Math.ceil(keys.length / 2);
  const [left, right] = await Promise.all([
    translateBatch(keys.slice(0, mid), langSpec),
    translateBatch(keys.slice(mid), langSpec),
  ]);
  return [...left, ...right];
}

function chunkKeys(keys, maxChars = 1600, maxItems = 25) {
  const chunks = [];
  let current = [];
  let len = 0;
  for (const k of keys) {
    if (k.includes("\n")) {
      if (current.length > 0) {
        chunks.push(current);
        current = [];
        len = 0;
      }
      chunks.push([k]);
      continue;
    }
    if (current.length > 0 && (current.length >= maxItems || len + k.length + 2 > maxChars)) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(k);
    len += k.length + 2;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function main() {
  const allKeys = extractKeys();
  const missingByLang = {};
  let totalMissing = 0;

  for (const { id } of TARGET_LANGS) {
    const missing = allKeys.filter((key) => !hasTranslation(id, key));
    missingByLang[id] = missing;
    totalMissing += missing.length;
  }

  console.log(`Scanned ${allKeys.length} UI copy keys across web & mobile.`);
  for (const { id } of TARGET_LANGS) {
    console.log(`  ${id}: ${missingByLang[id].length} missing`);
  }

  if (totalMissing === 0) {
    console.log("All 8 languages are already up to date.");
    return;
  }

  if (DRY_RUN) {
    console.log("\nSample missing keys (fr):", missingByLang.fr.slice(0, 20));
    return;
  }

  const nextGenerated = {};
  for (const { id } of TARGET_LANGS) {
    nextGenerated[id] = { ...(generated[id] || {}) };
  }

  let added = 0;
  for (const langSpec of TARGET_LANGS) {
    const { id } = langSpec;
    const missing = missingByLang[id];
    if (missing.length === 0) continue;
    const chunks = chunkKeys(missing);
    console.log(`Translating ${missing.length} keys -> ${id} (${chunks.length} batches)...`);
    const batchResults = await mapLimit(chunks, 3, (chunk) => translateBatch(chunk, langSpec));
    for (const pairs of batchResults) {
      for (const [key, value] of pairs) {
        if (value && typeof value === "string" && value.trim()) {
          nextGenerated[id][key] = value;
          added++;
        }
      }
    }
    writeGeneratedFile(nextGenerated);
  }

  console.log(`Added ${added} automated translations to packages/shared/src/i18n/generated.ts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
