import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useAccount, useAppKit, useProvider } from "@reown/appkit-react-native";
import { api } from "./api";
import { appKit } from "./appkit";
import { useAuth } from "./auth";
import { FundingBreakdown, useFundingQuote, type FundingHint } from "./FundingBreakdown";
import { Text, useLanguage } from "./language";
import { colors } from "./theme";
import type { TradeRow } from "./types";
import { buyerFundingPending, tradeDisputeAccess, tradePermissions } from "./tradePresentation";
import { Button, Field } from "./ui";
import { NativeEthereumFunding } from "./NativeEthereumFunding";
import {
  chainError,
  openDisputeOnChain,
  readDeal,
  readDealCapabilities,
  readTronDeal,
  refuseCancel,
  releaseFunds,
  requestCancel,
  submitProofOnChain,
  withdrawDisputeOnChain,
  type DealChainView,
  type WalletProvider,
} from "./tradeChain";

type WalletConfig = {
  tokens?: { USDT?: string | null; USDC?: string | null };
  factoryAddress?: string | null;
};

type ChainView = DealChainView;
type ActionMode = "ethereum" | "tron" | "website";

export function TradeActions({ trade, userId, onChanged, onError, onWeb }: {
  trade: TradeRow;
  userId?: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onWeb: () => void;
}) {
  if (!appKit || trade.chain === "tron") {
    return <RecordedActions trade={trade} userId={userId} onChanged={onChanged} onError={onError} onWeb={onWeb} />;
  }
  return <EthereumActions trade={trade} userId={userId} onChanged={onChanged} onError={onError} onWeb={onWeb} />;
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
  const [chain, setChain] = useState<ChainView | null>(null);
  const lock = useRef(false);
  const open = !["Completed", "Resolved", "Cancelled"].includes(trade.status);
  const disputed = trade.status === "Disputed" || Boolean(trade.disputes?.some((item) => item.status === "open"));
  const mode: ActionMode = trade.chain === "tron" ? "tron" : "website";
  const showFunding = buyerFundingPending(trade, permission.buyer, chain?.state);
  const quote = useFundingQuote(trade, null, showFunding);

  useEffect(() => {
    if (!trade.contractAddress) return;
    let cancelled = false;
    const read = trade.chain === "tron" ? readTronDeal(trade.contractAddress) : readDeal(trade.contractAddress);
    void read.then((view) => {
      if (!cancelled && view) setChain(view);
    });
    return () => {
      cancelled = true;
    };
  }, [trade.contractAddress, trade.chain, trade.status, trade.updatedAt, trade.buyerAddress, trade.sellerAddress]);

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
      {showFunding ? <FundingBreakdown trade={trade} quote={quote} hint={trade.chain === "tron" ? "connect-tron" : "connect-ethereum"} /> : null}
      {showFunding ? (
        <Button
          label="Approve token and fund escrow"
          disabled={!trade.sellerAddress}
          onPress={onWeb}
        />
      ) : null}
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
      <DisputeAndCancel
        trade={trade}
        userId={userId}
        chain={chain}
        busy={busy}
        reason={reason}
        setReason={setReason}
        mode={mode}
        onWeb={onWeb}
        run={run}
      />
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        {trade.chain === "tron"
          ? "TRON wallet signatures for funding, cancel, and restoring a frozen dispute continue on the website."
          : "Wallet signatures for this network continue on the website."}
      </Text>
      <Button label="Manage trade on website" tone="ghost" onPress={onWeb} />
    </View>
  );
}

