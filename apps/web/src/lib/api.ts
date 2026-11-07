import { resolveApiBase } from "./apiBase";

export function apiBase() {
  return resolveApiBase();
}

/** Blog images stay on the API. Old posts saved a full LAN URL that goes stale when the PC address changes. */
export function mediaUrl(src: string | null | undefined): string {
  if (!src) return "";
  const trimmed = src.trim();
  const base = resolveApiBase();
  if (trimmed.startsWith("/v1/blog/media/")) return `${base}${trimmed}`;
  try {
    const url = new URL(trimmed);
    if (url.pathname.startsWith("/v1/blog/media/")) return `${base}${url.pathname}${url.search}`;
  } catch {
    return trimmed;
  }
  return trimmed;
}

function requireApiBase(): string {
  const base = resolveApiBase();
  if (!base) {
    throw new Error(
      "API URL is not configured. Set VITE_API_URL at web build time or API_PUBLIC_URL on the web container."
    );
  }
  return base;
}

export function wsUrl() {
  const base = requireApiBase();
  return `${base.replace(/^http/, "ws")}/v1/ws`;
}

function formatApiError(text: string, status: number) {
  if (!text) return `Request failed (${status})`;
  try {
    const j = JSON.parse(text) as { error?: string; message?: string };
    if (j.error) return j.error;
    if (j.message) return j.message;
  } catch {
    /* plain text */
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const base = requireApiBase();
    res = await fetch(`${base}${path}`, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      throw new Error(`Cannot reach API at ${requireApiBase()}. Is the API running? (${msg})`);
    }
    throw e;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatApiError(text, res.status));
  }
  return res.json();
}

export async function apiUpload<T>(path: string, form: FormData, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${requireApiBase()}${path}`, { method: "POST", body: form, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function formatAmount(atomic: string, decimals = 6): string {
  try {
    const n = BigInt(atomic);
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch {
    return atomic;
  }
}

export function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
