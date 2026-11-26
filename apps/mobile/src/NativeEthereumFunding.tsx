import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Vibration, View } from "react-native";
import { formatEther } from "ethers";
import { continueFunding, fundingStepLabel, sendPreparedFundingTransaction, type FundingSnapshot, type PreparedFunding } from "../../../packages/shared/src/funding";
import { api } from "./api";
import { disconnectWallet, isDeadWalletSessionError, openConnectedWalletApp } from "./appkit";
import { Text } from "./language";
import { Button, Field, Notice } from "./ui";
import { colors } from "./theme";
import { formatAmount } from "./format";
import type { TradeRow } from "./types";
import type { WalletProvider } from "./tradeChain";

export function NativeEthereumFunding({ trade, requireWallet, onChanged }: {
  trade: TradeRow; requireWallet: () => Promise<{ from: string; provider: WalletProvider }>; onChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<FundingSnapshot | null>(null);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState(false);
  const [hash, setHash] = useState("");
  const lock = useRef(false);
  const syncing = useRef(false);
  const mounted = useRef(true);
  const prevStage = useRef<string | null>(null);
  const idRef = useRef(trade.id);
  idRef.current = trade.id;
  const base = `/v1/escrows/${encodeURIComponent(trade.id)}/ethereum-funding`;
  const storage = `ethereum-funding:${trade.id}`;
  const post = useCallback(<T,>(suffix: string, body: unknown) => api<T>(`${base}/${suffix}`, { method: "POST", body: JSON.stringify(body) }), [base]);
  const refresh = useCallback(async () => {
    if (syncing.current || !trade.buyerAddress || !trade.sellerAddress) return;
    syncing.current = true;
    try {
      const cached = await AsyncStorage.getItem(storage);
      if (cached) {
        const body = JSON.parse(cached);
        await post("report", body).then(() => AsyncStorage.removeItem(storage)).catch(() => undefined);
      }
      const next = await api<FundingSnapshot>(base);
      if (mounted.current && idRef.current === trade.id) {
        if (prevStage.current && prevStage.current !== "funded" && next.stage === "funded") {
          Vibration.vibrate([0, 60, 70, 90]);
          setLiveAlert("🔔 Deposit confirmed on Ethereum! Funds are secured in escrow.");
          void onChanged();
        }
        prevStage.current = next.stage;
        setState(next);
      }
      return next;
    } catch (e) {
      if (mounted.current && idRef.current === trade.id) setError(e instanceof Error ? e.message : "Could not check saved payment progress.");
    } finally { syncing.current = false; }
  }, [base, post, storage, trade.id, trade.buyerAddress, trade.sellerAddress, onChanged]);
  const isPending = busy || state?.stage === "pending";
  useEffect(() => {
    mounted.current = true; prevStage.current = null; setState(null); setLiveAlert(null); setError(null);
    void refresh();
    const listener = AppState.addEventListener("change", value => { if (value === "active") void refresh(); });
    return () => { mounted.current = false; listener.remove(); };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, isPending ? 1500 : 3500);
    return () => clearInterval(timer);
  }, [isPending, refresh]);

  async function run() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const { from, provider } = await requireWallet();
      if (from.toLowerCase() !== trade.buyerAddress?.toLowerCase()) throw new Error("Connect the buyer wallet linked to this trade.");
      await continueFunding({
        get: () => api<FundingSnapshot>(base),
        prepare: (requestId, resume) => post<PreparedFunding>("prepare", { requestId, resume, buyerAddress: from }),
        report: (attemptId, body) => post("report", { attemptId, ...body }),
        remember: async (attemptId, txHash) => {
          await AsyncStorage.setItem(storage, JSON.stringify({ attemptId, hash: txHash }));
          Vibration.vibrate([0, 45, 55, 45]);
          if (mounted.current && idRef.current === trade.id) {
            setLiveAlert(`🔔 Transaction broadcast (${txHash.slice(0, 10)}…)! Funds left your wallet — confirming on Ethereum…`);
            setState((prev) => prev ? {
              ...prev,
              stage: "pending",
              message: `Transaction broadcast (${txHash.slice(0, 10)}…). Waiting for Ethereum confirmation…`,
            } : prev);
          }
        },
        send: async tx => {
          let timeout: ReturnType<typeof setTimeout> | undefined;
          let openWalletTimer: ReturnType<typeof setTimeout> | undefined;
          if (mounted.current && idRef.current === trade.id) {
            setLiveAlert("Opening your wallet app — review and confirm the request in your wallet…");
          }
          try {
            openWalletTimer = setTimeout(() => openConnectedWalletApp(), 250);
            return await Promise.race([
              sendPreparedFundingTransaction({ request: args => provider.request(args, "eip155:1") }, from, tx),
              new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Your wallet did not return a response in time. Open your wallet app to check for a pending prompt, or tap Continue saved wallet request to try again.")), 75_000); }),
            ]);
          } catch (sendErr) {
            if (isDeadWalletSessionError(sendErr)) {
              await disconnectWallet();
              throw new Error("Your wallet disconnected while inactive. Reconnect your wallet, then tap Continue saved wallet request.");
            }
            throw sendErr;
          } finally {
            if (timeout) clearTimeout(timeout);
            if (openWalletTimer) clearTimeout(openWalletTimer);
          }
        },
        progress: next => {
          if (mounted.current && idRef.current === trade.id) {
            if (prevStage.current !== "funded" && next.stage === "funded") {
              Vibration.vibrate([0, 60, 70, 90]);
              setLiveAlert("🔔 Deposit confirmed on Ethereum! Funds are secured in escrow.");
            }
            prevStage.current = next.stage;
            setState(next);
          }
        },
        // crypto.getRandomValues is initialized by react-native-get-random-values in index.js.
        requestId: () => {
          const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
          bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
          const value = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
          return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
        },
        pause: () => new Promise(resolve => setTimeout(resolve, 1500)),
      });
    } catch (e) {
      if (mounted.current) {
        setLiveAlert(null);
        setError(e instanceof Error ? e.message : "The wallet request stopped. Your progress is saved.");
      }
    } finally {
      lock.current = false; if (mounted.current) setBusy(false);
      await refresh(); await onChanged();
    }
  }

  async function recover() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await post("recover", { hash: hash.trim() }); await refresh(); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not verify this creation transaction."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <View style={{ gap: 12 }}>
    <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Payment progress</Text>
    {liveAlert ? (
      <View style={{ backgroundColor: "rgba(62, 207, 142, 0.14)", borderColor: colors.accent, borderWidth: 1, borderRadius: 12, padding: 12 }}>
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>{liveAlert}</Text>
      </View>
    ) : null}
    <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 16, lineHeight: 24 }}>{state?.message || "Checking saved payment progress…"}</Text>
    {!state && error ? <Notice text={error} /> : null}
    {state && <>
      <View style={{ backgroundColor: "rgba(62, 207, 142, 0.05)", borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>Escrow Contract Status</Text>
        <Text style={{ color: state.contractAddress ? colors.accent : colors.muted }}>
          {state.contractAddress ? `Escrow created (${state.contractAddress.slice(0, 8)}...${state.contractAddress.slice(-6)})` : "Escrow creation pending"}
        </Text>
        {state.contractAddress ? (
          <Button tone="ghost" label="View escrow contract on Etherscan ↗" onPress={() => void Linking.openURL(`https://etherscan.io/address/${state.contractAddress}`)} />
        ) : null}

        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />

        <Text style={{ color: colors.text, fontWeight: "600" }}>Token Approval ({state.tokenSymbol})</Text>
        <Text style={{ color: state.approvalConfirmed ? colors.accent : colors.muted }}>
          {state.approvalConfirmed ? "Token approval confirmed — permission to spend granted" : "Token approval checked before deposit"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          ℹ 0 ETH is normal for token approval. It grants permission to deposit ${state.tokenSymbol}. Network fees (gas) are separate.
        </Text>

        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />

        <Text style={{ color: colors.text, fontWeight: "600" }}>Escrow Deposit</Text>
        <Text style={{ color: state.stage === "funded" ? colors.accent : colors.muted }}>
          {state.stage === "funded" ? "Deposit confirmed — trade funds are secured in escrow" : state.stage === "closed" ? "Trade closed — no further deposit" : "Deposit not yet confirmed"}
        </Text>
        <Text style={{ color: colors.gold, fontWeight: "600" }}>
          Trade deposit: {formatAmount(state.amountAtomic)} {state.tokenSymbol} · Creation fee: {formatAmount(state.feeAtomic)} {state.tokenSymbol}
        </Text>
      </View>

      {error ? <Notice text={error} /> : null}
      {!["funded", "closed"].includes(state.stage) && (
        <View style={{ gap: 6 }}>
          <Button
            busy={busy}
            disabled={!state.canContinue}
            label={state.active ? "Continue saved wallet request" : state.contractAddress ? "Resume funding existing escrow" : "Start funding"}
            onPress={() => void run()}
          />
          {!state.canContinue ? (
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              Waiting for your pending Ethereum transaction to confirm before continuing. Tap "Check payment status" in a few seconds.
            </Text>
          ) : state.active?.status === "uncertain" ? (
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              The previous wallet prompt did not finish. Tap above to reopen your wallet and send the saved request again.
            </Text>
          ) : null}
        </View>
      )}

      {state.attempts.length > 0 ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Wallet Transactions</Text>
          {state.attempts.map(a => (
            <View key={a.id} style={{ padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 10, gap: 4 }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{fundingStepLabel(a.kind)}: {a.status}</Text>
              {a.gasPaidWei && <Text style={{ color: colors.muted, fontSize: 12 }}>{formatEther(a.gasPaidWei)} ETH network fee</Text>}
              {a.hash && <Button tone="ghost" label="View transaction on Etherscan ↗" onPress={() => { void Linking.openURL(`https://etherscan.io/tx/${a.hash}`); }} />}
            </View>
          ))}
        </View>
      ) : null}
    </>}
    <Button tone="ghost" disabled={busy} label="Check payment status" onPress={() => { setError(null); void refresh(); }} />
    <Button tone="ghost" disabled={busy} label="Support recovery" onPress={() => setSupport(!support)} />
    {support && (
      <View style={{ backgroundColor: "rgba(56, 189, 248, 0.08)", borderColor: "rgba(56, 189, 248, 0.35)", borderWidth: 1, borderRadius: 12, padding: 14, marginVertical: 8, gap: 10 }}>
        <Text style={{ color: "#38bdf8", fontSize: 13, fontWeight: "600", lineHeight: 19 }}>
          For older attempts that were not saved, support can help find the creation transaction recovery that does not move forward. Recovery does not move funds or request wallet signatures.
        </Text>
        <Field label="Creation transaction hash" value={hash} onChangeText={setHash} autoCapitalize="none" autoCorrect={false} />
        <Button disabled={busy || !hash.trim()} label="Recover existing escrow" onPress={() => void recover()} />
      </View>
    )}
  </View>;
}