function EthereumActions({ trade, userId, onChanged, onError, onWeb }: {
  trade: TradeRow;
  userId?: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onWeb: () => void;
}) {
  const { t } = useLanguage();
  const { address, isConnected, chainId, chain: walletChain } = useAccount();
  const { open } = useAppKit();
  const { provider } = useProvider();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainView | null>(null);
  const lock = useRef(false);
  const permission = tradePermissions(trade, userId);
  const openTrade = !["Completed", "Resolved", "Cancelled"].includes(trade.status);
  const disputed = trade.status === "Disputed" || Boolean(trade.disputes?.some((item) => item.status === "open"));
  const mainnet = chainId === "1" || walletChain?.id === 1;
  const linked = permission.buyer ? trade.buyerAddress : trade.sellerAddress;
  const matches = Boolean(address && linked && address.toLowerCase() === linked.toLowerCase());
  const walletReady = Boolean(isConnected && address && provider && mainnet && (matches || !linked));
  const fulfilmentReady = trade.status === "InProgress" || Boolean(trade.proofHash) || Boolean(trade.messages?.some((message) => message.kind === "fulfilment" && message.fileName));
  const capabilities = chain?.capabilities ?? null;
  const isV1Deal = capabilities?.requiresOnChainSellerProof === true;
  const v1OnChainProofNeeded = isV1Deal && chain?.state === 1;
  const capabilitiesPending = Boolean(trade.contractAddress) && !capabilities;
  const releaseReady =
    Boolean(trade.contractAddress)
    && !disputed
    && (capabilities?.releaseMode === "v1-zero-arg"
      ? chain?.state === 2
      : capabilities?.releaseMode === "v2-proof-hash"
        ? fulfilmentReady && (chain?.state === 1 || chain?.state === 2)
        : false);
  const sellerCanSubmit = Boolean(
    trade.contractAddress
    && (isV1Deal
      ? chain?.state === 1
      : trade.status === "Funded" && !capabilitiesPending),
  );
  const showFunding = buyerFundingPending(trade, permission.buyer, chain?.state);
  const fundingWallet = isConnected && mainnet && address ? address : null;
  const fundingHint: FundingHint = !isConnected ? "connect-ethereum" : !mainnet ? "switch-ethereum" : null;
  const quote = useFundingQuote(trade, fundingWallet, showFunding);

  useEffect(() => {
    if (!trade.contractAddress || trade.chain === "tron") return;
    let cancelled = false;
    void readDeal(trade.contractAddress).then((view) => {
      if (!cancelled && view) setChain(view);
    });
    return () => {
      cancelled = true;
    };
  }, [trade.contractAddress, trade.chain, trade.status, trade.updatedAt, trade.buyerAddress, trade.sellerAddress]);

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
      {showFunding ? <FundingBreakdown trade={trade} quote={quote} hint={fundingHint} /> : null}
      {permission.buyer && !disputed && trade.buyerAddress && trade.sellerAddress ? (
        <NativeEthereumFunding trade={trade} requireWallet={requireWallet} onChanged={onChanged} />
      ) : null}
      {permission.seller && openTrade && !disputed ? (
        <Button
          label={isV1Deal ? "Submit fulfilment on-chain" : "Confirm fulfilment"}
          busy={busy === "delivery"}
          disabled={Boolean(busy) || !sellerCanSubmit}
          onPress={() => {
            if (!trade.contractAddress) return;
            if (isV1Deal) {
              Alert.alert(
                t("Submit fulfilment on-chain?"),
                t("Upload your delivery proof in chat first. This escrow contract requires your linked seller wallet to record the proof hash on-chain before the buyer can release funds."),
                [
                  { text: t("Keep working"), style: "cancel" },
                  {
                    text: t("Submit on-chain"),
                    onPress: () => void run("delivery", async () => {
                      if (!trade.contractAddress) throw new Error("No on-chain contract yet.");
                      const { from, provider: wallet } = requireWallet();
                      let proofHash = "";
                      try {
                        const proof = await api<{ proofHash: string }>(`/v1/escrows/${encodeURIComponent(trade.id)}/fulfilment-proof-hash`);
                        proofHash = proof.proofHash;
                      } catch {
                        throw new Error("Upload fulfilment proof in chat first, then submit fulfilment on-chain.");
                      }
                      await submitProofOnChain(wallet, from, trade.contractAddress, proofHash);
                      await signal(trade.id, "release-requested");
                      const refreshed = await readDeal(trade.contractAddress);
                      if (refreshed) setChain(refreshed);
                    }),
                  },
                ],
              );
              return;
            }
            Alert.alert(t("Confirm fulfilment?"), t("Share your delivery evidence first. This tells the buyer the deal is fulfilled and requests their review."), [
              { text: t("Keep working"), style: "cancel" },
              {
                text: t("Confirm fulfilment"),
                onPress: () => void run("delivery", async () => {
                  if (!trade.contractAddress) throw new Error("No on-chain contract yet.");
                  const caps = capabilities ?? await readDealCapabilities(trade.contractAddress);
                  if (caps.releaseMode === "unknown") {
                    throw new Error("Could not verify the deployed escrow contract version. Refresh and try again.");
                  }
                  if (caps.requiresOnChainSellerProof) {
                    const { from, provider: wallet } = requireWallet();
                    let proofHash = "";
                    try {
                      const proof = await api<{ proofHash: string }>(`/v1/escrows/${encodeURIComponent(trade.id)}/fulfilment-proof-hash`);
                      proofHash = proof.proofHash;
                    } catch {
                      throw new Error("Upload fulfilment proof in chat first, then submit fulfilment on-chain.");
                    }
                    await submitProofOnChain(wallet, from, trade.contractAddress, proofHash);
                  }
                  await signal(trade.id, "release-requested");
                  const refreshed = await readDeal(trade.contractAddress);
                  if (refreshed) setChain(refreshed);
                }),
              },
            ]);
          }}
        />
      ) : null}
      {permission.buyer && openTrade && !disputed && trade.contractAddress && !releaseReady && ["Funded", "InProgress"].includes(trade.status) ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          {v1OnChainProofNeeded
            ? "Waiting for the seller to submit fulfilment proof on-chain before you can release funds."
            : capabilitiesPending
              ? "Checking escrow contract version…"
              : "Available after the seller shares fulfilment in chat."}
        </Text>
      ) : null}
      {permission.buyer && openTrade && !disputed ? (
        <Button
          label={busy === "release" ? "Releasing…" : "Review fulfilment and release funds"}
          busy={busy === "release"}
          disabled={Boolean(busy) || !releaseReady}
          onPress={() => void run("release", async () => {
            if (!trade.contractAddress) throw new Error("No on-chain contract yet.");
            const caps = capabilities ?? await readDealCapabilities(trade.contractAddress);
            const { from, provider: wallet } = requireWallet();
            if (caps.releaseMode === "v1-zero-arg") {
              await releaseFunds(wallet, from, trade.contractAddress);
            } else if (caps.releaseMode === "v2-proof-hash") {
              const proof = await api<{ proofHash: string }>(`/v1/escrows/${encodeURIComponent(trade.id)}/fulfilment-proof-hash`);
              if (!/^0x[0-9a-fA-F]{64}$/.test(proof.proofHash)) throw new Error("Waiting for fulfilment proof in chat before release.");
              await releaseFunds(wallet, from, trade.contractAddress, proof.proofHash);
            } else {
              throw new Error("Could not determine the release function supported by this escrow contract.");
            }
            await signal(trade.id, "completed");
            const refreshed = await readDeal(trade.contractAddress);
            if (refreshed) setChain(refreshed);
          })}
        />
      ) : null}
      <DisputeAndCancel
        trade={trade}
        userId={userId}
        chain={chain}
        busy={busy}
        reason={reason}
        setReason={setReason}
        mode="ethereum"
        onWeb={onWeb}
        run={run}
        requireWallet={requireWallet}
      />
      {!walletReady && permission.party && openTrade ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          {isConnected ? "Connect the wallet linked to this trade on Ethereum to sign." : "Connect your Ethereum wallet to approve, fund, or release this trade."}
        </Text>
      ) : null}
    </View>
  );
}

