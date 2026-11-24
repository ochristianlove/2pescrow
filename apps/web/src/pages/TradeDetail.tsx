import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { sha256 } from "viem";
import { mainnet } from "viem/chains";
import {
  escrowDealAbi,
  escrowDealV1ReleaseAbi,
  escrowDealV2ReleaseAbi,
  escrowFactoryAbi,
  inspectEscrowDealCapabilities,
  type EscrowDealCapabilities,
} from "@2pescrow/shared";
import { api, apiBase, apiUpload, formatAmount, shortAddr } from "../lib/api";
import { useLiveTradeUpdates } from "../lib/useLiveTradeUpdates";
import { playNotificationBell, useLiveNotifications } from "../lib/liveNotifications";
import { useRouter } from "../lib/router";
import { FlowStepper } from "../components/FlowStepper";
import { StatusBadge } from "../components/StatusBadge";
import type { Dispute, Escrow, TradeMessage, WalletConfig } from "../lib/types";
import { TronChainSeparationNotice } from "../components/TronChainSeparationNotice";
import { ChainBadge } from "../components/ChainBadge";
import { usePlatformSettings } from "../lib/platformSettings";
import { useTronWallet } from "../lib/tron/TronWalletContext";
import { fetchTrc20Allowance, tronApproveTrc20, tronCreateAndFundEscrow, tronFactoryVersion as getTronFactoryVersion, tronDealAction, TRON_DEAL_ABI } from "../lib/tron/tronLink";
import { partyMatches } from "../lib/partyMatch";
import { writeContractViaConnector } from "../lib/evmContractWrite";
import { waitForSuccessfulReceipt } from "../lib/ethereumTransaction";
import { resolveEthereumFundingTokenAddress } from "../lib/ethereumFundingToken";
import {
  type DeployFundingGasPlan,
} from "../lib/ethereumFundingGas";
import { normalizeEvmFundingError } from "../lib/evmWalletErrors";
import { requestSwitchToEthereum } from "../lib/switchToEthereum";
import { ConnectEvmWalletButton } from "../lib/evmWalletPicker";
import { EvmWrongChainBanner } from "../components/EvmWrongChainBanner";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language";
import { CopyButton } from "../components/CopyButton";
import { TradeRoomChat } from "../components/TradeRoomChat";
import { SocialMark, socialLinks } from "../components/CommunityLinks";
import { formatTradeWindowHours } from "../components/TradeWindowPicker";
import { eventLabel } from "../lib/eventLabel";
import { TradeTermsSnippet } from "../components/TradeTermsSnippet";
import { userDisplayLabel } from "../lib/userDisplay";
import { TradeRoleTags } from "../components/TradeRoleTags";
import { EthereumFundingProgress } from "../components/EthereumFundingProgress";
import { useEthereumFunding } from "../lib/useEthereumFunding";
import { playTradeBell } from "../lib/tradeSound";

const erc20ReadAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const erc20ApproveAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const factoryFeeAbi = [{ type: "function", name: "creationFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;
const CHAIN_STATUS = ["Created", "Funded", "InProgress", "Completed", "Cancelled", "Disputed", "Resolved"] as const;

type ChainView = { state: number | null; buyerCancelRequested: boolean; proofSubmitted: boolean };

function TradeAction({
  label,
  hint,
  available,
  busy,
  onClick,
  onBlockedClick,
  className,
  file,
  onFile,
}: {
  label: string;
  hint?: string;
  available: boolean;
  busy?: boolean;
  onClick?: () => void;
  /** Fired when the user clicks while the action is unavailable (not while busy). */
  onBlockedClick?: (hint?: string) => void;
  className?: string;
  file?: boolean;
  onFile?: (file: File) => void;
}) {
  const locked = !available || Boolean(busy);
  return (
    <div className="trade-action">
      {file ? (
        <label className={`file-btn${className ? ` ${className}` : ""}${locked ? " is-locked" : ""}`}>
          {label}
          <input
            type="file"
            hidden
            disabled={locked}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked && available) onFile?.(picked);
            }}
          />
        </label>
      ) : (
        <button
          type="button"
          className={`${className ?? ""}${!available ? " is-locked" : ""}`.trim()}
          disabled={Boolean(busy)}
          title={!available ? hint : undefined}
          onClick={() => {
            if (busy) return;
            if (!available) {
              onBlockedClick?.(hint);
              return;
            }
            onClick?.();
          }}
        >
          {label}
        </button>
      )}
      {!available && hint ? <p className="trade-action-hint">{hint}</p> : null}
    </div>
  );
}

function proofIsSet(value: unknown) {
  const hex = typeof value === "string" ? value : "";
  return /^0x[0-9a-fA-F]+$/.test(hex) && !/^0x0+$/.test(hex);
}

const STATUS_RANK: Record<string, number> = {
  AwaitingSeller: 0,
  AwaitingFunding: 0,
  Created: 0,
  Funded: 1,
  InProgress: 2,
  Completed: 3,
  Cancelled: 3,
  Disputed: 3,
  Resolved: 4,
};

function statusRank(status: string) {
  return STATUS_RANK[status] ?? 0;
}

function mergeTradeStatus(dbStatus: string, chainState: number | null | undefined): string {
  if (chainState === null || chainState === undefined || chainState < 0 || chainState >= CHAIN_STATUS.length) {
    return dbStatus;
  }
  const chainStatus = CHAIN_STATUS[chainState];
  return statusRank(chainStatus) > statusRank(dbStatus) ? chainStatus : dbStatus;
}

function isFundedOrInProgress(status: string) {
  return status === "Funded" || status === "InProgress";
}

/** Off-chain dispute can be raised while escrow holds funds or shortly after release (staff review). */
function isDisputeEligibleStatus(status: string) {
  return status === "Funded" || status === "InProgress" || status === "Completed";
}

/** DB status can lag after funding; chain state 1+ means Funded on-chain. */
function escrowFundedForDispute(
  effectiveStatus: string,
  hasOnChainContract: boolean,
  chainState: number | null | undefined,
): boolean {
  if (isDisputeEligibleStatus(effectiveStatus)) return true;
  if (!hasOnChainContract) return false;
  if (chainState != null && chainState >= 1 && chainState <= 2) return true;
  return effectiveStatus === "Created" || effectiveStatus === "AwaitingFunding";
}

const ACTIVE_DISPUTE_STATUSES = new Set(["open", "ruled_pending_appeal", "appealed", "appeal_decided", "final_ruling"]);

function latestDispute(disputes: Dispute[] | undefined): Dispute | undefined {
  return disputes?.find((item) => ACTIVE_DISPUTE_STATUSES.has(item.status)) || disputes?.[0];
}

async function proofHashFromFile(file: File): Promise<`0x${string}`> {
  return sha256(new Uint8Array(await file.arrayBuffer()));
}

function FundingMoney({
  atomic,
  token,
  loading,
  emphasize,
}: {
  atomic?: string;
  token: string;
  loading?: boolean;
  emphasize?: boolean;
}) {
  const { t } = useLanguage();
  if (loading) {
    return <span className="funding-balance-loading">{t("Loading…")}</span>;
  }
  const amount = formatAmount(atomic || "0");
  const inner = (
    <span className="funding-balance-value">
      <span className="funding-balance-token">{token}</span>
      <span className="funding-balance-amount">{amount}</span>
    </span>
  );
  return emphasize ? <strong className="funding-balance-strong">{inner}</strong> : inner;
}

