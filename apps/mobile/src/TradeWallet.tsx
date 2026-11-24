import { useRef, useState } from "react";
import { View } from "react-native";
import { useAccount, useAppKit } from "@reown/appkit-react-native";
import { appKit } from "./appkit";
import { api } from "./api";
import { useAuth } from "./auth";
import { Text } from "./language";
import { colors } from "./theme";
import type { TradeRow } from "./types";
import { tradePermissions } from "./tradePresentation";
import { Button, Notice } from "./ui";
export function TradeWallet({ trade, onLinked }: { trade: TradeRow; onLinked: () => Promise<void> }) {
  return appKit && trade.chain === "ethereum" ? <ConnectedTradeWallet trade={trade} onLinked={onLinked} /> : null;
}
function ConnectedTradeWallet({ trade, onLinked }: { trade: TradeRow; onLinked: () => Promise<void> }) {
  const { user, refresh } = useAuth();
  const { address, isConnected, chainId, chain } = useAccount();
  const { open } = useAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const { buyer, party } = tradePermissions(trade, user?.id);
  if (!party || !trade.tradeCode) return null;
  const linked = buyer ? trade.buyerAddress : trade.sellerAddress;
  const mainnet = chainId === "1" || chain?.id === 1;
  const matches = Boolean(address && linked && address.toLowerCase() === linked.toLowerCase());
  const fixed = Boolean(trade.contractAddress || trade.createTxHash);
  const closed = ["Completed", "Resolved", "Cancelled", "Funded", "InProgress", "Disputed"].includes(trade.status);
  async function link() {
    if (!address || !isConnected || !mainnet || closed || (fixed && !matches) || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await api("/v1/auth/link-wallet", { method: "POST", body: JSON.stringify({ address, chainKind: "evm" }) });
      await api(`/v1/escrows/${encodeURIComponent(trade.id)}/wallet`, { method: "POST", body: JSON.stringify({ address }) });
      await Promise.all([onLinked(), refresh()]);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not link that address."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function unlink() {
    if (!linked || fixed || closed || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await api(`/v1/escrows/${encodeURIComponent(trade.id)}/wallet`, { method: "DELETE" });
      await onLinked();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not unlink that address."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={{ marginBottom: 20, gap: 12 }}>
    {error ? <Notice text={error} /> : null}
    <Text style={{ color: colors.muted, lineHeight: 21 }}>{matches ? "Your connected wallet is linked to this trade." : fixed ? "Connect the wallet already linked to this trade." : "Connect a wallet, then confirm the wallet you want to use for this trade."}</Text>
    {isConnected && !mainnet ? <Notice text="Switch your EVM wallet to Ethereum before linking it to this trade." /> : null}
    {!isConnected ? <Button label="Connect Ethereum wallet" tone="ghost" onPress={() => open({ view: "Connect" })} /> : !matches && !closed && !fixed ? <Button label={buyer ? (linked ? "Switch buyer wallet" : "Link my buyer wallet") : (linked ? "Switch seller wallet" : "Link my seller wallet")} disabled={!mainnet} busy={busy} onPress={() => void link()} /> : null}
    {linked && !fixed && !closed ? <Button label={buyer ? "Unlink buyer wallet" : "Unlink seller wallet"} tone="ghost" busy={busy} onPress={() => void unlink()} /> : null}
  </View>;
}
