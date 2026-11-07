/** Base Account / WalletConnect SDKs expect crypto.randomUUID (secure contexts only on some mobile browsers). */
export function ensureCryptoPolyfill(): void {
  if (typeof globalThis === "undefined") return;
  const c = globalThis.crypto ?? ({} as Crypto);
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, "crypto", { value: c, configurable: true });
  }
  if (typeof c.randomUUID === "function") return;

  c.randomUUID = function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    const bytes = new Uint8Array(16);
    if (typeof c.getRandomValues === "function") {
      c.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}