function DisputeAndCancel({
  trade,
  userId,
  chain,
  busy,
  reason,
  setReason,
  mode,
  onWeb,
  run,
  requireWallet,
}: {
  trade: TradeRow;
  userId?: string;
  chain: ChainView | null;
  busy: string | null;
  reason: string;
  setReason: (value: string) => void;
  mode: ActionMode;
  onWeb: () => void;
  run: (name: string, work: () => Promise<void>) => Promise<void>;
  requireWallet?: () => { from: string; provider: WalletProvider };
}) {
  const { user } = useAuth();
  const actorId = userId || user?.id;
  const access = tradeDisputeAccess(trade, actorId, user?.email, chain?.state);
  const permission = tradePermissions(trade, actorId);
  const tradeOpen = !["Completed", "Resolved", "Cancelled"].includes(trade.status);
  const disputed = trade.status === "Disputed" || access.hasActiveDispute;
  const funded = chain ? chain.state === 1 || chain.state === 2 : ["Funded", "InProgress"].includes(trade.status);
  const canCancel = Boolean(permission.party && tradeOpen && !disputed && trade.contractAddress && funded);
  const buyerWaiting = Boolean(permission.buyer && chain?.buyerCancelRequested);

  async function openDispute() {
    if (!reason.trim()) throw new Error("Write what went wrong before opening a dispute.");
    if (!trade.contractAddress) throw new Error("Available after the on-chain escrow exists.");
    if (mode === "tron") {
      if (chain && ![1, 2, 5].includes(chain.state)) {
        throw new Error("The on-chain escrow must be Funded or In Progress before opening a dispute.");
      }
    } else {
      const wallet = requireWallet?.();
      if (!wallet) throw new Error("Connect the Ethereum wallet linked to this trade.");
      const view = chain ?? await readDeal(trade.contractAddress);
      if (!view || (view.state !== 5 && view.state !== 1 && view.state !== 2)) {
        throw new Error("The on-chain escrow must be Funded or In Progress before opening a dispute.");
      }
      if (view.state !== 5) await openDisputeOnChain(wallet.provider, wallet.from, trade.contractAddress);
    }
    await api(`/v1/escrows/${encodeURIComponent(trade.id)}/disputes`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setReason("");
  }

  async function withdrawDispute() {
    if (!access.openDispute) return;
    let txHash: string | undefined;
    if (mode === "ethereum") {
      const wallet = requireWallet?.();
      if (!wallet) throw new Error("Connect the wallet linked to this trade to close the on-chain dispute.");
      if (access.frozen && trade.contractAddress) {
        const receipt = await withdrawDisputeOnChain(wallet.provider, wallet.from, trade.contractAddress);
        txHash = receipt.hash;
      }
    }
    await api(`/v1/disputes/${encodeURIComponent(access.openDispute.id)}/withdraw`, {
      method: "POST",
      body: JSON.stringify(txHash ? { txHash } : {}),
    });
  }

  async function cancelTrade() {
    const wallet = requireWallet?.();
    if (!wallet || !trade.contractAddress) throw new Error("Connect the Ethereum wallet linked to this trade.");
    await requestCancel(wallet.provider, wallet.from, trade.contractAddress);
    const view = await readDeal(trade.contractAddress);
    await signal(trade.id, view?.state === 4 ? "cancelled" : "cancel-requested");
  }

  async function refuse() {
    const wallet = requireWallet?.();
    if (!wallet || !trade.contractAddress) throw new Error("Connect the Ethereum wallet linked to this trade.");
    await refuseCancel(wallet.provider, wallet.from, trade.contractAddress);
    await signal(trade.id, "cancel-refused");
  }

  const chainOnWebsite = mode !== "ethereum";

  return (
    <>
      {permission.seller && tradeOpen && !disputed && chain?.buyerCancelRequested ? (
        <Button
          label="Refuse cancel"
          tone="ghost"
          busy={busy === "refuse"}
          disabled={Boolean(busy) || !trade.contractAddress}
          onPress={() => {
            if (chainOnWebsite) onWeb();
            else void run("refuse", refuse);
          }}
        />
      ) : null}
      {canCancel && !buyerWaiting ? (
        <Button
          label={permission.seller ? "Cancel trade" : "Request cancel"}
          tone="ghost"
          busy={busy === "cancel"}
          disabled={Boolean(busy)}
          onPress={() => {
            if (chainOnWebsite) onWeb();
            else void run("cancel", cancelTrade);
          }}
        />
      ) : null}
      {permission.seller && canCancel ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          Cancel trade closes the escrow and refunds the buyer the trade amount minus a $1 cancel commission. The buyer’s $1 creation fee paid at funding is not refunded.
        </Text>
      ) : null}
      {chain?.buyerCancelRequested && tradeOpen && !disputed ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          Cancel requested. The seller can refuse it, or cancel the trade to refund the buyer (trade amount minus $1 cancel commission). The creation fee stays with the protocol.
        </Text>
      ) : null}
      {access.canOpen && mode === "website" ? (
        <Button label="Open dispute" tone="danger" onPress={onWeb} />
      ) : null}
      {access.canOpen && mode !== "website" ? (
        <>
          <Field label="Raise a dispute" value={reason} editable={!busy} maxLength={2000} onChangeText={setReason} placeholder="Describe the issue for the other party and admin." multiline />
          <Button
            label="Open dispute"
            tone="danger"
            busy={busy === "dispute"}
            disabled={Boolean(busy) || !reason.trim()}
            onPress={() => void run("dispute", openDispute)}
          />
        </>
      ) : null}
      {access.canWithdraw ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            {mode === "tron"
              ? "Settling directly? The opener can withdraw the dispute. If the resolver already froze the escrow, continue on the website so your TRON wallet can restore it."
              : "Settling directly? The party who opened this dispute can withdraw it. The wallet must sign to restore the escrow's previous on-chain state."}
          </Text>
          <Button
            label={busy === "withdraw" ? "Closing…" : "Close dispute"}
            tone="ghost"
            busy={busy === "withdraw"}
            disabled={Boolean(busy)}
            onPress={() => {
              if (mode === "tron" && access.frozen) onWeb();
              else if (mode === "website") onWeb();
              else void run("withdraw", withdrawDispute);
            }}
          />
        </>
      ) : null}
      {access.openDispute && access.party && user && !access.isDisputeOpener ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Only the party who opened this dispute can close it.</Text>
      ) : null}
    </>
  );
}

async function signal(id: string, kind: "funded" | "release-requested" | "completed" | "cancel-requested" | "cancel-refused" | "cancelled") {
  await api(`/v1/escrows/${encodeURIComponent(id)}/signals`, { method: "POST", body: JSON.stringify({ kind }) });
}
