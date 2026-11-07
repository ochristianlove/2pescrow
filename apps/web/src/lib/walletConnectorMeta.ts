import type { Connector } from "wagmi";
import { isMobileClient } from "./mobileClient";
import { isTrustWalletOption } from "./trustWalletConnect";

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Always load (no hotlink / CORS issues). */
export const WALLETCONNECT_ICON = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#3B99FC"/><path fill="#fff" d="M9.2 13.1c3.4-3.3 8.9-3.3 12.3 0l.4.4c.2.2.2.5 0 .7l-1.4 1.4c-.1.1-.3.1-.4 0l-.6-.6c-2.4-2.3-6.2-2.3-8.6 0l-.6.6c-.1.1-.3.1-.4 0l-1.4-1.4c-.2-.2-.2-.5 0-.7l.4-.4zm15.2 2.8 1.2 1.2c.2.2.2.5 0 .7-5 4.9-13.1 4.9-18.1 0-.2-.2-.2-.5 0-.7l1.2-1.2c.2-.2.5-.2.7 0 4.1 4 10.8 4 14.9 0 .2-.2.5-.2.7 0z"/></svg>',
);

export const BASE_ACCOUNT_ICON = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0052FF"/><path fill="#fff" d="M16 6C10.5 6 6 10.5 6 16s4.5 10 10 10 10-4.5 10-10S21.5 6 16 6zm0 4.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"/></svg>',
);

const ICON_BY_ID: Record<string, string> = {
  metaMask: "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
  "io.metamask": "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
  injected: svgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#3ecf8e"/><path fill="#0a0e17" d="M10 12h12v2H10zm0 4h8v2h-8z"/></svg>',
  ),
  rabby: "https://rabby.io/assets/images/logo-128.png",
  "io.rabby": "https://rabby.io/assets/images/logo-128.png",
  walletConnect: WALLETCONNECT_ICON,
  coinbaseWallet: "https://avatars.githubusercontent.com/u/18060234?s=200&v=4",
  coinbaseWalletSDK: "https://avatars.githubusercontent.com/u/18060234?s=200&v=4",
  baseAccount: BASE_ACCOUNT_ICON,
  "app.base.account": BASE_ACCOUNT_ICON,
  okxWallet: "https://static.okx.com/cdn/wallet/logo/okx_wallet_logo_288.png",
  "com.okex.wallet": "https://static.okx.com/cdn/wallet/logo/okx_wallet_logo_288.png",
  trust: "https://avatars.githubusercontent.com/u/32179889?s=200&v=4",
  "com.trustwallet.app": "https://avatars.githubusercontent.com/u/32179889?s=200&v=4",
  phantom: "https://avatars.githubusercontent.com/u/78709244?s=200&v=4",
  "app.phantom": "https://avatars.githubusercontent.com/u/78709244?s=200&v=4",
  braveWallet: "https://avatars.githubusercontent.com/u/12301624?s=200&v=4",
  "com.brave.wallet": "https://avatars.githubusercontent.com/u/12301624?s=200&v=4",
  rainbow: "https://avatars.githubusercontent.com/u/48327834?s=200&v=4",
  "me.rainbow": "https://avatars.githubusercontent.com/u/48327834?s=200&v=4",
  zerion: "https://avatars.githubusercontent.com/u/36106522?s=200&v=4",
  "io.zerion.wallet": "https://avatars.githubusercontent.com/u/36106522?s=200&v=4",
  frame: "https://avatars.githubusercontent.com/u/74710197?s=200&v=4",
  tokenPocket: "https://avatars.githubusercontent.com/u/31663715?s=200&v=4",
  bitKeep: "https://avatars.githubusercontent.com/u/103043056?s=200&v=4",
  imToken: "https://avatars.githubusercontent.com/u/23948799?s=200&v=4",
  uniswapWallet: "https://avatars.githubusercontent.com/u/36106522?s=200&v=4",
  backpack: "https://avatars.githubusercontent.com/u/126981989?s=200&v=4",
  enkrypt: "https://avatars.githubusercontent.com/u/99196836?s=200&v=4",
  tronlink: "https://www.tronlink.org/favicon.ico",
  "io.tronlink": "https://www.tronlink.org/favicon.ico",
};

