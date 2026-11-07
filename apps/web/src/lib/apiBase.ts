declare global {
  interface Window {
    __2PESCROW_API_URL__?: string;
  }
}

function isPrivateHost(host: string) {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const lan = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  return !!lan && Number(lan[1]) >= 16 && Number(lan[1]) <= 31;
}

/** Follow the page when a saved LAN API address is stale (Wi-Fi IP changed). */
function followPageHost(apiUrl: string): string {
  if (typeof window === "undefined") return apiUrl.replace(/\/$/, "");
  try {
    const api = new URL(apiUrl);
    const pageHost = window.location.hostname;
    if (isPrivateHost(api.hostname) && isPrivateHost(pageHost) && api.hostname !== pageHost) {
      const port = api.port ? `:${api.port}` : "";
      return `${api.protocol}//${pageHost}${port}`;
    }
  } catch {
    /* keep the configured URL */
  }
  return apiUrl.replace(/\/$/, "");
}

/** API origin for browser fetch/WebSocket — runtime config.js, then Vite build env, then dev proxy. */
export function resolveApiBase(): string {
  const runtime =
    typeof window !== "undefined" ? window.__2PESCROW_API_URL__?.trim() : undefined;
  if (runtime) return followPageHost(runtime);

  const built = import.meta.env.VITE_API_URL?.trim();
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const pageHost = window.location.hostname;
    const pageIsLocal = pageHost === "localhost" || pageHost === "127.0.0.1";
    if (built) {
      try {
        const apiHost = new URL(built).hostname;
        const apiIsLocal = apiHost === "localhost" || apiHost === "127.0.0.1";
        // Phone/tablet on LAN hits Vite by IP; localhost API/WS URLs break live sync.
        if (apiIsLocal && !pageIsLocal) return window.location.origin.replace(/\/$/, "");
      } catch {
        /* use built below */
      }
    }
    if (!built) return window.location.origin.replace(/\/$/, "");
  }
  if (built) return built.replace(/\/$/, "");

  return "";
}
