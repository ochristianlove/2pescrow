import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useAccount, useAppKit, useProvider } from "@reown/appkit-react-native";
import { api } from "./api";
import { appKit } from "./appkit";
import { Text, useLanguage } from "./language";
import { colors } from "./theme";
import type { TradeRow } from "./types";
import { tradePermissions } from "./tradePresentation";
import { Button, Field } from "./ui";
import {
  chainError,
  createAndFund,
  fundExisting,
  openDisputeOnChain,
  readCreationFee,
  readDeal,
  refuseCancel,
  releaseFunds,
  requestCancel,
  type WalletProvider,
} from "./tradeChain";

type WalletConfig = {
  tokens?: { USDT?: string | null; USDC?: string | null };
  factoryAddress?: string | null;
};

export function TradeActions({ trade, userId, onChanged, onError, onWeb }: {
  trade: TradeRow;
  userId?: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onWeb: () => void;
}) {
  if (!appKit || trade.chain === "tron") return <RecordedActions trade={trade} userId={userId} onChanged={onChanged} onError={onError} onWeb={onWeb} />;
  return <EthereumActions trade={trade} userId={userId} onChanged={onChanged} onError={onError} />;
}

function RecordedActions({ trade, userId, onChanged, onError, onWeb }: {
  trade: TradeRow;
  userId?: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onWeb: () => void;
}) {
  const { t } = useLanguage();
  const permission = tradePermissions(trade, userId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const open = !["Completed", "Resolved", "Cancelled"].includes(trade.status);
  const disputed = trade.status === "Disputed" || Boolean(trade.disputes?.some((item) => item.status === "open"));

  async function run(name: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(name);
    try {
      await work();
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "That trade action failed.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      {permission.seller && open && !disputed ? (
        <Button
          label="Confirm fulfilment"
          busy={busy === "delivery"}
          disabled={Boolean(busy) || trade.status !== "Funded" || !trade.contractAddress}
          onPress={() => Alert.alert(t("Confirm fulfilment?"), t("Share your delivery evidence first. This tells the buyer the deal is fulfilled and requests their review."), [
            { text: t("Keep working"), style: "cancel" },
            { text: t("Confirm fulfilment"), onPress: () => void run("delivery", () => signal(trade.id, "release-requested")) },
          ])}
        />
      ) : null}
      {permission.party && !disputed && trade.contractAddress ? (
        <>
          <Field label="Raise a dispute" value={reason} editable={!busy} maxLength={2000} onChangeText={setReason} placeholder="Describe the issue for the other party and admin." multiline />
          <Button label="Open dispute" tone="danger" busy={busy === "dispute"} disabled={Boolean(busy) || !reason.trim()} onPress={() => void run("dispute", async () => {
            await api(`/v1/escrows/${encodeURIComponent(trade.id)}/disputes`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
            setReason("");
          })} />
        </>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Wallet signatures for this network continue on the website.</Text>
      <Button label="Manage trade on website" tone="ghost" onPress={onWeb} />
    </View>
  );
}

function EthereumActions({ trade, userId, onChanged, onError }: {
  trade: TradeRow;
  userId?: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useLanguage();
  const { address, isConnected, chainId, chain: walletChain } = useAccount();
  const { open } = useAppKit();
  const { provider } = useProvider();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [chain, setChain] = useState<{ state: number; buyerCancelRequested: boolean } | null>(null);
  const lock = useRef(false);
  const permission = tradePermissions(trade, userId);
  const openTrade = !["Completed", "Resolved", "Cancelled"].includes(trade.status);
  const disputed = trade.status === "Disputed" || Boolean(trade.disputes?.some((item) => item.status === "open"));
  const mainnet = chainId === "1" || walletChain?.id === 1;
  const linked = permission.buyer ? trade.buyerAddress : trade.sellerAddress;
  const matches = Boolean(address && linked && address.toLowerCase() === linked.toLowerCase());
  const walletReady = Boolean(isConnected && address && provider && mainnet && (matches || !linked));
  const fulfilmentReady = trade.status === "InProgress" || Boolean(trade.proofHash) || Boolean(trade.messages?.some((message) => message.kind === "fulfilment" && message.fileName));
  const releaseReady = Boolean(trade.contractAddress) && fulfilmentReady && !disputed && (chain ? chain.state === 2 : trade.status === "InProgress");

  useEffect(() => {
    if (!trade.contractAddress || trade.chain === "tron") return;
    let cancelled = false;
    void readDeal(trade.contractAddress).then((view) => { if (!cancelled) setChain(view); });
    return () => { cancelled = true; };
  }, [trade.contractAddress, trade.chain, trade.status]);

  async function run(name: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(name);
    try {
      await work();
      await onChanged();
    } catch (error) {
      onError(chainError(error));
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  function requireWallet() {
    if (!isConnected || !address || !provider) {
      open({ view: "Connect" });
      throw new Error("Connect the Ethereum wallet linked to this trade.");
    }
    if (!mainnet) throw new Error("Switch your wallet to Ethereum mainnet.");
    if (linked && !matches) throw new Error("Connect the wallet already linked to this trade.");
    return { from: address, provider: provider as WalletProvider };
  }

  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      {permission.buyer && openTrade && !disputed && !trade.contractAddress ? (
        <Button label={busy === "fund" ? "Approving and depositing…" : "Approve token and fund escrow"} busy={busy === "fund"} disabled={Boolean(busy) || !trade.sellerAddress} onPress={() => void run("fund", async () => {
          const { from, provider: wallet } = requireWallet();
          if (!trade.sellerAddress) throw new Error("The seller needs to link a receiving wallet before funding.");
          const config = await api<WalletConfig>("/v1/config/wallets");
          const tokenAddress = trade.tokenSymbol === "USDC" ? config.tokens?.USDC : config.tokens?.USDT;
          if (!config.factoryAddress || !tokenAddress) throw new Error("On-chain escrow is not configured for this network yet.");
          const fee = await readCreationFee(config.factoryAddress);
          const { escrow, receipt } = await createAndFund(wallet, from, config.factoryAddress, trade.sellerAddress, tokenAddress, BigInt(trade.amountAtomic), BigInt(trade.amountAtomic) + fee);
          await api(`/v1/escrows/${encodeURIComponent(trade.id)}`, { method: "PATCH", body: JSON.stringify({ buyerAddress: from, createTxHash: receipt.hash, contractAddress: escrow }) });
          await signal(trade.id, "funded");
        })} />
      ) : null}
      {permission.buyer && openTrade && !disputed && trade.contractAddress && (chain ? chain.state === 0 : trade.status === "Created" || trade.status === "AwaitingFunding") ? (
        <Button label={busy === "fund" ? "Approving and depositing…" : "Approve token and fund escrow"} busy={busy === "fund"} disabled={Boolean(busy)} onPress={() => void run("fund", async () => {
          const { from, provider: wallet } = requireWallet();
          const config = await api<WalletConfig>("/v1/config/wallets");
          const tokenAddress = trade.tokenSymbol === "USDC" ? config.tokens?.USDC : config.tokens?.USDT;
          if (!tokenAddress || !trade.contractAddress) throw new Error("Token contract address is not configured.");
          const fee = config.factoryAddress ? await readCreationFee(config.factoryAddress) : 1_000_000n;
          await fundExisting(wallet, from, trade.contractAddress, tokenAddress, BigInt(trade.amountAtomic) + fee);
          await signal(trade.id, "funded");
        })} />
      ) : null}
      {permission.seller && openTrade && !disputed ? (
        <Button
          label="Confirm fulfilment"
          busy={busy === "delivery"}
          disabled={Boolean(busy) || trade.status !== "Funded" || !trade.contractAddress}
          onPress={() => Alert.alert(t("Confirm fulfilment?"), t("Share your delivery evidence first. This tells the buyer the deal is fulfilled and requests their review."), [
            { text: t("Keep working"), style: "cancel" },
            { text: t("Confirm fulfilment"), onPress: () => void run("delivery", () => signal(trade.id, "release-requested")) },
          ])}
        />
      ) : null}
      {permission.buyer && openTrade && !disputed && trade.contractAddress && !releaseReady && ["Funded", "InProgress"].includes(trade.status) ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Available after the seller shares fulfilment in chat.</Text>
      ) : null}
      {permission.buyer && openTrade && !disputed ? (
        <Button
          label={busy === "release" ? "Releasing…" : "Review fulfilment and release funds"}
          busy={busy === "release"}
          disabled={Boolean(busy) || !releaseReady}
          onPress={() => void run("release", async () => {
            if (!releaseReady || !trade.contractAddress) throw new Error("Available after the seller shares fulfilment in chat.");
            const { from, provider: wallet } = requireWallet();
            const proof = await api<{ proofHash: string }>(`/v1/escrows/${encodeURIComponent(trade.id)}/fulfilment-proof-hash`);
            if (!/^0x[0-9a-fA-F]{64}$/.test(proof.proofHash)) throw new Error("Waiting for fulfilment proof in chat before release.");
            await releaseFunds(wallet, from, trade.contractAddress, proof.proofHash);
            await signal(trade.id, "completed");
          })}
        />
      ) : null}
      {permission.seller && openTrade && !disputed && chain?.buyerCancelRequested ? (
        <Button label="Refuse cancel" tone="ghost" busy={busy === "refuse"} disabled={Boolean(busy) || !trade.contractAddress} onPress={() => void run("refuse", async () => {
          const { from, provider: wallet } = requireWallet();
          if (!trade.contractAddress) return;
          await refuseCancel(wallet, from, trade.contractAddress);
          await signal(trade.id, "cancel-refused");
        })} />
      ) : null}
      {permission.party && openTrade && !disputed && trade.contractAddress ? (
        <Button label={permission.seller ? "Cancel trade" : "Request cancel"} tone="ghost" busy={busy === "cancel"} disabled={Boolean(busy) || !["Funded", "InProgress"].includes(trade.status)} onPress={() => void run("cancel", async () => {
          const { from, provider: wallet } = requireWallet();
          if (!trade.contractAddress) return;
          await requestCancel(wallet, from, trade.contractAddress);
          const view = await readDeal(trade.contractAddress);
          await signal(trade.id, view?.state === 4 ? "cancelled" : "cancel-requested");
        })} />
      ) : null}
      {permission.party && !disputed && trade.contractAddress && ["Funded", "InProgress", "Completed"].includes(trade.status) ? (
        <>
          <Field label="Raise a dispute" value={reason} editable={!busy} maxLength={2000} onChangeText={setReason} placeholder="Describe the issue for the other party and admin." multiline />
          <Button label="Open dispute" tone="danger" busy={busy === "dispute"} disabled={Boolean(busy) || !reason.trim()} onPress={() => void run("dispute", async () => {
            const { from, provider: wallet } = requireWallet();
            if (!trade.contractAddress) return;
            const view = chain ?? await readDeal(trade.contractAddress);
            if (view && view.state !== 5 && (view.state === 1 || view.state === 2)) await openDisputeOnChain(wallet, from, trade.contractAddress);
            await api(`/v1/escrows/${encodeURIComponent(trade.id)}/disputes`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
            setReason("");
          })} />
        </>
      ) : null}
      {!walletReady && permission.party && openTrade ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          {isConnected ? "Connect the wallet linked to this trade on Ethereum to sign." : "Connect your Ethereum wallet to approve, fund, or release this trade."}
        </Text>
      ) : null}
    </View>
  );
}

async function signal(id: string, kind: "funded" | "release-requested" | "completed" | "cancel-requested" | "cancel-refused" | "cancelled") {
  await api(`/v1/escrows/${encodeURIComponent(id)}/signals`, { method: "POST", body: JSON.stringify({ kind }) });
}
