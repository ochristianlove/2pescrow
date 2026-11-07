import { apiBase } from "./api";

export const DEFAULT_LOGO = "/brand/logo.png";
export const DEFAULT_FAVICON = "/brand/favicon.png";

export function brandSrc(url: string | null | undefined, fallback: string) {
  const value = url?.trim();
  if (!value) return fallback;
  if (value.startsWith("/v1/")) {
    const base = apiBase();
    return base ? `${base}${value}` : value;
  }
  return value;
}
