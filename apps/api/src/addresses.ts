export type ChainKey = "ethereum" | "tron";

export function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

/** Tron base58 account / contract address (case-sensitive). */
export function isTronBase58Address(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim());
}

export function normalizePartyAddress(chain: ChainKey, address: string): string {
  const a = address.trim();
  if (chain === "tron") {
    if (!isTronBase58Address(a)) throw new Error("Invalid Tron address (expected T… base58)");
    return a;
  }
  if (!isEvmAddress(a)) throw new Error("Invalid EVM address (expected 0x…)");
  return a.toLowerCase();
}

export function normalizeContractAddress(chain: ChainKey, address: string): string {
  return normalizePartyAddress(chain, address);
}

export function addressesMatch(chain: ChainKey, a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (chain === "tron") return a.trim() === b.trim();
  return a.toLowerCase() === b.toLowerCase();
}

export function walletFilterAddresses(addresses: string[]): { evm: string[]; tron: string[] } {
  const evm: string[] = [];
  const tron: string[] = [];
  for (const raw of addresses) {
    if (isTronBase58Address(raw)) tron.push(raw.trim());
    else if (isEvmAddress(raw)) evm.push(raw.toLowerCase());
  }
  return { evm, tron };
}

export function normalizeAnyPartyAddress(address: string): string {
  if (isTronBase58Address(address)) return normalizePartyAddress("tron", address);
  return normalizePartyAddress("ethereum", address);
}

export function escrowWalletWhere(addresses: string[]) {
  const { evm, tron } = walletFilterAddresses(addresses);
  const or: { buyerAddress?: { in: string[] }; sellerAddress?: { in: string[] } }[] = [];
  if (evm.length) {
    or.push({ buyerAddress: { in: evm } }, { sellerAddress: { in: evm } });
  }
  if (tron.length) {
    or.push({ buyerAddress: { in: tron } }, { sellerAddress: { in: tron } });
  }
  return or.length ? { OR: or } : { id: { in: [] as string[] } };
}