const NAME_BY_ID: Record<string, string> = {
  walletConnect: "WalletConnect",
  coinbaseWallet: "Coinbase Wallet",
  coinbaseWalletSDK: "Coinbase Wallet",
  baseAccount: "Base",
  "app.base.account": "Base",
  metaMask: "MetaMask",
  "io.metamask": "MetaMask",
  rabby: "Rabby",
  "io.rabby": "Rabby",
  okxWallet: "OKX Wallet",
  "com.okex.wallet": "OKX Wallet",
  trust: "Trust Wallet",
  "com.trustwallet.app": "Trust Wallet",
  phantom: "Phantom",
  "app.phantom": "Phantom",
  braveWallet: "Brave Wallet",
  "com.brave.wallet": "Brave Wallet",
  rainbow: "Rainbow",
  "me.rainbow": "Rainbow",
  zerion: "Zerion",
  "io.zerion.wallet": "Zerion",
  frame: "Frame",
  tokenPocket: "TokenPocket",
  bitKeep: "Bitget Wallet",
  imToken: "imToken",
  injected: "Browser wallet",
  tronlink: "TronLink",
  "io.tronlink": "TronLink",
};

const POPULAR_NAME_ORDER = [
  "metamask",
  "rabby",
  "coinbase",
  "okx",
  "trust",
  "phantom",
  "brave",
  "rainbow",
  "zerion",
  "frame",
  "tokenpocket",
  "imtoken",
  "bitget",
  "backpack",
  "tronlink",
];

export type WalletPickerOption = {
  key: string;
  name: string;
  icon: string | null;
  connector?: Connector;
};

function normalizeIconUrl(icon: string | undefined): string | null {
  if (!icon) return null;
  if (icon.startsWith("data:")) return icon;
  if (icon.startsWith("http://") || icon.startsWith("https://")) return icon;
  return null;
}

const NAME_ICON_HINTS: [string, string][] = [
  ["metamask", "metaMask"],
  ["rabby", "rabby"],
  ["coinbase", "coinbaseWallet"],
  ["okx", "okxWallet"],
  ["trust", "trust"],
  ["phantom", "phantom"],
  ["brave", "braveWallet"],
  ["rainbow", "rainbow"],
  ["zerion", "zerion"],
  ["frame", "frame"],
  ["tokenpocket", "tokenPocket"],
  ["bitget", "bitKeep"],
  ["imtoken", "imToken"],
  ["backpack", "backpack"],
  ["enkrypt", "enkrypt"],
  ["walletconnect", "walletConnect"],
];

function iconFromName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [hint, key] of NAME_ICON_HINTS) {
    if (lower.includes(hint)) return ICON_BY_ID[key];
  }
  if (lower === "base" || lower.includes("base account")) return BASE_ACCOUNT_ICON;
  if (lower.includes("tronlink") || lower.includes("tron link")) return ICON_BY_ID.tronlink;
  return null;
}

export function resolveWalletOptionIcon(opt: WalletPickerOption): string | null {
  if (opt.connector && isBaseFallbackConnector(opt.connector)) return BASE_ACCOUNT_ICON;
  if (opt.connector && isWalletConnectConnector(opt.connector)) return WALLETCONNECT_ICON;
  if (opt.icon) return opt.icon;
  if (!opt.connector) return iconFromName(opt.name);
  const id = opt.connector.id;
  const rdns = (opt.connector as Connector & { rdns?: string }).rdns;
  return ICON_BY_ID[id] || (rdns ? ICON_BY_ID[rdns] : null) || iconFromName(opt.name);
}

export function connectorToPickerOption(connector: Connector): WalletPickerOption & { connector: Connector } {
  const id = connector.id;
  const rdns = (connector as Connector & { rdns?: string }).rdns;
  const name =
    connector.name?.trim() ||
    (rdns && NAME_BY_ID[rdns]) ||
    NAME_BY_ID[id] ||
    id.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const iconFromConnector = normalizeIconUrl(
    typeof connector.icon === "string" ? connector.icon : undefined,
  );
  const base = {
    key: id,
    name: isBaseFallbackConnector(connector) ? "Base" : name,
    connector,
  };
  const icon =
    iconFromConnector ||
    ICON_BY_ID[id] ||
    (rdns ? ICON_BY_ID[rdns] : null) ||
    iconFromName(base.name);

  return { ...base, icon };
}

/** Dedupe connectors (EIP-6963 discovery can surface overlaps). Prefer earlier entries. */
export function dedupePickerOptions(options: WalletPickerOption[]): WalletPickerOption[] {
  const seen = new Set<string>();
  const out: WalletPickerOption[] = [];
  for (const opt of options) {
    const token = `${opt.name.toLowerCase()}::${opt.connector?.type ?? "none"}`;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(opt);
  }
  return out;
}

const TRONLINK_PATTERN = /tron\s*link|tronlink|io\.tronlink/i;

