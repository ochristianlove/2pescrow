import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { Connector } from "wagmi";
import { continueFunding, type FundingSnapshot, type PreparedFunding } from "@2pescrow/shared";
import { api } from "./api";
import { sendSavedFundingViaConnector } from "./evmContractWrite";
import { playTradeBell } from "./tradeSound";

export function useEthereumFunding(
  id: string,
  enabled: boolean,
  authHeaders: () => Record<string, string>,
  onChanged: () => Promise<void>,
  onAlert?: (message: string) => void,
) {
  const [state, setState] = useState<FundingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const syncing = useRef(false);
  const generation = useRef(0);
  const prevStage = useRef<string | null>(null);
  const currentId = useRef(id);
  currentId.current = id;
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;
  const base = `/v1/escrows/${id}/ethereum-funding`;
  const storage = `ethereum-funding:${id}`;
  const post = useCallback(<T,>(suffix: string, body: unknown) => api<T>(`${base}/${suffix}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body),
  }), [base, authHeaders]);
  const refresh = useCallback(async () => {
    if (!enabled || syncing.current) return;
    syncing.current = true;
    const epoch = generation.current;
    try {
      // A hash returned while offline can be reported later; failure preserves the cached evidence.
      const cached = localStorage.getItem(storage);
      if (cached) {
        const { attemptId, hash } = JSON.parse(cached);
        await post("report", { attemptId, hash }).then(() => localStorage.removeItem(storage)).catch(() => undefined);
      }
      const legacyHash = localStorage.getItem(`ethereum-creation:${id}`);
      if (legacyHash) {
        await post("recover", { hash: legacyHash }).then(() => localStorage.removeItem(`ethereum-creation:${id}`)).catch(() => undefined);
      }
      const next = await api<FundingSnapshot>(base, { headers: authHeaders() });
      if (generation.current === epoch && currentId.current === id) {
        if (prevStage.current && prevStage.current !== "funded" && next.stage === "funded") {
          playTradeBell("confirmed");
          onAlertRef.current?.("🔔 Escrow deposit confirmed on Ethereum! Funds are locked in the smart contract.");
          void onChanged();
        }
        prevStage.current = next.stage;
        setState(next);
        setError(null);
      }
      return next;
    } catch (e) {
      if (generation.current === epoch && currentId.current === id) setError(e instanceof Error ? e.message : "Could not check saved funding progress. Try again shortly.");
    } finally { syncing.current = false; }
  }, [id, enabled, storage, base, post, authHeaders, onChanged]);
  const isPending = busy || state?.stage === "pending";
  useEffect(() => {
    generation.current++;
    syncing.current = false;
    prevStage.current = null;
    setState(null); setError(null); setActionError(null);
    if (!enabled) return;
    void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { generation.current++; window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [enabled, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const intervalMs = isPending ? 2000 : 6000;
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, isPending, refresh]);
  const run = async (account: Address, connector: Connector | undefined) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setActionError(null);
    try {
      await continueFunding({
        get: () => api<FundingSnapshot>(base, { headers: authHeaders() }),
        prepare: (requestId, resume) => post<PreparedFunding>("prepare", { requestId, resume, buyerAddress: account }),
        report: (attemptId, body) => post("report", { attemptId, ...body }),
        send: tx => sendSavedFundingViaConnector(connector, account, tx),
        remember: async (attemptId, hash) => {
          localStorage.setItem(storage, JSON.stringify({ attemptId, hash }));
          playTradeBell("sent");
          onAlertRef.current?.(`🔔 Transaction broadcast (${hash.slice(0, 10)}…)! Funds left your wallet — confirming on Ethereum…`);
          setState((prev) => prev ? {
            ...prev,
            stage: "pending",
            message: `Transaction broadcast (${hash.slice(0, 10)}…). Waiting for Ethereum confirmation…`,
          } : prev);
        },
        progress: s => {
          if (currentId.current === id) {
            if (prevStage.current !== "funded" && s.stage === "funded") {
              playTradeBell("confirmed");
              onAlertRef.current?.("🔔 Escrow deposit confirmed on Ethereum! Funds are locked in the smart contract.");
            }
            prevStage.current = s.stage;
            setState(s);
          }
        },
        requestId: () => crypto.randomUUID(), pause: () => new Promise(resolve => setTimeout(resolve, 1500)),
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The wallet request stopped. Your saved progress will be checked before continuing.");
    } finally {
      lock.current = false; setBusy(false);
      await refresh(); await onChanged();
    }
  };
  const recover = async (hash: string) => { await post("recover", { hash }); localStorage.removeItem(`ethereum-creation:${id}`); await refresh(); await onChanged(); };
  return { state, error: actionError || error, busy, refresh, run, recover };
}