export function TradeDetailPage({ id }: { id: string }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const tron = useTronWallet();
  const { settings } = usePlatformSettings();
  const { navigate } = useRouter();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { user, authHeaders } = useAuth();
  const { t, language } = useLanguage();
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingCreationHash, setPendingCreationHash] = useState("");
  const [recoveryHash, setRecoveryHash] = useState<string | null>(null);
  const [cfg, setCfg] = useState<WalletConfig | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [downloadingRecord, setDownloadingRecord] = useState(false);
  const [buyerTokenBalance, setBuyerTokenBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [creationFeeAtomic, setCreationFeeAtomic] = useState(1_000_000n);
  const [tronFactoryVersion, setTronFactoryVersion] = useState<number | null>(null);
  const [chainView, setChainView] = useState<ChainView>({ state: null, buyerCancelRequested: false, proofSubmitted: false });
  const [dealCapabilities, setDealCapabilities] = useState<EscrowDealCapabilities | null>(null);
  const capabilitiesCache = useRef<Map<string, EscrowDealCapabilities>>(new Map());
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [tronWalletNotice, setTronWalletNotice] = useState<string | null>(null);
  const actionLock = useRef(false);
  const lastSyncedChainState = useRef<number | null>(null);
  const chainViewRef = useRef(chainView);
  chainViewRef.current = chainView;
  const tradeActivityReady = useRef(false);
  const prevTradeStatus = useRef<string | undefined>(undefined);
  const prevTradeEventIds = useRef<Set<string>>(new Set());
  const prevTradeMessageIds = useRef<Set<string>>(new Set());
  const prevSellerWallet = useRef<string | null | undefined>(undefined);
  const prevSellerJoined = useRef<boolean | undefined>(undefined);
  const { trackEscrowId } = useLiveNotifications();

  const load = useCallback(async () => {
    try {
      const e = await api<Escrow>(`/v1/escrows/${id}`, { headers: authHeaders() });
      setEscrow(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not found");
    }
  }, [id, authHeaders]);

  const { live: liveUpdates } = useLiveTradeUpdates(load, {
    escrowId: id,
    enabled: Boolean(user),
    pollMs: 3_000,
    onEvent: (event) => {
      if (event === "trade:funding-submitted") {
        playTradeBell("sent");
        setLiveNotice(t("🔔 Deposit transaction sent — confirming on Ethereum…"));
      } else if (event === "trade:funded") {
        playTradeBell("confirmed");
        setLiveNotice(t("🔔 Escrow funded on Ethereum! Funds are locked in the smart contract."));
      } else if (event === "trade:release-requested") {
        playTradeBell("update");
        setLiveNotice(t("🔔 Seller confirmed fulfilment — ready for buyer review and release."));
      } else if (event === "trade:completed") {
        playTradeBell("confirmed");
        setLiveNotice(t("🔔 Trade completed! Funds have been released on-chain."));
      } else if (event === "dispute:opened" || event === "dispute:resolved") {
        playTradeBell("update");
      }
    },
  });

  useEffect(() => {
    trackEscrowId(id);
  }, [id, trackEscrowId]);

  useEffect(() => {
    lastSyncedChainState.current = null;
    setChainView({ state: null, buyerCancelRequested: false, proofSubmitted: false });
    setDealCapabilities(null);
    setError(null);
    try {
      const pending = localStorage.getItem(`ethereum-creation:${id}`) || "";
      setPendingCreationHash(pending);
      setRecoveryHash(pending || null);
    } catch {
      setPendingCreationHash("");
      setRecoveryHash(null);
    }
  }, [id]);

  useEffect(() => {
    tradeActivityReady.current = false;
    prevTradeStatus.current = undefined;
    prevTradeEventIds.current = new Set();
    prevTradeMessageIds.current = new Set();
    prevSellerJoined.current = undefined;
    prevSellerWallet.current = undefined;
  }, [id]);

  useEffect(() => {
    load();
    api<WalletConfig>("/v1/config/wallets").then(setCfg).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, user]);

  const isTronEscrow = escrow?.chain === "tron";
  const isLegacyEvm = !!escrow && escrow.chain !== "tron" && escrow.chain !== "ethereum";
  const fundingTokenAddress =
    !escrow || isTronEscrow || isLegacyEvm
      ? null
      : resolveEthereumFundingTokenAddress(escrow.tokenSymbol, escrow.tokenAddress, cfg);
  const connectedParty = isTronEscrow ? tron.address : !isLegacyEvm && chainId === mainnet.id ? address : undefined;
  const isTradeAdmin = escrow?.partyRole === "admin";
  const sessionPartyRole = escrow?.partyRole === "buyer" || escrow?.partyRole === "seller"
    ? escrow.partyRole
    : user?.id && escrow?.buyerUserId === user.id
      ? "buyer"
      : user?.id && escrow?.sellerUserId === user.id
        ? "seller"
        : null;
  const participatesAsBuyer =
    !!escrow
    && !isTradeAdmin
    && (sessionPartyRole ? sessionPartyRole === "buyer" : partyMatches(escrow.chain, escrow.buyerAddress || "", connectedParty));
  const participatesAsSeller =
    !!escrow
    && !isTradeAdmin
    && (sessionPartyRole ? sessionPartyRole === "seller" : partyMatches(escrow.chain, escrow.sellerAddress || "", connectedParty));
  const isBuyer = participatesAsBuyer;
  const isSeller = participatesAsSeller;
  const isTradeParticipant = participatesAsBuyer || participatesAsSeller;
  const isCodeTrade = !!escrow?.tradeCode;
  const managedFunding = useEthereumFunding(
    id,
    Boolean(user && isBuyer && isCodeTrade && escrow?.chain === "ethereum" && escrow?.buyerAddress && escrow?.sellerAddress),
    authHeaders,
    load,
    (alertMsg) => setLiveNotice(alertMsg),
  );
  async function startManagedFunding() {
    if (!address || chainId !== mainnet.id || !isBuyer) { setError("Connect the buyer wallet on Ethereum mainnet."); return; }
    await managedFunding.run(address, connector);
  }
  const chainName = chainView.state !== null && chainView.state >= 0 && chainView.state < CHAIN_STATUS.length ? CHAIN_STATUS[chainView.state] : undefined;
  const hasActiveDispute = Boolean(escrow?.disputes?.some((item) => ACTIVE_DISPUTE_STATUSES.has(item.status)));
  const mergedStatus = escrow ? mergeTradeStatus(escrow.status, chainView.state) : "";
  const displayStatus = escrow
    ? isCodeTrade && !hasActiveDispute && escrow.status !== "Disputed" && mergedStatus === "Disputed"
      ? escrow.status
      : mergedStatus
    : "";
  const effectiveStatus = displayStatus;
  const fundedOrProgress = isFundedOrInProgress(effectiveStatus);
  const chainActive = chainView.state === 1 || chainView.state === 2;
  const isEthereumV1 = !isTronEscrow && !isLegacyEvm && dealCapabilities?.requiresOnChainSellerProof === true;
  const isEthereumCapabilitiesPending = !isTronEscrow && !isLegacyEvm && Boolean(escrow?.contractAddress) && dealCapabilities === null;
  const v1OnChainProofNeeded = isEthereumV1 && chainView.state === 1;
  const fulfilmentReady =
    effectiveStatus === "InProgress"
    || Boolean(escrow?.proofHash)
    || (escrow?.messages || []).some((m) => m.kind === "fulfilment" && m.fileName);
  const releaseReady =
    Boolean(escrow?.contractAddress)
    && effectiveStatus !== "Disputed"
    && (isTronEscrow
      ? fulfilmentReady && chainActive
      : dealCapabilities?.releaseMode === "v1-zero-arg"
        ? chainView.state === 2
        : dealCapabilities?.releaseMode === "v2-proof-hash"
          ? fulfilmentReady && chainActive
          : false);
  const displayToken = escrow?.tokenSymbol === "TRON_USDT" ? "USDT" : escrow?.tokenSymbol || "";

  useEffect(() => {
    if (!escrow || !isCodeTrade || !(isBuyer || isSeller)) return;

    const events = escrow.events || [];
    const messages = escrow.messages || [];
    const eventIds = new Set(events.map((ev) => ev.id));
    const messageIds = new Set(messages.map((msg) => msg.id));
    const joined = Boolean(escrow.sellerUserId);
    const sellerAddr = escrow.sellerAddress ?? null;

    if (tradeActivityReady.current) {
      let shouldRing = false;

      if (prevTradeStatus.current !== undefined && prevTradeStatus.current !== escrow.status) {
        shouldRing = true;
      }
      if (!shouldRing) {
        for (const id of eventIds) {
          if (!prevTradeEventIds.current.has(id)) {
            shouldRing = true;
            break;
          }
        }
      }
      if (!shouldRing) {
        for (const msg of messages) {
          if (!prevTradeMessageIds.current.has(msg.id)) {
            shouldRing = true;
            break;
          }
        }
      }

      if (shouldRing) playNotificationBell();

      if (prevSellerJoined.current !== undefined && !prevSellerJoined.current && joined) {
        setLiveNotice(t("Seller joined this trade. Waiting for them to link a receiving wallet."));
      }
      if (prevSellerWallet.current !== undefined && !prevSellerWallet.current && sellerAddr) {
        setLiveNotice(
          isBuyer
            ? t("Seller linked their receiving wallet. You can create the on-chain escrow when ready.")
            : t("Your receiving wallet is linked on this trade."),
        );
      }
    }

    tradeActivityReady.current = true;
    prevTradeStatus.current = escrow.status;
    prevTradeEventIds.current = eventIds;
    prevTradeMessageIds.current = messageIds;
    prevSellerJoined.current = joined;
    prevSellerWallet.current = sellerAddr;
  }, [
    escrow,
    isCodeTrade,
    isBuyer,
    isSeller,
    user?.id,
    t,
    escrow?.status,
    escrow?.sellerUserId,
    escrow?.sellerAddress,
    escrow?.events,
    escrow?.messages,
  ]);
  const requiredFunding = escrow ? BigInt(escrow.amountAtomic) + creationFeeAtomic : 0n;

  useEffect(() => {
    if (!escrow || !isCodeTrade || !isBuyer) {
      setBuyerTokenBalance(null);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }
    if (!connectedParty) {
      setBuyerTokenBalance(null);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }
    if (isTronEscrow) {
      setBalanceLoading(false);
      if (escrow.tokenSymbol === "TRON_USDT") setBuyerTokenBalance(tron.usdtBalanceAtomic);
      else setBalanceError("Tron USDT balance is not available for this trade.");
      return;
    }
    if (!publicClient) {
      setBalanceLoading(true);
      return;
    }
    if (!fundingTokenAddress) {
      setBuyerTokenBalance(null);
      setBalanceLoading(false);
      setBalanceError("Token contract address is not configured.");
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    setBalanceError(null);
    publicClient.readContract({
      address: fundingTokenAddress,
      abi: erc20ReadAbi,
      functionName: "balanceOf",
      args: [connectedParty as `0x${string}`],
    }).then((balance) => {
      if (!cancelled) setBuyerTokenBalance(balance);
    }).catch((e: unknown) => {
      if (!cancelled) {
        setBuyerTokenBalance(null);
        setBalanceError(e instanceof Error ? e.message : "Could not read token balance");
      }
    }).finally(() => {
      if (!cancelled) setBalanceLoading(false);
    });
    return () => { cancelled = true; };
  }, [escrow, isCodeTrade, isBuyer, connectedParty, isTronEscrow, publicClient, tron.usdtBalanceAtomic, fundingTokenAddress]);

  useEffect(() => {
    if (!escrow || !isCodeTrade) return;
    let cancelled = false;
    if (isTronEscrow && tron.tronWeb) {
      const factory = settings?.tronFactoryAddress || cfg?.tronFactoryAddress;
      if (!factory) return;
      (async () => {
        try {
          const contract = await tron.tronWeb!.contract(factoryFeeAbi as unknown as unknown[], factory);
          const instance = await contract.at(factory);
          const raw = await (instance as unknown as { creationFee: () => { call: () => Promise<unknown> } }).creationFee().call();
          if (!cancelled) setCreationFeeAtomic(BigInt(String(raw)));
        } catch { /* Keep the contract's default fee estimate until it can be read. */ }
      })();
    } else if (publicClient) {
      const factory = settings?.factoryAddress || cfg?.factoryAddress;
      if (!factory || !/^0x[0-9a-fA-F]{40}$/.test(factory)) return;
      publicClient.readContract({ address: factory as `0x${string}`, abi: factoryFeeAbi, functionName: "creationFee" })
        .then((fee) => { if (!cancelled) setCreationFeeAtomic(fee); })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [escrow, isCodeTrade, isTronEscrow, tron.tronWeb, settings?.tronFactoryAddress, settings?.factoryAddress, cfg?.tronFactoryAddress, cfg?.factoryAddress, publicClient]);

  useEffect(() => {
    if (!isTronEscrow || !isCodeTrade) return;
    const factory = settings?.tronFactoryAddress || cfg?.tronFactoryAddress;
    if (!factory || !tron.tronWeb) {
      setTronFactoryVersion(null);
      return;
    }
    let cancelled = false;
    setTronFactoryVersion(null);
    void getTronFactoryVersion(tron.tronWeb, factory).then((version) => {
      if (!cancelled) setTronFactoryVersion(version);
    });
    return () => { cancelled = true; };
  }, [isTronEscrow, isCodeTrade, tron.tronWeb, settings?.tronFactoryAddress, cfg?.tronFactoryAddress]);

  const loadDealCapabilities = useCallback(async (contractAddress: string): Promise<EscrowDealCapabilities> => {
    const key = contractAddress.toLowerCase();
    const cached = capabilitiesCache.current.get(key);
    if (cached && cached.releaseMode !== "unknown") {
      setDealCapabilities((current) => current ?? cached);
      return cached;
    }
    if (!publicClient) {
      throw new Error("The Ethereum RPC is not ready.");
    }
    const caps = await inspectEscrowDealCapabilities(contractAddress, (addr) => publicClient.getBytecode({ address: addr }));
    if (caps.releaseMode !== "unknown") {
      capabilitiesCache.current.set(key, caps);
    }
    setDealCapabilities(caps);
    return caps;
  }, [publicClient]);

  const readChainView = useCallback(async (): Promise<ChainView | null> => {
    if (!escrow?.contractAddress) return null;
    try {
      if (escrow.chain === "tron") {
        if (!tron.tronWeb) return null;
        const bound = await tron.tronWeb.contract(TRON_DEAL_ABI, escrow.contractAddress);
        const at = await bound.at(escrow.contractAddress);
        const state = Number(await at.state().call());
        const buyerCancelRequested = Boolean(await at.buyerCancelRequested().call());
        const proof = await at.deliveryProofHash().call();
        const view = { state: Number.isNaN(state) ? null : state, buyerCancelRequested, proofSubmitted: proofIsSet(proof) };
        setChainView(view);
        applyChainStatus(view);
        return view;
      }
      if (!publicClient) return null;
      const address = escrow.contractAddress as `0x${string}`;
      const [state, buyerCancelRequested, proof] = await Promise.all([
        publicClient.readContract({ address, abi: escrowDealAbi, functionName: "state" }),
        publicClient.readContract({ address, abi: escrowDealAbi, functionName: "buyerCancelRequested" }),
        publicClient.readContract({ address, abi: escrowDealAbi, functionName: "deliveryProofHash" }),
        loadDealCapabilities(address).catch(() => null),
      ]);
      const view = { state: Number(state), buyerCancelRequested: Boolean(buyerCancelRequested), proofSubmitted: proofIsSet(proof) };
      setChainView(view);
      applyChainStatus(view);
      return view;
    } catch {
      return null;
    }
  }, [escrow?.contractAddress, escrow?.chain, publicClient, tron.tronWeb, loadDealCapabilities]);

  useEffect(() => {
    if (!escrow?.contractAddress) return;
    void readChainView();
    const timer = window.setInterval(() => void readChainView(), 8000);
    return () => window.clearInterval(timer);
  }, [escrow?.contractAddress, escrow?.updatedAt, readChainView]);

  async function signalTrade(kind: "cancel-requested" | "cancel-refused" | "cancelled" | "funded" | "release-requested" | "completed") {
    if (!user) return;
    await api(`/v1/escrows/${id}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ kind }),
    }).catch(() => undefined);
  }

  async function persistChainStateToApi(chainState: number) {
    if (!user || lastSyncedChainState.current === chainState) return;
    lastSyncedChainState.current = chainState;
    const dbRank = statusRank(escrow?.status ?? "");
    if (chainState === 1 && dbRank < statusRank("Funded")) await signalTrade("funded");
    else if (chainState === 2 && dbRank < statusRank("InProgress")) await signalTrade("release-requested");
    else if (chainState === 3 && dbRank < statusRank("Completed")) await signalTrade("completed");
  }

  function applyChainStatus(view: ChainView | null) {
    if (!view || view.state === null) return;
    const name = CHAIN_STATUS[view.state];
    if (!name) return;
    setEscrow((current) => {
      if (!current) return current;
      const merged = mergeTradeStatus(current.status, view.state);
      return merged === current.status ? current : { ...current, status: merged as Escrow["status"] };
    });
    if (view.state >= 1 && view.state <= 3) {
      void persistChainStateToApi(view.state);
    }
  }

  async function chain(fn: "fund" | "approveRelease" | "requestCancel" | "refuseCancel" | "openDispute" | "withdrawDispute" | "submitProof", args: unknown[] = []) {
    if (fn === "fund" && !isTronEscrow) { await startManagedFunding(); return; }
    if (
      isTronEscrow && isCodeTrade
      && escrow?.disputes?.some((item) => item.status === "open")
      && ["approveRelease", "requestCancel", "refuseCancel", "submitProof"].includes(fn)
    ) {
      throw new Error("Trade actions are paused while the resolver secures the open dispute.");
    }
    if (actionLock.current) {
      throw new Error("Another wallet action is still in progress. Wait for it to finish, then try again.");
    }
    if (!escrow?.contractAddress) {
      const message = "No on-chain contract yet. The buyer can deploy after both wallets are linked.";
      setError(message);
      throw new Error(message);
    }
    actionLock.current = true;
    setBusy(true);
    let fundingGasBudgetWei: bigint | undefined;
    try {
      if (fn === "fund") {
        const current = await readChainView();
        if (current?.state !== 0) {
          throw new Error(current
            ? "This escrow is no longer waiting for its first deposit. Refresh the trade before taking another action."
            : "Could not verify the escrow state. Refresh the trade and try again.");
        }
      }
      if (isTronEscrow) {
        if (!tron.tronWeb || !tron.signer || !tron.address) throw new Error("Connect a TRON wallet to sign this transaction.");
        if (fn === "fund") {
          const total = (BigInt(escrow.amountAtomic) + creationFeeAtomic).toString();
          const tokenAddress = settings?.tronUsdtAddress || cfg?.tokens.TRON_USDT;
          if (!tokenAddress) throw new Error("Set the Tron USDT token address in Admin before funding.");
          const tradeUsdt = formatAmount(escrow.amountAtomic);
          const feeUsdt = formatAmount(creationFeeAtomic.toString());
          const totalUsdt = formatAmount(total);
          setTronWalletNotice(
            `Approving ${totalUsdt} USDT (${tradeUsdt} trade + ${feeUsdt} creation fee). The wallet amount line stays 0 TRX because this step sends no TRX. Any TRX figure is the network fee.`,
          );
          await tronApproveTrc20(
            tron.tronWeb,
            tron.signer,
            tron.address,
            tokenAddress,
            escrow.contractAddress,
            total,
            `Approve ${totalUsdt} USDT (${tradeUsdt} trade + ${feeUsdt} creation fee)`,
          );
          setTronWalletNotice(
            `Depositing ${totalUsdt} USDT into escrow (${tradeUsdt} trade + ${feeUsdt} creation fee). The wallet amount line stays 0 TRX. The USDT moves from the approval you just signed.`,
          );
          await tronDealAction(
            tron.tronWeb,
            tron.signer,
            tron.address,
            escrow.contractAddress,
            fn,
            args,
            `Deposit ${totalUsdt} USDT into escrow (${tradeUsdt} trade + ${feeUsdt} creation fee)`,
          );
        } else {
          await tronDealAction(tron.tronWeb, tron.signer, tron.address, escrow.contractAddress, fn, args);
        }
      } else {
        if ((fn === "submitProof" || fn === "approveRelease" || fn === "fund") && !connectedParty) {
          throw new Error(
            fn === "fund"
              ? "Connect the buyer wallet on Ethereum mainnet."
              : fn === "submitProof"
                ? "Connect the seller wallet on Ethereum mainnet."
                : "Connect the buyer wallet on Ethereum mainnet.",
          );
        }
        if (fn === "submitProof" && !partyMatches(escrow.chain, escrow.sellerAddress || "", connectedParty)) {
          throw new Error("Connect the seller wallet linked to this trade before submitting on-chain proof.");
        }
        if (!publicClient) throw new Error("The Ethereum RPC is not ready.");
        const owner = connectedParty as `0x${string}`;
        await requestSwitchToEthereum(connector);

        {
          const linkedBuyer = escrow.buyerAddress || null;
          const linkedSeller = escrow.sellerAddress || null;
          const sessionMatchesTrade =
            Boolean(
              connectedParty
              && (
                (linkedBuyer && partyMatches(escrow.chain, linkedBuyer, connectedParty))
                || (linkedSeller && partyMatches(escrow.chain, linkedSeller, connectedParty))
              ),
            );
          if (!connectedParty || !sessionMatchesTrade) {
            const linkedHint = linkedSeller ?? linkedBuyer;
            throw new Error(
              linkedHint
                ? `Connect the wallet linked to this trade (${shortAddr(linkedHint)}) on Ethereum mainnet to sign.`
                : "Connect your Ethereum wallet on Ethereum mainnet to sign.",
            );
          }
          let callAbi: readonly unknown[] = escrowDealAbi;
          let callArgs: unknown[] = args;
          if (fn === "approveRelease") {
            const caps = await loadDealCapabilities(escrow.contractAddress);
            if (caps.releaseMode === "v1-zero-arg") {
              callAbi = escrowDealV1ReleaseAbi;
              callArgs = [];
            } else if (caps.releaseMode === "v2-proof-hash") {
              if (args.length !== 1 || typeof args[0] !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(args[0])) {
                throw new Error("Waiting for fulfilment proof in chat before release.");
              }
              callAbi = escrowDealV2ReleaseAbi;
              callArgs = [args[0]];
            } else {
              throw new Error("Could not determine the release function supported by this escrow contract.");
            }
          } else if (fn === "withdrawDispute") {
            const caps = await loadDealCapabilities(escrow.contractAddress);
            if (!caps.supportsWithdrawDispute) {
              throw new Error("This escrow contract version does not support on-chain dispute withdrawal.");
            }
          }
          await publicClient.simulateContract({
            address: escrow.contractAddress as `0x${string}`,
            abi: callAbi as typeof escrowDealAbi,
            functionName: fn,
            args: callArgs as never,
            account: owner,
          });
          const txHash = await writeContractViaConnector(connector, owner, {
            address: escrow.contractAddress as `0x${string}`,
            abi: callAbi as typeof escrowDealAbi,
            functionName: fn,
            args: callArgs as never,
          });
          await waitForSuccessfulReceipt(publicClient, txHash);
        }
      }
      if (fn === "fund" && isTronEscrow) await tron.refreshBalance();
      if (fn === "fund" && !isTronEscrow && publicClient && connectedParty && fundingTokenAddress) {
        const balance = await publicClient.readContract({
          address: fundingTokenAddress,
          abi: erc20ReadAbi,
          functionName: "balanceOf",
          args: [connectedParty as `0x${string}`],
        });
        setBuyerTokenBalance(balance);
      }
      await load();
      const view = await readChainView();
      applyChainStatus(view);
      if (fn === "requestCancel") await signalTrade(view?.state === 4 ? "cancelled" : "cancel-requested");
      if (fn === "refuseCancel") await signalTrade("cancel-refused");
      if (fn === "fund") await signalTrade("funded");
      if (fn === "submitProof") await signalTrade("release-requested");
      if (fn === "approveRelease") await signalTrade("completed");
      if (!view) {
        if (fn === "fund") setEscrow((current) => current ? { ...current, status: "Funded" } : current);
        if (fn === "submitProof") setEscrow((current) => current ? { ...current, status: "InProgress" } : current);
        if (fn === "approveRelease") setEscrow((current) => current ? { ...current, status: "Completed" } : current);
      }
    } catch (e) {
      const message = normalizeEvmFundingError(e, {
        estimatedEthWei: fundingGasBudgetWei,
        tokenSymbol: escrow?.tokenSymbol === "TRON_USDT" ? "USDT" : escrow?.tokenSymbol,
      });
      setError(message);
      throw new Error(message);
    } finally {
      actionLock.current = false;
      setBusy(false);
      setTronWalletNotice(null);
    }
  }

  async function linkPartyWallet(walletAddressOverride?: string) {
    if (!escrow || !user) return;
    if (actionLock.current) return;
    // A bare click passes the event object. Only a real address string is an override.
    const pickedAddress = typeof walletAddressOverride === "string" ? walletAddressOverride : undefined;
    if (isLegacyEvm) return setError("This trade is on a network the app no longer uses. It stays on record and cannot be changed here.");
    if (!pickedAddress && !isTronEscrow && chainId !== mainnet.id) return setError("Switch your wallet to Ethereum before linking it to this trade.");
    const walletAddress = pickedAddress || (isTronEscrow ? tron.address : isConnected ? address : undefined);
    if (!walletAddress) return setError(isTronEscrow ? "Connect a TRON wallet first." : "Connect your Ethereum wallet first.");
    const tradeEscrowLive =
      Boolean(escrow.contractAddress) && isDisputeEligibleStatus(escrow.status);
    const onChainPartyAddress = isBuyer ? escrow.buyerAddress : isSeller ? escrow.sellerAddress : null;
    if (
      tradeEscrowLive
      && onChainPartyAddress
      && !partyMatches(escrow.chain, onChainPartyAddress, walletAddress)
    ) {
      return setError(
        isSeller
          ? "This escrow contract already pays the seller wallet used at funding. Updating the trade record to a different wallet does not change the contract and can block on-chain dispute or release steps. Connect the funded seller wallet instead."
          : "This escrow contract is tied to the buyer wallet used at funding. Connect that wallet instead of changing the trade record after funding.",
      );
    }
    actionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await api("/v1/auth/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ address: walletAddress, chainKind: isTronEscrow ? "tron" : "evm" }),
      });
      const updated = await api<Escrow>(`/v1/escrows/${id}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ address: walletAddress }),
      });
      setEscrow((current) => (current ? { ...current, ...updated, partyRole: current.partyRole ?? updated.partyRole } : updated));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function unlinkPartyWallet() {
    if (!escrow || !user || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Escrow>(`/v1/escrows/${id}/wallet`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setEscrow((current) => (current ? { ...current, ...updated, partyRole: current.partyRole ?? updated.partyRole } : updated));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function recoverCreation() {
    if (actionLock.current || !isBuyer) return;
    actionLock.current = true; setBusy(true); setError(null);
    try {
      await managedFunding.recover((recoveryHash ?? (pendingCreationHash || escrow?.createTxHash || "")).trim());
      setPendingCreationHash("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not verify the recovery transaction."); }
    finally { actionLock.current = false; setBusy(false); }
  }

  async function deployEscrow() {
    if (!escrow || !isBuyer) return;
    if (!isTronEscrow) { await startManagedFunding(); return; }
    if (actionLock.current) return;
    if (escrow.contractAddress) return setError("An escrow already exists. Use Resume funding instead of creating another contract.");
    if (!isTronEscrow && (pendingCreationHash || escrow.createTxHash)) return setError("A creation transaction is already recorded. Recover that escrow before taking another action.");
    if (isLegacyEvm) return setError("This trade is on a network the app no longer uses. It stays on record and cannot be funded here.");
    if (!isTronEscrow && chainId !== mainnet.id) return setError("Switch your wallet to Ethereum before deploying this escrow.");
    if (!escrow.sellerAddress) return setError("The seller needs to connect and link a wallet for this network first.");
    const walletAddress = isTronEscrow ? tron.address : address;
    if (!walletAddress) return setError(isTronEscrow ? "Connect a TRON wallet first." : "Connect your Ethereum wallet first.");
    if (buyerTokenBalance === null) return setError("Connect your trade wallet and wait for the token balance to load before creating the on-chain escrow.");
    if (buyerTokenBalance < requiredFunding) {
      return setError(`Insufficient ${escrow.tokenSymbol} balance. You need ${formatAmount(requiredFunding.toString())} ${escrow.tokenSymbol} for the trade and creation fee.`);
    }
    actionLock.current = true;
    setBusy(true);
    setError(null);
    let deployGasPlan: DeployFundingGasPlan | undefined;
    try {
      await api("/v1/auth/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ address: walletAddress, chainKind: isTronEscrow ? "tron" : "evm" }),
      });
      await api(`/v1/escrows/${id}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ address: walletAddress }),
      });
      if (isTronEscrow) {
        if (!tron.tronWeb || !tron.signer) throw new Error("Connect a TRON wallet to deploy the escrow.");
        const factory = settings?.tronFactoryAddress || cfg?.tronFactoryAddress;
        const token = settings?.tronUsdtAddress || cfg?.tokens.TRON_USDT;
        if (!factory || !token) throw new Error("Set the Tron factory and USDT addresses in Admin first.");
        const factoryVersion = await getTronFactoryVersion(tron.tronWeb, factory);
        if (factoryVersion !== 2) {
          throw new Error("This TRON factory deploys a full contract for every trade. No transaction was sent. Update the factory to the lower-cost version before creating a new TRON escrow.");
        }
        const total = requiredFunding.toString();
        const tradeUsdt = formatAmount(escrow.amountAtomic);
        const totalUsdt = formatAmount(total);
        const allowance = await fetchTrc20Allowance(tron.tronWeb, token, walletAddress, factory);
        if (allowance < requiredFunding) {
          if (allowance > 0n) {
            setTronWalletNotice(`Resetting the previous USDT allowance before approving ${totalUsdt} USDT. This approval sends no USDT; the wallet amount line is 0 TRX and any TRX shown is network fee.`);
            await tronApproveTrc20(tron.tronWeb, tron.signer, walletAddress, token, factory, "0", "Reset USDT spending approval for this trade");
          }
          setTronWalletNotice(`Approving the factory to spend ${totalUsdt} USDT (${tradeUsdt} trade + ${formatAmount(creationFeeAtomic.toString())} creation fee). This approval sends no USDT; the wallet amount line is 0 TRX and any TRX shown is network fee.`);
          await tronApproveTrc20(
            tron.tronWeb,
            tron.signer,
            walletAddress,
            token,
            factory,
            total,
            `Approve ${totalUsdt} USDT for escrow funding (${tradeUsdt} trade + creation fee)`,
          );
        }
        setTronWalletNotice(`Creating and funding the escrow in one transaction. It transfers ${totalUsdt} USDT (${tradeUsdt} into escrow + ${formatAmount(creationFeeAtomic.toString())} creation fee). The wallet amount line stays 0 TRX; any TRX shown is the network fee.`);
        const { txId, escrowAddress } = await tronCreateAndFundEscrow(
          tron.tronWeb,
          tron.signer,
          walletAddress,
          factory,
          escrow.sellerAddress,
          token,
          escrow.amountAtomic,
          "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
          `Create and fund TRON escrow with ${totalUsdt} USDT (${tradeUsdt} trade + creation fee)`,
        );
        await api(`/v1/escrows/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ buyerAddress: walletAddress, createTxHash: txId, contractAddress: escrowAddress, status: "Funded" }),
        });
        await signalTrade("funded");
      }
      await load();
    } catch (e) {
      setError(
        normalizeEvmFundingError(e, {
          estimatedEthWei: deployGasPlan?.bufferedEthWei,
          tokenSymbol: escrow?.tokenSymbol === "TRON_USDT" ? "USDT" : escrow?.tokenSymbol,
        }),
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function refreshBuyerBalance() {
    if (!escrow || !connectedParty) return;
    setBalanceError(null);
    setBuyerTokenBalance(null);
    try {
      if (isTronEscrow) {
        await tron.refreshBalance();
        return;
      }
      if (!publicClient) throw new Error("Wallet network is not ready yet.");
      if (!fundingTokenAddress) throw new Error("Token contract address is not configured.");
      const balance = await publicClient.readContract({
        address: fundingTokenAddress,
        abi: erc20ReadAbi,
        functionName: "balanceOf",
        args: [connectedParty as `0x${string}`],
      });
      setBuyerTokenBalance(balance);
    } catch (e) {
      setBalanceError(e instanceof Error ? e.message : "Could not read token balance");
    }
  }

  async function uploadLegacyProof(file: File) {
    setBusy(true);
    try {
      await apiUpload(`/v1/escrows/${id}/proof`, (() => { const fd = new FormData(); fd.append("file", file); return fd; })());
      if (escrow?.contractAddress) {
        const proofHash = await proofHashFromFile(file);
        await chain("submitProof", [proofHash]);
      } else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadSharedEvidence(file: File, kind: "evidence" | "fulfilment") {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("note", kind === "fulfilment" ? "Seller shared fulfilment proof" : "Evidence shared by a trade party");
      fd.append("kind", kind);
      await apiUpload(`/v1/escrows/${id}/evidence`, fd, authHeaders());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Marks fulfilment confirmed in the DB and notifies the buyer — no wallet or on-chain proof. */
  function showActionError(message: string) {
    setError(message);
    requestAnimationFrame(() => {
      document.querySelector(".trade-actions .error-banner, .page .error-banner")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  async function buyerReleaseFunds() {
    setBusy(true);
    setError(null);
    try {
      if (!escrow?.contractAddress) {
        throw new Error("No on-chain contract yet.");
      }
      if (isTronEscrow) {
        const { proofHash } = await api<{ proofHash: string }>(`/v1/escrows/${id}/fulfilment-proof-hash`, { headers: authHeaders() });
        if (!/^0x[0-9a-fA-F]{64}$/.test(proofHash)) {
          throw new Error("Waiting for fulfilment proof in chat before release.");
        }
        await chain("approveRelease", [proofHash as `0x${string}`]);
        return;
      }
      if (!publicClient) throw new Error("The Ethereum RPC is not ready.");
      const dealAddress = escrow.contractAddress as `0x${string}`;
      const [caps, onChainStateRaw, onChainBuyer, onChainProofHash] = await Promise.all([
        loadDealCapabilities(dealAddress),
        publicClient.readContract({ address: dealAddress, abi: escrowDealAbi, functionName: "state" }),
        publicClient.readContract({ address: dealAddress, abi: escrowDealAbi, functionName: "buyer" }),
        publicClient.readContract({ address: dealAddress, abi: escrowDealAbi, functionName: "deliveryProofHash" }),
      ]);
      const onChainState = Number(onChainStateRaw);
      if (!connectedParty || !partyMatches("ethereum", onChainBuyer, connectedParty)) {
        throw new Error(`Connect the buyer wallet (${shortAddr(onChainBuyer)}) on Ethereum mainnet to release funds.`);
      }
      if (caps.releaseMode === "v1-zero-arg") {
        if (onChainState === 1) {
          throw new Error("The seller must submit fulfilment proof on-chain before you can release funds on this escrow contract.");
        }
        if (onChainState !== 2) {
          throw new Error("This escrow contract is not in a releasable state.");
        }
        await chain("approveRelease", []);
        return;
      }
      if (caps.releaseMode === "v2-proof-hash") {
        if (onChainState !== 1 && onChainState !== 2) {
          throw new Error("This escrow contract is not in a releasable state.");
        }
        const { proofHash } = await api<{ proofHash: string }>(`/v1/escrows/${id}/fulfilment-proof-hash`, { headers: authHeaders() });
        if (!/^0x[0-9a-fA-F]{64}$/.test(proofHash)) {
          throw new Error("Waiting for fulfilment proof in chat before release.");
        }
        if (proofIsSet(onChainProofHash) && onChainProofHash.toLowerCase() !== proofHash.toLowerCase()) {
          throw new Error("The chat fulfilment proof hash does not match the proof hash recorded on-chain.");
        }
        await chain("approveRelease", [proofHash as `0x${string}`]);
        return;
      }
      throw new Error("Could not determine the release function supported by this escrow contract.");
    } catch (e) {
      showActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmFulfillment() {
    if (!user) {
      setError(t("Sign in to confirm fulfilment."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!isTronEscrow && !isLegacyEvm && escrow?.contractAddress) {
        const caps = await loadDealCapabilities(escrow.contractAddress);
        if (caps.releaseMode === "unknown") {
          throw new Error("Could not verify the deployed escrow contract version. Refresh and try again.");
        }
        if (caps.requiresOnChainSellerProof) {
          const currentView = await readChainView();
          if (currentView?.state === 2) {
            await signalTrade("release-requested");
            await load();
            setLiveNotice(t("Fulfilment proof is already recorded on-chain. The buyer can now review and release funds."));
            return;
          }
          if (currentView?.state !== 1) {
            throw new Error("The on-chain escrow must be Funded before submitting fulfilment proof.");
          }
          let proofHash = "";
          try {
            const proof = await api<{ proofHash: string }>(`/v1/escrows/${id}/fulfilment-proof-hash`, { headers: authHeaders() });
            proofHash = proof.proofHash;
          } catch {
            throw new Error("Upload fulfilment proof in chat first, then submit fulfilment on-chain.");
          }
          if (!/^0x[0-9a-fA-F]{64}$/.test(proofHash)) {
            throw new Error("Upload fulfilment proof in chat first, then submit fulfilment on-chain.");
          }
          await chain("submitProof", [proofHash as `0x${string}`]);
          setLiveNotice(
            isSeller
              ? t("Fulfilment proof submitted on-chain. The buyer can now review and release funds.")
              : t("The seller submitted fulfilment proof on-chain. You can review and release funds when ready."),
          );
          return;
        }
      }
      await api(`/v1/escrows/${id}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ kind: "release-requested" }),
      });
      setEscrow((current) => (current ? { ...current, status: "InProgress" } : current));
      await load();
      setLiveNotice(
        isSeller
          ? t("Fulfilment confirmed. The buyer can review your proof in chat and release funds.")
          : t("The seller confirmed fulfilment. You can review and release funds when ready."),
      );
    } catch (e) {
      showActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    setBusy(true);
    try {
      await api(`/v1/escrows/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ body: chatDraft.trim() }),
      });
      setChatDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openDispute() {
    if (!escrow) return;
    const appOnlyTronDispute = isTronEscrow && isCodeTrade;
    if (isCodeTrade && !disputeReason.trim()) {
      showActionError(t("Write what went wrong before opening a dispute."));
      return;
    }
    try {
      if (!appOnlyTronDispute && !currentWalletMatchesTrade) {
        throw new Error("Connect the wallet linked to this trade to open the on-chain dispute. Network fees apply.");
      }
      if (appOnlyTronDispute) {
        const chainState = await readChainView();
        if (chainState?.state != null && ![1, 2, 5].includes(chainState.state)) {
          throw new Error("The on-chain escrow must be Funded or In Progress before opening a dispute.");
        }
      } else {
        const chainState = await readChainView();
        if (chainState?.state !== 5 && chainState?.state !== 1 && chainState?.state !== 2) {
          throw new Error("The on-chain escrow must be Funded or In Progress before opening a dispute.");
        }
        // Ethereum and legacy trades still mark the dispute on-chain from the party wallet.
        if (chainState.state !== 5) await chain("openDispute");
      }
      await api(`/v1/escrows/${id}/disputes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isCodeTrade ? authHeaders() : {}) },
        body: JSON.stringify(isCodeTrade ? { reason: disputeReason } : { openedBy: connectedParty }),
      });
      setDisputeReason("");
      await load();
      setLiveNotice(appOnlyTronDispute
        ? t("Dispute filed. The resolver must freeze the escrow on-chain before review; you did not pay a wallet fee to open it.")
        : t("Dispute opened on-chain. Your wallet paid the network fee; staff can now review and resolve the case."));
    } catch (e) {
      showActionError(e instanceof Error ? e.message : String(e));
    }
  }

  function runChain(fn: "fund" | "approveRelease" | "requestCancel" | "refuseCancel" | "openDispute" | "withdrawDispute" | "submitProof", args: unknown[] = []) {
    void chain(fn, args).catch((e) => {
      showActionError(
        normalizeEvmFundingError(e, {}) || (e instanceof Error ? e.message : String(e)),
      );
    });
  }

  async function withdrawDispute() {
    if (!dispute || dispute.status !== "open") return;
    if (actionLock.current) return;
    setError(null);
    try {
      const chainState = await readChainView();
      const freezeRecorded = Boolean(escrow?.events?.some((event) =>
        event.eventName === "DisputeFreezeConfirmed"
        && event.payload?.disputeId === dispute.id,
      ));
      const onChainDisputed = chainState?.state === 5 || freezeRecorded;
      if (onChainDisputed && !currentWalletMatchesTrade) {
        throw new Error("Connect the wallet linked to this trade to pay the network fee and restore the escrow.");
      }
      if (!isTronEscrow && !currentWalletMatchesTrade) {
        throw new Error("Connect the wallet linked to this trade to close the on-chain dispute.");
      }
      if (onChainDisputed) {
        // New escrow contracts support an on-chain close by the party that opened it.
        // Older deployments do not expose withdrawDispute and cannot resume on-chain.
        await chain("withdrawDispute");
      }
      actionLock.current = true;
      setBusy(true);
      await api(`/v1/disputes/${dispute.id}/withdraw`, {
        method: "POST",
        headers: authHeaders(),
      });
      await load();
      const view = await readChainView();
      applyChainStatus(view);
      setLiveNotice(
        t("Dispute closed. The trade is back to its previous on-chain state — settle directly with the other party in chat."),
      );
    } catch (e) {
      showActionError(e instanceof Error ? e.message : String(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function downloadEvidence(message: TradeMessage) {
    try {
      const base = apiBase();
      if (!base) throw new Error("API URL is not configured");
      const response = await fetch(`${base}/v1/escrows/${id}/messages/${message.id}/file`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Could not download evidence");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = message.fileName || "evidence";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function downloadTradeRecord() {
    setBusy(true);
    setDownloadingRecord(true);
    setError(null);
    try {
      const base = apiBase();
      if (!base) throw new Error("API URL is not configured");
      const response = await fetch(`${base}/v1/escrows/${id}/trade-record`, { method: "POST", headers: authHeaders() });
      if (!response.ok) {
        let message = "Could not create the agreement record";
        try { message = ((await response.json()) as { error?: string }).error || message; } catch { /* keep fallback */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (!blob.size || (blob.type && blob.type.includes("json"))) {
        throw new Error("The agreement file did not come back as a PDF");
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `2pescrow-agreement-${id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the agreement record");
    } finally {
      setBusy(false);
      setDownloadingRecord(false);
    }
  }

  async function uploadDisputeEvidence(file: File) {
    if (!dispute) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("note", "Evidence submitted for dispute review");
      await apiUpload(`/v1/disputes/${dispute.id}/evidence`, form, authHeaders());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload dispute evidence");
    } finally {
      setBusy(false);
    }
  }

  async function submitDisputeAppeal() {
    if (!dispute || !appealReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/disputes/${dispute.id}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ reason: appealReason.trim() }),
      });
      setAppealReason("");
      await load();
      setLiveNotice(t("Appeal submitted. Payout stays on hold until staff review."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit appeal");
    } finally {
      setBusy(false);
    }
  }

  async function downloadDisputeEvidence(evidenceId: string, fileName?: string | null) {
    try {
      const base = apiBase();
      if (!base) throw new Error("API URL is not configured");
      const response = await fetch(`${base}/v1/disputes/${dispute?.id}/evidence/${evidenceId}/file`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Could not download dispute evidence");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "dispute-evidence";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download dispute evidence");
    }
  }

  function explorerTx(hash: string) {
    if (isTronEscrow) return `${cfg?.tronExplorer || "https://tronscan.org"}/#/transaction/${hash}`;
    if (escrow?.chain === "ethereum") return `${cfg?.ethereumExplorer || "https://etherscan.io"}/tx/${hash}`;
    return null;
  }

  function explorerContract(addressValue: string) {
    if (isTronEscrow) return `${cfg?.tronExplorer || "https://tronscan.org"}/#/address/${addressValue}`;
    if (escrow?.chain === "ethereum") return `${cfg?.ethereumExplorer || "https://etherscan.io"}/address/${addressValue}`;
    return null;
  }

  if (!escrow && !error) return <p className="muted">{t("Loading trade…")}</p>;
  if (!escrow) {
    return <div className="page"><p className="error-banner">{error ? t(error) : ""}</p><button type="button" className="secondary" onClick={() => navigate("/trades")}>{t("Back to trades")}</button></div>;
  }

  const dispute = latestDispute(escrow.disputes);
  const appealWindowOpen =
    !!dispute &&
    dispute.status === "ruled_pending_appeal" &&
    !!dispute.appealDeadlineAt &&
    new Date(dispute.appealDeadlineAt).getTime() > Date.now() &&
    !dispute.appeal;
  const isLosingParty =
    !!dispute &&
    dispute.buyerFavor != null &&
    ((dispute.buyerFavor && isSeller) || (!dispute.buyerFavor && isBuyer));
  const messages = escrow.messages || [];
  const walletAddress = isTronEscrow ? tron.address : !isLegacyEvm && chainId === mainnet.id ? address : undefined;
  const buyerWalletLinked = Boolean(escrow.buyerAddress);
  const sellerWalletLinked = Boolean(escrow.sellerAddress);
  const currentPartyWallet = participatesAsSeller
    ? escrow.sellerAddress
    : participatesAsBuyer
      ? escrow.buyerAddress
      : null;
  const currentWalletMatchesTrade = partyMatches(escrow.chain, currentPartyWallet || "", walletAddress);
  const hasDemoFundingRecord = (escrow.events || []).some((event) => event.eventName === "DemoFundingSimulated");
  const hasOnChainContract = Boolean(escrow.contractAddress);
  const tronDeploymentPending = Boolean(isTronEscrow && escrow.createTxHash && !escrow.contractAddress);
  const factoryConfigured = isTronEscrow
    ? Boolean(settings?.tronFactoryAddress || cfg?.tronFactoryAddress)
    : Boolean(settings?.factoryAddress || cfg?.factoryAddress);
  const tradeOpen = !["Completed", "Cancelled", "Resolved"].includes(effectiveStatus);
  const disputed = effectiveStatus === "Disputed";
  const connectBlock = isLegacyEvm
    ? t("This trade stays on record. The app no longer settles it.")
    : isTronEscrow
      ? (tron.address ? "" : t("Available when you connect a TRON wallet."))
      : !isConnected
        ? t("Available when you connect your Ethereum wallet.")
        : chainId !== mainnet.id
          ? t("Available when this wallet is switched to Ethereum.")
          : "";
  const linkWalletBlock = !currentPartyWallet
    ? t("Available after you link your wallet in this trade.")
    : "";
  /** On-chain signatures need the linked wallet connected in the browser. */
  const chainWalletBlock =
    connectBlock
    || linkWalletBlock
    || (!currentWalletMatchesTrade
      ? t("Available when you connect the wallet already linked to this trade.")
      : "");
  const walletBlock = chainWalletBlock;
  const disputeEligible = isTronEscrow && isCodeTrade
    ? effectiveStatus === "Funded" || effectiveStatus === "InProgress" || chainView.state === 1 || chainView.state === 2 || chainView.state === 5
    : escrowFundedForDispute(effectiveStatus, hasOnChainContract, chainView.state);
  const hasUsedDisputeOpening = Boolean(
    user && escrow.disputes?.some((item) => item.openedByUserId
      ? item.openedByUserId === user.id
      : item.openedBy === (user.email || user.id)),
  );
  const canOpenNewDispute =
    !hasActiveDispute
    && !hasUsedDisputeOpening
    && !disputed
    && disputeEligible
    && !["Cancelled", "Resolved"].includes(effectiveStatus);
  const disputePartyByRole =
    escrow.partyRole === "buyer" || escrow.partyRole === "seller";
  const openDisputeRecord = dispute?.status === "open" ? dispute : undefined;
  const resolverFreezeConfirmed = Boolean(openDisputeRecord && escrow?.events?.some((event) =>
    event.eventName === "DisputeFreezeConfirmed"
    && event.payload?.disputeId === openDisputeRecord.id,
  ));
  const isDisputeOpener = Boolean(
    openDisputeRecord
    && user
    && (openDisputeRecord.openedByUserId
      ? openDisputeRecord.openedByUserId === user.id
      : openDisputeRecord.openedBy === (user.email || user.id)),
  );
  const appealWindowElapsed = Boolean(
    dispute?.status === "ruled_pending_appeal"
    && dispute.appealDeadlineAt
    && new Date(dispute.appealDeadlineAt).getTime() <= Date.now()
    && !dispute.appeal,
  );
  const rulingReadyForPayout = Boolean(
    dispute
    && (dispute.status === "final_ruling" || dispute.status === "appeal_decided" || appealWindowElapsed),
  );
  const needsOnChainDisputeStep = Boolean(
    isCodeTrade
    && isTradeParticipant
    && hasOnChainContract
    && rulingReadyForPayout
    && chainView.state !== 5
    && !(isTronEscrow && isCodeTrade),
  );
  const canWithdrawOpenDispute = Boolean(
    openDisputeRecord
    && openDisputeRecord.buyerFavor == null
    && isCodeTrade
    && isTradeParticipant
    && !!user
    && disputePartyByRole
    && isDisputeOpener,
  );
  /** Code-trade disputes: signed-in buyer/seller by API role; wagmi only for optional chain tx. */
  const codeTradeDisputeBlock = !user
    ? t("Sign in to open a dispute.")
    : !disputePartyByRole
      ? t("Only the buyer or seller on this trade can open a dispute.")
      : "";
  const balanceBlock = buyerTokenBalance === null
    ? t("Available when the token balance has loaded.")
    : buyerTokenBalance < requiredFunding
      ? t("Available when this wallet holds the trade amount plus the $1 creation fee.")
      : "";
  const deployBlock = !isTronEscrow && (pendingCreationHash || escrow.createTxHash)
    ? t("A creation transaction is already recorded. Recover the existing escrow below before continuing.")
    : tronDeploymentPending
    ? t("The creation transaction is confirmed. Waiting for the TRON indexer to add the escrow address; do not create another contract.")
    : !escrow.sellerUserId
      ? t("Available after the seller joins.")
      : !escrow.sellerAddress
        ? t("Available after the seller links a receiving wallet.")
        : !factoryConfigured
          ? t("Available once the escrow factory is configured.")
          : isTronEscrow && tronFactoryVersion !== 2
            ? tronFactoryVersion === null
              ? t("Checking the TRON factory before enabling wallet transactions.")
              : t("The configured TRON factory deploys a full contract for every trade. New TRON escrow creation is paused until the lower-cost factory is installed.")
            : connectBlock || balanceBlock;
  const fundBlock = walletBlock
    || balanceBlock
    || (hasOnChainContract && chainView.state !== 0
      ? t("Waiting for the on-chain escrow state to confirm before funding.")
      : "");
  const cancelBlock = !hasOnChainContract
    ? t("Available after the on-chain escrow is created and the buyer funds it.")
    : !disputeEligible
      ? t("Available after the buyer funds the escrow.")
      : disputed
        ? t("Not available while a dispute is open.")
        : isBuyer && chainView.buyerCancelRequested
          ? t("Waiting for the seller to accept or refuse. The trade stays open until then.")
          : "";

  return (
    <div className="page trade-room-page">
      <button type="button" className="secondary back-btn" onClick={() => navigate(isCodeTrade ? "/app" : "/trades")}>← {t(isCodeTrade ? "Dashboard" : "All trades")}</button>
      <div className="page-head">
        <div>
          <p className="eyebrow">{isCodeTrade ? t(isBuyer ? "Shared trade · You are the buyer" : "Shared trade · You are the seller") : t("Escrow")}</p>
          <h1>{escrow.title}</h1>
          <TradeRoleTags
            buyer={userDisplayLabel(escrow.buyerUser) || (escrow.buyerAddress ? shortAddr(escrow.buyerAddress) : "")}
            seller={userDisplayLabel(escrow.sellerUser) || (escrow.sellerAddress ? shortAddr(escrow.sellerAddress) : "")}
          />
          <TradeTermsSnippet text={escrow.description} empty={t("No extra terms provided.")} />
          <ChainBadge chain={escrow.chain} />
        </div>
        <div className="page-head-meta">
          <StatusBadge status={displayStatus} />
          {isCodeTrade && (
            <span className={`live-updates-badge${liveUpdates ? " live-updates-badge-on" : ""}`} title={liveUpdates ? t("Live updates connected") : t("Reconnecting… refreshing every few seconds")}>
              {liveUpdates ? t("Live") : t("Syncing…")}
            </span>
          )}
        </div>
      </div>

      {liveNotice && (
        <p className="ok-banner trade-live-notice" role="status">
          {liveNotice}
        </p>
      )}

      <FlowStepper status={displayStatus} />
      {isTronEscrow && <TronChainSeparationNotice compact />}
      {error && (
        <p className="error-banner" role="alert">
          {t(error)}
        </p>
      )}

      {isCodeTrade && !escrow.sellerUserId && (
        <section className="card-surface trade-process-guide" aria-label={t("Trade process")}>
          <h2>{t("Two profiles. One escrow.")}</h2>
          <ol>
            <li><strong>{t("Connect wallets.")}</strong> {t("Each party connects a wallet and taps “Link my wallet” in the trade room. Joining or signing in does not link a wallet by itself.")}</li>
            <li><strong>{t("Fund the escrow.")}</strong> {t("The buyer approves USDT and funds the V2 escrow in one smart-contract transaction.")}</li>
            <li><strong>{t("Chat and fulfilment.")}</strong> {t("Both parties message and share proof here. On V2, the seller confirms fulfilment off-chain with zero gas.")}</li>
            <li><strong>{t("Review and release.")}</strong> {t("The buyer reviews the fulfilment proof and approves release to the seller directly on-chain.")}</li>
          </ol>
        </section>
      )}

      {isCodeTrade && !hasOnChainContract && (hasDemoFundingRecord || isFundedOrInProgress(effectiveStatus)) && (
        <p className="error-banner" role="status">
          {t("The trade has no on-chain escrow contract, so no funds are held and release is unavailable. A previous local demo funding record does not represent a deposit. Create a properly configured trade to use real escrow funding.")}
        </p>
      )}

      {isCodeTrade && escrow.tradeCode && !escrow.sellerUserId && (
        <section className="card-surface trade-invite-banner">
          <div className="trade-invite-banner-body">
            <p className="eyebrow">{t("Seller invitation code")}</p>
            <strong className="invite-code">{escrow.tradeCode}</strong>
            <p className="muted">{t("Share this with the seller so they can join the same trade room.")}</p>
          </div>
          {isBuyer && escrow.tradeCode && (
            <CopyButton text={escrow.tradeCode} className="secondary trade-invite-copy" />
          )}
        </section>
      )}

      {isCodeTrade && escrow.sellerUserId && (
        <section className="card-surface trade-parties-banner" aria-live="polite">
          <div className="trade-party-chip">
            <span className="eyebrow">{t("buyer")}</span>
            <strong>{userDisplayLabel(escrow.buyerUser, isBuyer ? userDisplayLabel(user, t("Buyer")) : t("Buyer")) || "—"}</strong>
          </div>
          <div className="trade-party-chip trade-party-chip-seller">
            <span className="eyebrow">{t("seller")}</span>
            <strong>{userDisplayLabel(escrow.sellerUser, isSeller ? userDisplayLabel(user, t("Seller")) : t("Seller"))}</strong>
            <span className={`trade-party-wallet-badge${sellerWalletLinked ? " is-linked" : ""}`}>
              {sellerWalletLinked ? t("Wallet linked") : t("Wallet pending")}
            </span>
          </div>
        </section>
      )}

      <div className="detail-grid trade-room-grid">
        <section className="card-surface trade-deal-card">
          <h2>{t("Deal summary")}</h2>
          <TradeTermsSnippet text={escrow.description} empty={t("No extra terms provided.")} />
          <dl className="kv">
            <dt>{t("Amount")}</dt><dd>{displayToken} {formatAmount(escrow.amountAtomic)}</dd>
            <dt>{t("Buyer profile")}</dt><dd>{userDisplayLabel(escrow.buyerUser, isBuyer ? userDisplayLabel(user, t("Buyer")) : t("Buyer")) || "—"}</dd>
            <dt>{t("Buyer wallet")}</dt><dd className="mono">{escrow.buyerAddress || t("Connect before deploy")}</dd>
            <dt>{t("Seller profile")}</dt><dd>{userDisplayLabel(escrow.sellerUser, isSeller ? userDisplayLabel(user, t("Seller")) : escrow.sellerUserId ? t("Seller") : t("Waiting for seller"))}</dd>
            <dt>{t("Seller wallet")}</dt><dd className="mono">{escrow.sellerAddress || (escrow.sellerUserId ? t("Connect before deploy") : "—")}</dd>
            {escrow.deliveryWindowHours != null && (
              <>
                <dt>{t("Delivery window")}</dt>
                <dd>{formatTradeWindowHours(escrow.deliveryWindowHours, t)}</dd>
              </>
            )}
            {escrow.reviewWindowHours != null && (
              <>
                <dt>{t("Buyer protection period")}</dt>
                <dd>{formatTradeWindowHours(escrow.reviewWindowHours, t)}</dd>
              </>
            )}
            {escrow.joinDeadlineAt && <><dt>{t("Join by")}</dt><dd>{new Date(escrow.joinDeadlineAt).toLocaleString(language)}</dd></>}
            {escrow.fundDeadlineAt && <><dt>{t("Fund by")}</dt><dd>{new Date(escrow.fundDeadlineAt).toLocaleString(language)}</dd></>}
            {escrow.deliveryDeadlineAt && (
              <>
                <dt>{t("Deliver by")}</dt>
                <dd>{new Date(escrow.deliveryDeadlineAt).toLocaleString(language)}</dd>
              </>
            )}
            {escrow.reviewDeadlineAt && (
              <>
                <dt>{t("Buyer protection ends")}</dt>
                <dd>{new Date(escrow.reviewDeadlineAt).toLocaleString(language)}</dd>
              </>
            )}
            <dt>{t("Contract")}</dt><dd className="mono">{escrow.contractAddress || t("Created after seller joins and both wallets are linked")}</dd>
            <dt>{t("Proof hash")}</dt><dd className="mono">{escrow.proofHash || "—"}</dd>
          </dl>

          {escrow.contractAddress && <div className="trade-chain-links">
            {explorerContract(escrow.contractAddress) && <a href={explorerContract(escrow.contractAddress)!} target="_blank" rel="noreferrer">{t("View escrow contract on explorer")} ↗</a>}
            {escrow.createTxHash && explorerTx(escrow.createTxHash) && <a href={explorerTx(escrow.createTxHash)!} target="_blank" rel="noreferrer">{t("View deployment transaction")} ↗</a>}
          </div>}

          {isCodeTrade && escrow.buyerUserId && escrow.sellerUserId && escrow.contractAddress && (isBuyer || isSeller) && (
            <div className="trade-record-download">
              <button type="button" className="secondary" disabled={busy || downloadingRecord} onClick={downloadTradeRecord}>
                {downloadingRecord ? t("Preparing agreement…") : t("Download signed agreement PDF")}
              </button>
              <p className="muted">{t("Includes the agreed terms, linked wallets, on-chain escrow reference, and a public verification link. It does not include private chat or evidence.")}</p>
            </div>
          )}

          {isCodeTrade && (isBuyer || isSeller) && (
            <div className="party-wallet-box">
              <h3>{t("Wallets for this trade")}</h3>
              <p className="muted hint">{t("Trade wallets are set only when a party connects and confirms “Link my wallet”. Disconnecting in the header does not remove a trade wallet—you can update it below.")}</p>
              <div className="trade-wallet-status-list">
                <div className="trade-wallet-status-row">
                  <div className="trade-wallet-status-head">
                    <span>{t("Buyer")}</span>
                    <strong className={buyerWalletLinked ? "wallet-state-linked" : "wallet-state-unlinked"}>
                      {buyerWalletLinked ? t("Linked") : t("Not linked")}
                    </strong>
                  </div>
                  <code>{escrow.buyerAddress ? shortAddr(escrow.buyerAddress) : "—"}</code>
                </div>
                <div className="trade-wallet-status-row">
                  <div className="trade-wallet-status-head">
                    <span>{t("Seller")}</span>
                    <strong className={sellerWalletLinked ? "wallet-state-linked" : "wallet-state-unlinked"}>
                      {escrow.sellerUserId && !sellerWalletLinked ? t("Awaiting link") : sellerWalletLinked ? t("Linked") : t("Not linked")}
                    </strong>
                  </div>
                  <code>{escrow.sellerAddress ? shortAddr(escrow.sellerAddress) : "—"}</code>
                </div>
              </div>
              {isBuyer && escrow.sellerUserId && !sellerWalletLinked && (
                <p className="hint">{t("The seller has joined but has not linked a receiving wallet yet. Funding stays disabled until they confirm a wallet in this room.")}</p>
              )}
              {isSeller && !sellerWalletLinked && (
                <p className="hint">{t("Connect the wallet that should receive payment, then link it here. The buyer will not be able to fund until you do.")}</p>
              )}
              {currentPartyWallet && (isBuyer || isSeller) ? (
                currentWalletMatchesTrade ? (
                  <>
                    <p className="ok-banner">{t("Your connected wallet is linked to this trade.")}</p>
                    {!hasOnChainContract && !escrow.createTxHash && !isDisputeEligibleStatus(effectiveStatus) && !["Completed", "Cancelled", "Resolved"].includes(effectiveStatus) && (
                      <button type="button" className="secondary" disabled={busy} onClick={() => void unlinkPartyWallet()}>
                        {t(isBuyer ? "Unlink buyer wallet" : "Unlink seller wallet")}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="ok-banner">
                      {t("Trade wallet linked")}: <span className="mono">{shortAddr(currentPartyWallet)}</span>
                      {" · "}
                      {t("Connect the same wallet in the header when a step needs an on-chain signature.")}
                    </p>
                    {isTronEscrow ? (
                      !tron.address && <p className="muted">{t("Connect a TRON wallet from the header.")}</p>
                    ) : !isConnected ? (
                      <ConnectEvmWalletButton>{t("Connect Ethereum wallet")}</ConnectEvmWalletButton>
                    ) : chainId !== mainnet.id ? (
                      <EvmWrongChainBanner chainId={chainId} />
                    ) : walletAddress && !currentWalletMatchesTrade ? (
                      <p className="hint">{t("The connected header wallet is not the wallet linked to this trade.")}</p>
                    ) : null}
                    {!hasOnChainContract && !escrow.createTxHash && !isDisputeEligibleStatus(effectiveStatus) && !["Completed", "Cancelled", "Resolved"].includes(effectiveStatus) && (
                      <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                        {walletAddress && (
                          <button type="button" className="secondary" disabled={busy} onClick={() => void linkPartyWallet()}>
                            {t(isBuyer ? "Switch to connected buyer wallet" : "Switch to connected seller wallet")} · {shortAddr(walletAddress)}
                          </button>
                        )}
                        <button type="button" className="secondary" disabled={busy} onClick={() => void unlinkPartyWallet()}>
                          {t(isBuyer ? "Unlink buyer wallet" : "Unlink seller wallet")}
                        </button>
                      </div>
                    )}
                    {(hasOnChainContract || isDisputeEligibleStatus(effectiveStatus)) && (
                      <p className="hint">
                        {t("The escrow contract wallet was fixed at funding. Connect that same wallet in the header for on-chain steps — do not change to a different address.")}
                      </p>
                    )}
                  </>
                )
              ) : walletAddress ? (
                <button type="button" className="secondary" disabled={busy} onClick={() => void linkPartyWallet()}>
                  {t(isBuyer ? "Link connected buyer wallet" : "Link connected seller wallet")} · {shortAddr(walletAddress)}
                </button>
              ) : isTronEscrow ? (
                <p className="muted">{t("Connect a TRON wallet from the header.")}</p>
              ) : isConnected ? (
                <EvmWrongChainBanner chainId={chainId} />
              ) : (
                <ConnectEvmWalletButton>{t("Connect Ethereum wallet")}</ConnectEvmWalletButton>
              )}
            </div>
          )}

          {isCodeTrade && isBuyer && escrow.sellerUserId && (
            <section className="funding-panel trade-room-subsection" aria-live="polite">
              <p className="eyebrow">{t("Buyer funding")}</p>
              <h3>{t(effectiveStatus === "Created" ? "Fund the escrow" : ["Funded", "InProgress", "Completed"].includes(effectiveStatus) ? "Escrow funding status" : "Check funds before locking")}</h3>
              <dl className="kv funding-kv">
                <dt>{t("Trade amount")}</dt>
                <dd>
                  <FundingMoney atomic={escrow.amountAtomic} token={displayToken} />
                </dd>
                <dt>{t("Creation fee")}</dt>
                <dd>
                  <FundingMoney atomic={creationFeeAtomic.toString()} token={displayToken} />
                </dd>
                <dt>{t("Required token balance")}</dt>
                <dd>
                  <FundingMoney atomic={requiredFunding.toString()} token={displayToken} emphasize />
                </dd>
                <dt>{t("Connected wallet balance")}</dt>
                <dd>
                  <FundingMoney
                    atomic={buyerTokenBalance?.toString()}
                    token={displayToken}
                    loading={balanceLoading}
                  />
                </dd>
              </dl>
              {!connectedParty && (
                <p className="hint">
                  {isTronEscrow
                    ? t("Connect a TRON wallet to load the token balance.")
                    : isConnected
                      ? t("Switch your wallet to Ethereum to load the token balance.")
                      : t("Connect your Ethereum wallet to load the token balance.")}
                </p>
              )}
              {balanceError && (
                <p className="error-banner funding-panel-alert">
                  {t("Balance unavailable")}: {balanceError}
                </p>
              )}
              {isTronEscrow && (
                <p className="hint funding-panel-hint">
                  {t("TRON has two steps: create the escrow contract (TRX network fee; no USDT is sent), then approve and fund it (trade amount plus the $1 creation fee).")}
                </p>
              )}
              {buyerTokenBalance !== null && buyerTokenBalance < requiredFunding && (
                <p className="hint funding-panel-hint">
                  {t("Insufficient token balance")}:{" "}
                  <FundingMoney
                    atomic={(requiredFunding - buyerTokenBalance).toString()}
                    token={displayToken}
                  />
                  . {t("Add funds to this wallet before deploying and funding the trade.")}{" "}
                  {t("The invitation itself does not lock funds.")}
                </p>
              )}
              <button type="button" className="linkish" disabled={busy || !connectedParty} onClick={refreshBuyerBalance}>{t("Refresh token balance")}</button>
              {isBuyer && !escrow.contractAddress && !factoryConfigured && (
                <p className="hint">{t("On-chain escrow deployment is not configured for this network yet. Set the factory address before this trade can be funded or released.")}</p>
              )}
            </section>
          )}

          {tronWalletNotice && (
            <p className="warn-banner" role="status">{tronWalletNotice}</p>
          )}
          {isBuyer && isCodeTrade && !isTronEscrow && !isLegacyEvm && (
            <EthereumFundingProgress state={managedFunding.state} error={managedFunding.error} busy={managedFunding.busy}
              walletReady={Boolean(address && chainId === mainnet.id && escrow.buyerAddress?.toLowerCase() === address.toLowerCase())}
              onContinue={() => void startManagedFunding()} onRefresh={() => void managedFunding.refresh()} />
          )}
          {isBuyer && isCodeTrade && !isTronEscrow && !isLegacyEvm && tradeOpen && (!hasOnChainContract || effectiveStatus === "Created") && (
            <details>
              <summary>{t("Support recovery with a transaction hash")}</summary>
              <p>{t("If a previous attempt stopped after creating the contract, paste its creation transaction hash. We will check that it matches this trade. Recovery does not move funds or request a wallet signature.")}</p>
              <label htmlFor="escrow-creation-hash">{t("Ethereum creation transaction hash")}</label>
              <input
                id="escrow-creation-hash"
                value={recoveryHash ?? (pendingCreationHash || escrow.createTxHash || "")}
                onChange={(event) => setRecoveryHash(event.target.value)}
                placeholder="0x…"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
              <button type="button" className="secondary" disabled={busy || !address || !publicClient} onClick={() => void recoverCreation()}>
                {busy ? t("Checking…") : t("Recover existing escrow")}
              </button>
              {!address && <p>{t("Connect the buyer wallet linked to this trade to recover its escrow.")}</p>}
            </details>
          )}
          <div className="action-row trade-room-actions">
            {isBuyer && isCodeTrade && isTronEscrow && tradeOpen && !hasOnChainContract && (
              <TradeAction
                label={busy
                  ? isTronEscrow ? t("Approving and funding escrow…") : t("Approving and depositing…")
                  : isTronEscrow ? t("Approve AMOUNT USDT and create/fund escrow").replace("AMOUNT", formatAmount(requiredFunding.toString())) : t("Approve TOKEN & fund escrow").replace("TOKEN", displayToken)}
                available={!deployBlock}
                busy={busy}
                hint={deployBlock || (isTronEscrow
                  ? t("The safe TRON flow approves the trade amount plus the $1 fee, then creates and funds the lower-cost escrow in one transaction. The wallet amount line shows 0 TRX because the call sends no TRX; USDT moves through the token contract. The separate TRX figure is the network fee.")
                  : "")}
                onClick={() => void deployEscrow()}
              />
            )}
            {isBuyer && isCodeTrade && isTronEscrow && tradeOpen && hasOnChainContract && (
              <TradeAction
                label={busy
                  ? t("Confirming funding…")
                  : isTronEscrow ? t("Approve AMOUNT USDT and fund").replace("AMOUNT", formatAmount(requiredFunding.toString())) : t("Resume funding existing escrow")}
                available={Boolean(effectiveStatus === "Created" && chainView.state === 0 && !disputed && !fundBlock)}
                busy={busy}
                hint={fundBlock || (effectiveStatus !== "Created"
                  ? t("Funding is available only while this escrow is awaiting its first deposit.")
                  : isTronEscrow
                    ? t("The wallet amount line shows 0 TRX. That line is TRX sent with the transaction, and this step sends none. You are approving AMOUNT USDT (the trade plus the $1 creation fee). The separate TRX figure is the network fee.").replace("AMOUNT", formatAmount(requiredFunding.toString()))
                    : t("Uses the existing contract and checks its token approval before requesting the deposit. No new escrow is created. Ethereum network fees still apply."))}
                onClick={() => runChain("fund")}
              />
            )}
            {isSeller && tradeOpen && !disputed && isCodeTrade && (
              <TradeAction
                className={isEthereumV1 ? (chainView.state === 2 ? "secondary" : undefined) : effectiveStatus === "InProgress" ? "secondary" : undefined}
                label={busy ? t("Confirming…") : isEthereumV1 ? t("Submit fulfilment on-chain") : t("Submit fulfilment")}
                available={Boolean(
                  hasOnChainContract
                  && (isEthereumV1
                    ? chainView.state === 1
                    : effectiveStatus === "Funded" && !isEthereumCapabilitiesPending),
                )}
                busy={busy}
                hint={
                  isEthereumV1
                    ? chainView.state === 2
                      ? t("Fulfilment proof is confirmed on-chain.")
                      : chainView.state === 1
                        ? t("Upload fulfilment proof in chat first, then sign with the linked seller wallet to record proof on-chain.")
                        : !hasOnChainContract
                          ? t("Available after the buyer’s deposit is confirmed in an on-chain escrow.")
                          : t("Available after the buyer funds the escrow.")
                    : effectiveStatus === "InProgress"
                      ? t("Fulfilment is already confirmed on this trade.")
                      : !hasOnChainContract
                        ? t("Available after the buyer’s deposit is confirmed in an on-chain escrow.")
                        : isEthereumCapabilitiesPending
                          ? t("Checking escrow contract version…")
                          : effectiveStatus !== "Funded"
                            ? t("Available after the buyer funds the escrow.")
                            : t("Share proof in chat first, then confirm here. No wallet signature is required.")
                }
                onClick={() => void confirmFulfillment()}
              />
            )}
            {isSeller && tradeOpen && !disputed && !isCodeTrade && (
              <TradeAction
                file
                label={t("Upload delivery proof")}
                available={fundedOrProgress}
                busy={busy}
                hint={fundedOrProgress ? "" : t("Available after the trade is funded.")}
                onFile={(file) => uploadLegacyProof(file)}
              />
            )}
            {isBuyer && tradeOpen && !disputed && (
              <TradeAction
                label={busy ? t("Releasing…") : t("Review fulfilment & release funds")}
                available={Boolean(hasOnChainContract && releaseReady)}
                busy={busy}
                hint={!hasOnChainContract
                  ? t("Available after the buyer funds the on-chain escrow.")
                  : v1OnChainProofNeeded
                    ? t("Waiting for the seller to submit fulfilment proof on-chain before you can release funds.")
                    : isEthereumCapabilitiesPending
                      ? t("Checking escrow contract version…")
                      : !releaseReady
                        ? t("Available after the seller shares fulfilment in chat.")
                        : ""}
                onBlockedClick={(hint) =>
                  showActionError(hint || t("Available after the seller shares fulfilment in chat."))
                }
                onClick={() => void buyerReleaseFunds()}
              />
            )}
            {isSeller && isCodeTrade && tradeOpen && !disputed && (
              <TradeAction
                className="secondary"
                label={t("Refuse cancel")}
                available={Boolean(chainView.buyerCancelRequested && disputeEligible)}
                busy={busy}
                hint={!chainView.buyerCancelRequested
                  ? t("Available after the buyer asks to cancel.")
                  : t("Available while the trade is funded.")}
                onClick={() => runChain("refuseCancel")}
              />
            )}
            {(isBuyer || isSeller) && tradeOpen && (
              <TradeAction
                className="secondary"
                label={isSeller ? t("Cancel trade") : t("Request cancel")}
                available={!cancelBlock}
                busy={busy}
                hint={cancelBlock}
                onClick={() => runChain("requestCancel")}
              />
            )}
            {isSeller && tradeOpen && fundedOrProgress && !disputed && !cancelBlock && (
              <p className="hint">
                {t("Cancel trade closes the escrow and refunds the buyer the trade amount minus a $1 cancel commission. The buyer’s $1 creation fee paid at funding is not refunded.")}
              </p>
            )}
            {chainView.buyerCancelRequested && tradeOpen && !disputed && (
              <p className="hint">
                {t("Cancel requested. The seller can refuse it, or cancel the trade to refund the buyer (trade amount minus $1 cancel commission). The creation fee stays with the protocol.")}
              </p>
            )}
          </div>
          {isCodeTrade && isTradeParticipant && (
            <div className="dispute-compose">
              {canOpenNewDispute && (
                <>
                  <label>{t("Raise a dispute")}<textarea rows={2} value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder={t("Describe the issue for the other party and admin.")} /></label>
                  {effectiveStatus === "Completed" && (
                    <p className="hint">
                      {t("If funds were already released on-chain, staff review can still proceed; connecting the wallet used at funding may be required to sync the escrow on-chain.")}
                    </p>
                  )}
                  <TradeAction
                    className="danger"
                    label={t("Open dispute")}
                    available={Boolean(canOpenNewDispute && hasOnChainContract && !codeTradeDisputeBlock && ((isTronEscrow && isCodeTrade) || currentWalletMatchesTrade))}
                    busy={busy}
                    hint={
                      !hasOnChainContract
                        ? t("Available after the on-chain escrow exists.")
                        : hasUsedDisputeOpening
                          ? t("You have already used your one dispute opening on this trade.")
                        : !(isTronEscrow && isCodeTrade) && !currentWalletMatchesTrade
                          ? t("Connect the buyer or seller wallet linked to this trade. Opening a dispute requires a wallet signature and network gas.")
                        : !canOpenNewDispute
                          ? hasActiveDispute
                            ? t("Not available while a dispute is open.")
                            : t("Available after the buyer funds the escrow.")
                          : codeTradeDisputeBlock
                    }
                    onBlockedClick={(hint) => showActionError(hint || t("This action is not available yet."))}
                    onClick={openDispute}
                  />
                </>
              )}
              {canWithdrawOpenDispute && (
                <>
                  <p className="hint">
                    {t(isTronEscrow
                      ? "Settling directly? The opener can withdraw the dispute. If the resolver already froze the escrow, the opener must sign a network-fee transaction to restore its previous state."
                      : "Settling directly? The party who opened this dispute can withdraw it. The wallet must sign to restore the escrow's previous on-chain state.")}
                  </p>
                  <TradeAction
                    className="secondary"
                    label={busy ? t("Closing…") : t("Close dispute")}
                    available={!busy}
                    busy={busy}
                    hint=""
                    onClick={() => void withdrawDispute()}
                  />
                </>
              )}
              {openDisputeRecord && isCodeTrade && isTradeParticipant && user && !isDisputeOpener && (
                <p className="hint">{t("Only the party who opened this dispute can close it.")}</p>
              )}
              {openDisputeRecord && isTronEscrow && isCodeTrade && !resolverFreezeConfirmed && chainView.state !== 5 && (
                <p className="admin-handling-banner">
                  {t("Dispute recorded. Waiting for the resolver wallet to freeze the escrow on-chain; normal trade actions are paused in the app.")}
                </p>
              )}
              {dispute?.assignedModerator && disputed && (
                <p className="admin-handling-banner">
                  {t("Moderator assigned")}: {dispute.assignedModerator.displayName || dispute.assignedModerator.email || t("Staff")}
                </p>
              )}
              {dispute?.handledByAdmin && <p className="admin-handling-banner">{t("Handled by admin")}{dispute.handledByAdminAt ? ` ${t("since")} ${new Date(dispute.handledByAdminAt).toLocaleString(language)}` : ""}</p>}
              {dispute && dispute.buyerFavor != null && dispute.status !== "open" && (
                <p className="muted">
                  {t(dispute.status === "ruled_pending_appeal" ? "Provisional ruling" : "Final ruling")}: {dispute.buyerFavor ? t("Buyer favor") : t("Seller favor")}
                  {dispute.appealDeadlineAt && dispute.status === "ruled_pending_appeal"
                    ? ` · ${t("Appeal until")} ${new Date(dispute.appealDeadlineAt).toLocaleString(language)}`
                    : ""}
                </p>
              )}
              {appealWindowOpen && isLosingParty && (
                <>
                  <label>
                    {t("Appeal this ruling")}
                    <textarea
                      rows={3}
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      placeholder={t("Explain why the ruling should be reviewed (3-day window).")}
                    />
                  </label>
                  <button type="button" className="secondary" disabled={busy || !appealReason.trim()} onClick={submitDisputeAppeal}>
                    {t("Submit appeal")}
                  </button>
                </>
              )}
              {dispute?.appeal && dispute.status === "appealed" && (
                <p className="admin-handling-banner">{t("Appeal under review — funds remain in escrow.")}</p>
              )}
              {needsOnChainDisputeStep && (
                <>
                  <p className="hint">
                    {t("The ruling is recorded, but funds have not moved. The current escrow contract requires a buyer or seller to mark it disputed on-chain before staff can pay out. This separate step uses your linked wallet and requires network gas.")}
                  </p>
                  <TradeAction
                    className="secondary"
                    label={busy ? t("Preparing on-chain dispute…") : t("Prepare escrow for resolver payout")}
                    available={!busy && currentWalletMatchesTrade}
                    busy={busy}
                    hint={currentWalletMatchesTrade ? "" : t("Connect your linked buyer or seller wallet to prepare the escrow for payout.")}
                    onClick={() => void chain("openDispute")}
                  />
                </>
              )}
              {rulingReadyForPayout && chainView.state === 5 && isTradeParticipant && (
                <p className="admin-handling-banner">{t("Escrow is marked disputed on-chain. Staff can now finalize the resolver payout.")}</p>
              )}
            </div>
          )}
          {!connectedParty && !isCodeTrade && (
            <div className="hint wallet-connect-prompt">{isTronEscrow ? <p>{t("Connect a TRON wallet (header) as buyer or seller.")}</p> : isLegacyEvm ? <p>{t("This trade stays on record. The app no longer settles it.")}</p> : <><p>{t("Connect the buyer or seller wallet on Ethereum to take actions.")}</p><ConnectEvmWalletButton>{t("Connect wallet")}</ConnectEvmWalletButton></>}</div>
          )}
        </section>

        {isCodeTrade ? (
          <section className="card-surface shared-timeline-card">
            <h2>{t("Shared activity")}</h2>
            <TradeRoomChat
              messages={messages}
              updates={(escrow.events || [])
                .filter((ev) => !ev.eventName.startsWith("DeadlineReminder:"))
                .map((ev) => ({
                  id: String(ev.id),
                  label: eventLabel(ev.eventName, t),
                  href: ev.txHash ? explorerTx(ev.txHash) : null,
                  hrefLabel: ev.txHash ? shortAddr(ev.txHash) : null,
                  createdAt: ev.createdAt,
                }))}
              userId={user?.id}
              language={language}
              busy={busy}
              canPost={isBuyer || isSeller || (isTradeAdmin && disputed)}
              allowUpload={isBuyer || isSeller}
              composerPlaceholder={
                isTradeAdmin && disputed
                  ? t("Ask the buyer or seller a question…")
                  : disputed
                    ? t("Reply to admin or the other party…")
                    : undefined
              }
              draft={chatDraft}
              onDraft={setChatDraft}
              onSend={sendMessage}
              onUpload={(file) => uploadSharedEvidence(file, isSeller ? "fulfilment" : "evidence")}
              onDownload={downloadEvidence}
              onDownloadAgreement={downloadTradeRecord}
              downloadingAgreement={downloadingRecord}
              fileUrl={(messageId) => `${apiBase()}/v1/escrows/${id}/messages/${messageId}/file`}
              authHeaders={authHeaders}
              t={t}
            />
            {dispute && <section className="dispute-evidence-panel">
              <h3>{t("Dispute case file")}</h3>
              <p className="muted">{t("Opened by")}: {dispute.openedBy.includes("@") ? dispute.openedBy : shortAddr(dispute.openedBy)} · {dispute.createdAt ? new Date(dispute.createdAt).toLocaleString(language) : ""}</p>
              {dispute.evidence?.length ? <ul className="dispute-evidence-list">{dispute.evidence.map((item) => {
                const authorRole = partyMatches(escrow.chain, item.submittedBy, escrow.buyerAddress || "") ? t("Buyer") : partyMatches(escrow.chain, item.submittedBy, escrow.sellerAddress || "") ? t("Seller") : shortAddr(item.submittedBy);
                return <li key={item.id}>
                  <div><strong>{authorRole}</strong>{item.createdAt && <time>{new Date(item.createdAt).toLocaleString(language)}</time>}</div>
                  {item.note && <p>{item.note}</p>}
                  {item.contentHash && <code className="mono evidence-hash">SHA-256 · {item.contentHash}</code>}
                  {item.fileAvailable && <button type="button" className="linkish" onClick={() => downloadDisputeEvidence(item.id, item.fileName)}>{t("Download evidence file")}{item.fileName ? ` · ${item.fileName}` : ""}</button>}
                </li>;
              })}</ul> : <p className="muted">{t("No separate dispute evidence has been submitted yet.")}</p>}
              {(isBuyer || isSeller) && dispute.status === "open" && <label className="file-btn secondary evidence-upload">{t("Submit dispute evidence")}<input type="file" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && uploadDisputeEvidence(e.target.files[0])} /></label>}
            </section>}
            <div className="trade-feedback-socials">
              <span>{t("Leave feedback")}</span>
              {(["x", "discord", "telegram"] as const).flatMap((id) => {
                const link = socialLinks(settings).find((entry) => entry.id === id);
                return link ? [link] : [];
              }).map((link) => (
                <a key={link.id} href={link.href} target="_blank" rel="noreferrer" aria-label={link.label} title={link.label}>
                  <SocialMark id={link.id} />
                </a>
              ))}
            </div>
          </section>
        ) : (
          <section className="card-surface">
            <h2>{t("Events")}</h2>
            {(escrow.events || []).length === 0 && <p className="muted">{t("No events yet.")}</p>}
            <ul className="activity-list">{(escrow.events || []).map((ev) => <li key={ev.id}><span><strong>{eventLabel(ev.eventName, t)}</strong>{ev.txHash && explorerTx(ev.txHash) && <> · <a className="mono" href={explorerTx(ev.txHash)!} target="_blank" rel="noreferrer">{shortAddr(ev.txHash)} ↗</a></>}</span>{ev.createdAt && <time>{new Date(ev.createdAt).toLocaleString(language)}</time>}</li>)}</ul>
            {dispute && (
              <div className="dispute-box">
                <h3>{t("Dispute ·")} {dispute.status.replace(/_/g, " ")}</h3>
                <p className="muted">{t("Opened by")} {shortAddr(dispute.openedBy)}</p>
                {dispute.buyerFavor != null && dispute.status !== "open" && (
                  <p className="muted">{t("Ruling")}: {dispute.buyerFavor ? t("Buyer favor") : t("Seller favor")}</p>
                )}
                {appealWindowOpen && isLosingParty && (
                  <>
                    <label>
                      {t("Appeal")}
                      <textarea rows={2} value={appealReason} onChange={(e) => setAppealReason(e.target.value)} />
                    </label>
                    <button type="button" className="secondary" disabled={busy || !appealReason.trim()} onClick={submitDisputeAppeal}>
                      {t("Submit appeal")}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
