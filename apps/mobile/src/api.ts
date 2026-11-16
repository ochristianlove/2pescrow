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
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers });
  } catch {
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
