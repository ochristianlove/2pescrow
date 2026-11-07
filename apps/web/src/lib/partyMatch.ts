export function partyMatches(escrowChain: string | undefined, party: string, connected: string | null | undefined): boolean {
  if (!connected || !party) return false;
  if (escrowChain === "tron") return connected.trim() === party.trim();
  return connected.toLowerCase() === party.toLowerCase();
}
