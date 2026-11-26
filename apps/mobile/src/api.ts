import { apiUrl } from "./config";
import { getToken } from "./session";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const base = apiUrl();
  const isUpload = init?.body instanceof FormData;
  const isChainFlow = /\/(ethereum-funding|signals|disputes|fulfilment-proof-hash)\b/.test(path);
  const timeoutMs = isUpload ? 60_000 : isChainFlow ? 45_000 : 15_000;
  const method = (init?.method || "GET").toUpperCase();
  const canRetry = method === "GET" && !init?.signal;

  let response: Response | null = null;
  let lastNetworkError: unknown = null;
  const attempts = canRetry ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers,
        signal: init?.signal ?? controller.signal,
      });
      lastNetworkError = null;
      break;
    } catch (err) {
      lastNetworkError = err;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (!response || lastNetworkError) {
    throw new ApiError("Cannot reach the server right now. Try again in a moment.", 0);
  }
  const text = await response.text();
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      if (text) message = text.slice(0, 240);
    }
    throw new ApiError(message, response.status);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function tokenFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromQuery = trimmed.match(/[?&]token=([a-f0-9]+)/i);
  if (fromQuery) return fromQuery[1];
  if (/^[a-f0-9]{32,}$/i.test(trimmed)) return trimmed;
  return null;
}
