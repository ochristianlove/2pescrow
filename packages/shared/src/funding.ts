export type FundingKind = "create" | "approve" | "reset" | "deposit" | "createAndFund";
export type FundingAttemptView = {
  id: string; kind: FundingKind; status: string; hash: string | null; nonce: number;
  gasPaidWei: string | null;
};
export type FundingSnapshot = {
  stage: "ready" | "pending" | "funded" | "closed";
  chainState?: number | null;
  message: string;
  contractAddress: string | null;
  approvalConfirmed: boolean;
  amountAtomic: string;
  feeAtomic: string;
  tokenSymbol: string;
  canContinue: boolean;
  active: FundingAttemptView | null;
  attempts: FundingAttemptView[];
};
export type PreparedFunding = {
  snapshot: FundingSnapshot;
  send?: { attemptId: string; from: string; to: string; data: string; nonce: number; gas: string; chainId: 1; value: "0x0" };
};
export type FundingTransport = {
  get: () => Promise<FundingSnapshot>;
  prepare: (requestId: string, resume: boolean) => Promise<PreparedFunding>;
  report: (id: string, body: { hash?: string; outcome?: "rejected" | "uncertain" }) => Promise<unknown>;
  send: (tx: NonNullable<PreparedFunding["send"]>) => Promise<string>;
  // Hashes are cached before calling the API, but the server can recover by sender + nonce if caching fails.
  remember: (id: string, hash: string) => Promise<void>;
  progress: (state: FundingSnapshot) => void;
  requestId: () => string;
  pause: () => Promise<void>;
};

export function walletRejected(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; cause?: unknown };
  return Number(e.code) === 4001 || (e.cause !== error && walletRejected(e.cause));
}

/** Each send requires a durable server intent. Polls never send; only this explicit user action does. */
export async function continueFunding(io: FundingTransport): Promise<FundingSnapshot> {
  let state = await io.get();
  io.progress(state);
  for (let step = 0; step < 5; step++) {
    if (!state.canContinue || state.stage === "funded" || state.stage === "closed") return state;
    // Only the first step can explicitly resume a previously uncertain wallet request.
    const prepared = await io.prepare(io.requestId(), step === 0 && Boolean(state.active));
    state = prepared.snapshot;
    io.progress(state);
    if (!prepared.send) return state;
    const intent = prepared.send;
    let hash: string;
    try {
      hash = await io.send(intent);
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet response is uncertain. Your saved request will be checked before continuing.");
    } catch (error) {
      await io.report(intent.attemptId, { outcome: walletRejected(error) ? "rejected" : "uncertain" }).catch(() => undefined);
      // Never retry a wallet send or advance to the next step on an uncertain result.
      throw error;
    }
    await io.remember(intent.attemptId, hash).catch(() => undefined);
    await io.report(intent.attemptId, { hash });
    for (let poll = 0; poll < 8; poll++) {
      state = await io.get();
      io.progress(state);
      if (!state.active || state.stage === "funded" || state.stage === "closed") break;
      await io.pause();
    }
    if (state.active) return state;
    const completed = state.attempts.find(a => a.id === intent.attemptId);
    if (completed?.status !== "confirmed") return state; // Revert/cancellation/replacement needs a fresh user decision.
  }
  return state;
}

export function fundingStepLabel(kind: FundingKind): string {
  return { create: "Create escrow", approve: "Approve token spending", reset: "Reset previous approval", deposit: "Deposit into escrow", createAndFund: "Create and fund escrow" }[kind];
}

/** Single EIP-1193 send; the same saved nonce is used on every explicitly requested continuation. */
export async function sendPreparedFundingTransaction(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  account: string,
  tx: NonNullable<PreparedFunding["send"]>,
): Promise<string> {
  if (tx.chainId !== 1 || tx.value !== "0x0" || tx.from.toLowerCase() !== account.toLowerCase()
    || !Number.isSafeInteger(tx.nonce) || tx.nonce < 0 || !/^0x[0-9a-fA-F]{40}$/.test(tx.to) || !/^0x[0-9a-fA-F]+$/.test(tx.data)) {
    throw new Error("The saved wallet request does not match this Ethereum account.");
  }
  if (Number(await provider.request({ method: "eth_chainId" })) !== 1) throw new Error("Switch the signing wallet to Ethereum mainnet.");
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || !accounts.some(a => typeof a === "string" && a.toLowerCase() === account.toLowerCase())) throw new Error("Select the buyer wallet linked to this trade.");
  const request = { from: account, to: tx.to, data: tx.data, value: "0x0", chainId: "0x1", nonce: `0x${tx.nonce.toString(16)}`, gas: tx.gas };
  // The server simulated this exact call before preparing it. WalletConnect signing namespaces
  // need not expose eth_call; requiring that wallet method would break otherwise valid mobile sessions.
  const hash = await provider.request({ method: "eth_sendTransaction", params: [request] });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet did not return a transaction hash. The saved request will be checked automatically.");
  return hash;
}