/** TronLink registers as an EIP-1193 provider but is not an Ethereum wallet. */
export function isTronLinkWallet(name: string, connector?: Connector): boolean {
  if (TRONLINK_PATTERN.test(name)) return true;
  if (!connector) return false;
  const id = connector.id.toLowerCase();
  const rdns = ((connector as Connector & { rdns?: string }).rdns || "").toLowerCase();
  return (
    TRONLINK_PATTERN.test(id) ||
    TRONLINK_PATTERN.test(rdns) ||
    TRONLINK_PATTERN.test(connector.name || "")
  );
}

/** Hide Coinbase Wallet extension/SDK rows — use Base Account instead. */
export function isCoinbaseWalletDuplicate(name: string, connector?: Connector): boolean {
  if (!connector) return false;
  if (isBaseFallbackConnector(connector)) return false;
  const id = connector.id.toLowerCase();
  if (id.includes("coinbasewallet") || connector.type === "coinbaseWallet") return true;
  return /coinbase\s*wallet/i.test(name) && !/base account/i.test(name);
}

export function filterEvmWalletOptions(options: WalletPickerOption[]): WalletPickerOption[] {
  return options.filter(
    (opt) =>
      !isTronLinkWallet(opt.name, opt.connector) &&
      !isCoinbaseWalletDuplicate(opt.name, opt.connector),
  );
}

export function fallbackInitial(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return ch || "?";
}

export function isWalletConnectConnector(connector: Connector): boolean {
  return connector.type === "walletConnect";
}

export function isBaseFallbackConnector(connector: Connector): boolean {
  return connector.id === "baseAccount" || connector.type === "baseAccount";
}

export function isMobileOrQrFallbackConnector(connector: Connector): boolean {
  return isWalletConnectConnector(connector) || isBaseFallbackConnector(connector);
}

function popularityRank(name: string): number {
  const lower = name.toLowerCase();
  const idx = POPULAR_NAME_ORDER.findIndex((token) => lower.includes(token));
  return idx === -1 ? POPULAR_NAME_ORDER.length : idx;
}

export function sortWalletOptionsByPopularity(options: WalletPickerOption[]): WalletPickerOption[] {
  return [...options].sort((a, b) => {
    const diff = popularityRank(a.name) - popularityRank(b.name);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

function providerCanRequestAccounts(provider: unknown): boolean {
  return Boolean(provider && typeof (provider as { request?: unknown }).request === "function");
}

/** Browser extension / injected providers only (EIP-6963 entries count as installed). */
export async function connectorHasInstalledProvider(connector?: Connector): Promise<boolean> {
  if (!connector) return false;
  if (isMobileOrQrFallbackConnector(connector)) return false;
  try {
    const provider = await connector.getProvider();
    if (!providerCanRequestAccounts(provider)) return false;
    if (connector.id === "trust" && !(provider as { isTrust?: boolean }).isTrust) return false;
    return true;
  } catch {
    return false;
  }
}

function withResolvedIcon(opt: WalletPickerOption): WalletPickerOption {
  return { ...opt, icon: resolveWalletOptionIcon(opt) };
}

export async function resolveWalletPickerOptions(all: WalletPickerOption[]): Promise<WalletPickerOption[]> {
  const pool = filterEvmWalletOptions(dedupePickerOptions(all));
  const installed: WalletPickerOption[] = [];

  for (const opt of pool) {
    if (isMobileOrQrFallbackConnector(opt.connector)) continue;
    if (opt.key.startsWith("eip6963-")) {
      installed.push(withResolvedIcon(opt));
      continue;
    }
    if (await connectorHasInstalledProvider(opt.connector)) installed.push(withResolvedIcon(opt));
  }

  let sortedInstalled = sortWalletOptionsByPopularity(dedupePickerOptions(installed));

  const wc = pool.find((o) => isWalletConnectConnector(o.connector));

  // Phone browsers cannot use the extension injected Trust row — use WalletConnect → Trust deep link.
  if (isMobileClient()) {
    sortedInstalled = sortedInstalled.filter((o) => !isTrustWalletOption(o.name, o.connector));
  }

  const always: WalletPickerOption[] = [];
  const base = pool.find((o) => isBaseFallbackConnector(o.connector));
  if (base) always.push(withResolvedIcon({ ...base, key: "always-base", name: "Base" }));
  if (wc) {
    always.push(withResolvedIcon({ ...wc, key: "always-walletconnect", name: "WalletConnect" }));
  }

  return dedupePickerOptions([...sortedInstalled, ...always]);
}
