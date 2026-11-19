import { randomUUID } from "node:crypto";
import type { Escrow, EthereumFundingAttempt, Prisma, PrismaClient } from "@prisma/client";
import { isAddress, type Address, type Hash, type PublicClient, type Transaction, type TransactionReceipt } from "viem";
import { escrowFactoryAbi, fundingStepLabel, type FundingAttemptView, type FundingKind, type FundingSnapshot, type PreparedFunding } from "@2pescrow/shared";
import { notifyTradeFunded, notifyTradeCompleted, notifyTradeCancelled } from "./notifications";
import { classifyFundingReceipt, creationChild, findNonceTransaction, fundingReadAbi, nextFundingCall, receiptIfMined, same, verifyChild, type FundingTerms } from "./ethereumFundingChain";

type Db = Prisma.TransactionClient;
type Settings = { factory: string; tokens: Record<string, string | null | undefined> };
const states = ["Created", "Funded", "InProgress", "Completed", "Cancelled", "Disputed", "Resolved"];
const isCreation = (kind: string) => kind === "create" || kind === "createAndFund";
const view = (a: EthereumFundingAttempt): FundingAttemptView => ({ id: a.id, kind: a.kind as FundingKind, status: a.status, hash: a.txHash, nonce: a.nonce, gasPaidWei: a.gasPaidWei });
export class FundingError extends Error {
  constructor(message: string, public statusCode = 409) { super(message); }
}

export class EthereumFundingService {
  constructor(private db: PrismaClient, private client: PublicClient, private settings: () => Promise<Settings>) {}

  private async locked<T>(id: string, run: (db: Db, row: Escrow, terms: FundingTerms, head: bigint) => Promise<T>) {
    const initial = await this.db.escrow.findUnique({ where: { id } });
    if (!initial || initial.chain !== "ethereum" || initial.chainId !== 1) throw new FundingError("This funding flow requires an Ethereum mainnet trade.", 400);
    if (!initial.buyerAddress || !initial.sellerAddress) throw new FundingError("Both parties must link their Ethereum wallets before funding.", 400);
    const settings = await this.settings();
    const token = settings.tokens[initial.tokenSymbol];
    if (!token || !isAddress(token) || !isAddress(settings.factory) || !isAddress(initial.buyerAddress) || !isAddress(initial.sellerAddress)) throw new FundingError("The Ethereum trade configuration is incomplete.", 400);
    if (same(initial.buyerAddress, initial.sellerAddress)) throw new FundingError("Buyer and seller must use different wallets.", 400);
    // Token configuration must not silently substitute a token already recorded on the trade.
    if (isAddress(initial.tokenAddress) && !same(initial.tokenAddress, token)) throw new FundingError("The trade token differs from the configured token. Funding is paused for review.");
    if (await this.client.getChainId() !== 1) throw new FundingError("The server RPC is not Ethereum mainnet.", 503);
    return this.db.$transaction(async db => {
      // Serialize across devices and API processes. The unique active indexes are the second line of defence.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.buyerAddress!.toLowerCase()}, 0))`;
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 1))`;
      const row = await db.escrow.findUniqueOrThrow({ where: { id } });
      if (row.buyerAddress !== initial.buyerAddress || row.sellerAddress !== initial.sellerAddress || row.amountAtomic !== initial.amountAtomic || row.tokenAddress !== initial.tokenAddress) throw new FundingError("Trade details changed. Refresh before continuing.");
      const terms: FundingTerms = { factory: settings.factory as Address, buyer: row.buyerAddress as Address, seller: row.sellerAddress as Address, token: token as Address, amount: BigInt(row.amountAtomic) };
      const latest = await this.client.getBlockNumber({ cacheTime: 0 });
      const head = latest > 2n ? latest - 2n : 0n; // Three confirmations before advancing a step.
      return run(db, row, terms, head);
    }, { timeout: 90_000, maxWait: 15_000 });
  }

  private async bindCreation(db: Db, row: Escrow, terms: FundingTerms, receipt: TransactionReceipt) {
    const child = creationChild(receipt, terms).toLowerCase();
    if (row.contractAddress && !same(row.contractAddress, child)) throw new FundingError("This trade is already linked to a different escrow. It cannot be replaced.");
    const used = await db.escrow.findUnique({ where: { contractAddress: child } });
    if (used && used.id !== row.id) throw new FundingError("This escrow is already linked to another trade.");
    await db.escrow.update({ where: { id: row.id }, data: { contractAddress: child, createTxHash: receipt.transactionHash } });
    row.contractAddress = child;
    row.createTxHash = receipt.transactionHash;
  }

  private async reconcile(db: Db, row: Escrow, terms: FundingTerms, head: bigint) {
    if (row.createTxHash && !row.contractAddress) {
      const receipt = await receiptIfMined(this.client, row.createTxHash as Hash);
      if (receipt && receipt.blockNumber <= head) {
        if (receipt.status === "success") await this.bindCreation(db, row, terms, receipt);
        else {
          await db.escrow.update({ where: { id: row.id }, data: { createTxHash: null } });
          row.createTxHash = null;
        }
      }
    }
    const attempts = await db.ethereumFundingAttempt.findMany({ where: { escrowId: row.id, active: true }, orderBy: { createdAt: "asc" } });
    for (const a of attempts) {
      let receipt = a.txHash ? await receiptIfMined(this.client, a.txHash as Hash) : null;
      let tx: Transaction | undefined = receipt ? await this.client.getTransaction({ hash: receipt.transactionHash }) : undefined;
      const count = await this.client.getTransactionCount({ address: terms.buyer, blockNumber: head });
      if (!receipt && count > a.nonce) {
        try { tx = await findNonceTransaction(this.client, terms.buyer, a.nonce, a.startBlock, head); }
        catch {
          // Some RPC providers cannot serve old account state. Persist a bounded full-block scan cursor.
          const end = a.scanBlock + 20n < head ? a.scanBlock + 20n : head;
          for (let blockNumber = a.scanBlock; blockNumber <= end; blockNumber++) {
            const block = await this.client.getBlock({ blockNumber, includeTransactions: true });
            tx = block.transactions.find(t => same(t.from, terms.buyer) && t.nonce === a.nonce);
            if (tx) break;
          }
          if (!tx) await db.ethereumFundingAttempt.update({ where: { id: a.id }, data: { scanBlock: end + 1n } });
        }
        if (tx) receipt = await receiptIfMined(this.client, tx.hash);
      }
      if (!receipt || !tx || receipt.blockNumber > head) continue;
      const status = classifyFundingReceipt(a, tx, receipt);
      if (status === "confirmed" && isCreation(a.kind)) await this.bindCreation(db, row, terms, receipt);
      await db.ethereumFundingAttempt.update({ where: { id: a.id }, data: {
        status, active: false, txHash: receipt.transactionHash,
        gasPaidWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      } });
    }
  }

  private async inspect(db: Db, row: Escrow, terms: FundingTerms, head: bigint) {
    await this.reconcile(db, row, terms, head);
    const attempts = await db.ethereumFundingAttempt.findMany({ where: { escrowId: row.id }, orderBy: { createdAt: "asc" } });
    const active = attempts.find(a => a.active);
    const fee = await this.client.readContract({ address: terms.factory, abi: escrowFactoryAbi, functionName: "creationFee", blockNumber: head });
    const child = row.contractAddress as Address | null;
    const state = child ? await verifyChild(this.client, child, terms, head) : null;
    if (state !== null && states[state] && row.status !== states[state]
      && !(state === 0 && ["Cancelled", "Resolved", "Completed"].includes(row.status))
      && !(state === 1 && row.status === "InProgress")) {
      // Financial status is derived from the contract, never from an approval or client signal.
      const data: Prisma.EscrowUpdateInput = { status: states[state] };
      if (state >= 1 && state <= 3 && !row.deliveryDeadlineAt) data.deliveryDeadlineAt = new Date(Date.now() + row.deliveryWindowHours * 3_600_000);
      await db.escrow.update({ where: { id: row.id }, data });
      const previousStatus = row.status;
      row.status = states[state];
      if (states[state] === "Funded" && previousStatus !== "Funded") {
        void notifyTradeFunded({
          escrowId: row.id,
          title: row.title,
          amountAtomic: row.amountAtomic,
          buyerUserId: row.buyerUserId,
          sellerUserId: row.sellerUserId,
        }).catch(() => undefined);
      } else if (states[state] === "Completed" && previousStatus !== "Completed") {
        void notifyTradeCompleted({
          escrowId: row.id,
          title: row.title,
          amountAtomic: row.amountAtomic,
          buyerUserId: row.buyerUserId,
          sellerUserId: row.sellerUserId,
        }).catch(() => undefined);
      } else if (states[state] === "Cancelled" && previousStatus !== "Cancelled") {
        void notifyTradeCancelled({
          escrowId: row.id,
          title: row.title,
          buyerUserId: row.buyerUserId,
          sellerUserId: row.sellerUserId,
        }).catch(() => undefined);
      }
    }
    const allowance = child ? await this.client.readContract({ address: terms.token, abi: fundingReadAbi, functionName: "allowance", args: [terms.buyer, child], blockNumber: head }) : 0n;
    const nonce = await this.client.getTransactionCount({ address: terms.buyer, blockNumber: head });
    const pendingNonce = await this.client.getTransactionCount({ address: terms.buyer, blockTag: "pending" });
    const closed = (state !== null && state >= 3) || ["Cancelled", "Completed", "Resolved", "Disputed"].includes(row.status);
    const funded = state === 1 || state === 2;
    const waiting = Boolean(active || (!child && row.createTxHash));
    // A dropped transaction may already have a hash. Explicit continuation reuses its nonce/payload;
    // a transaction visible in the pending nonce count remains locked until confirmation/cancellation.
    const walletCanResume = Boolean(active && nonce === active.nonce && pendingNonce === active.nonce);
    let message = funded ? "Deposit confirmed. Your trade funds are in escrow."
      : closed ? "This trade is no longer awaiting a deposit."
      : active ? (active.txHash ? `${fundingStepLabel(active.kind as FundingKind)} submitted. Waiting for confirmation.`
        : active.status === "rejected" ? "Wallet request declined. No deposit is confirmed. You can continue the saved request when ready."
        : "A wallet request is saved. We are checking for its result. Continue only if you still want to complete it.")
      : row.createTxHash && !child ? "Recovering your saved creation transaction. No new escrow will be created."
      : child ? "Your escrow is ready. Continue to deposit into this existing contract."
      : "Your payment starts with creating an escrow. Each wallet step will be saved.";
    if (!closed && !funded && !active && pendingNonce > nonce) message = "A wallet transaction is pending or confirming. We will check it before starting another request.";
    const last = attempts[attempts.length - 1];
    if (!waiting && !funded && !closed && last && ["reverted", "cancelled", "replaced"].includes(last.status)) message = `The last wallet transaction was ${last.status}. The deposit is not confirmed. Network fees may have been charged. Review the result before continuing.`;
    const snapshot: FundingSnapshot = {
      stage: funded ? "funded" : closed ? "closed" : waiting ? "pending" : "ready", chainState: state, message,
      contractAddress: child, approvalConfirmed: funded || (state === 3) || allowance >= terms.amount + fee,
      amountAtomic: terms.amount.toString(), feeAtomic: fee.toString(), tokenSymbol: row.tokenSymbol,
      canContinue: !closed && !funded && (active ? walletCanResume : !row.createTxHash || Boolean(child)) && pendingNonce === nonce,
      active: active ? view(active) : null, attempts: attempts.map(view),
    };
    return { snapshot, active, fee, nonce, allowance, child };
  }

  get(id: string) { return this.locked(id, async (db, row, terms, head) => (await this.inspect(db, row, terms, head)).snapshot); }

  prepare(id: string, requestId: string, resume = false): Promise<PreparedFunding> {
    return this.locked(id, async (db, row, terms, head) => {
      const current = await this.inspect(db, row, terms, head);
      const prior = await db.ethereumFundingAttempt.findUnique({ where: { requestId } });
      if (prior || !current.snapshot.canContinue) return { snapshot: current.snapshot };
      const accountCode = await this.client.getBytecode({ address: terms.buyer, blockNumber: head });
      if (accountCode && accountCode !== "0x" && !accountCode.startsWith("0xef0100")) throw new FundingError("This recovery flow requires an Ethereum wallet with a standard transaction nonce. Smart-account funding is not supported here yet.", 400);
      let attempt = current.active;
      if (attempt && !resume) return { snapshot: current.snapshot };
      if (!attempt) {
        const competing = await db.ethereumFundingAttempt.findFirst({ where: { buyerAddress: terms.buyer.toLowerCase(), active: true } });
        if (competing) throw new FundingError("Finish the saved wallet request on your other trade before starting this one.");
        const factoryCode = await this.client.getBytecode({ address: terms.factory, blockNumber: head });
        // Fail closed if the legacy/combined selectors are absent. Never use a failed combined send as detection.
        const combined = Boolean(factoryCode?.toLowerCase().includes("630b3d84fd"));
        if (!current.child && !combined && !factoryCode?.toLowerCase().includes("6399830609")) throw new FundingError("This factory version is not supported. No wallet transaction was requested.");
        const allowance = current.child ? current.allowance : combined
          ? await this.client.readContract({ address: terms.token, abi: fundingReadAbi, functionName: "allowance", args: [terms.buyer, terms.factory], blockNumber: head }) : 0n;
        const call = nextFundingCall(terms, current.child, combined, allowance, terms.amount + current.fee);
        const balance = await this.client.readContract({ address: terms.token, abi: fundingReadAbi, functionName: "balanceOf", args: [terms.buyer], blockNumber: head });
        if (balance < terms.amount + current.fee) throw new FundingError("Your token balance must cover the trade amount plus the creation fee.", 400);
        // Simulate before reservation/signing. A revert creates no wallet request.
        await this.client.call({ account: terms.buyer, to: call.to, data: call.data, value: 0n });
        attempt = await db.ethereumFundingAttempt.create({ data: {
          id: randomUUID(), requestId, escrowId: id, buyerAddress: terms.buyer.toLowerCase(), kind: call.kind,
          toAddress: call.to.toLowerCase(), data: call.data, nonce: current.nonce, startBlock: head, scanBlock: head,
        } });
      }
      const data = attempt.data as `0x${string}`;
      const to = attempt.toAddress as Address;
      await this.client.call({ account: terms.buyer, to, data, value: 0n });
      const estimated = await this.client.estimateGas({ account: terms.buyer, to, data, value: 0n });
      const gas = estimated * 120n / 100n;
      const [eth, gasPrice] = await Promise.all([this.client.getBalance({ address: terms.buyer }), this.client.getGasPrice()]);
      if (eth < gas * gasPrice * 135n / 100n) throw new FundingError("Add ETH for the remaining network fee. Keep the trade tokens available for the deposit; paying gas with those tokens can reduce the amount available.", 400);
      return {
        snapshot: { ...current.snapshot, active: view(attempt), stage: "pending", message: `${fundingStepLabel(attempt.kind as FundingKind)}: confirm the saved request in your wallet.` },
        send: { attemptId: attempt.id, from: terms.buyer, to, data, nonce: attempt.nonce, gas: `0x${gas.toString(16)}`, chainId: 1, value: "0x0" },
      };
    });
  }

  report(id: string, attemptId: string, body: { hash?: string; outcome?: "rejected" | "uncertain" }) {
    return this.locked(id, async (db, row, terms, head) => {
      const a = await db.ethereumFundingAttempt.findFirst({ where: { id: attemptId, escrowId: id } });
      if (!a) throw new FundingError("Saved wallet request not found.", 404);
      if (body.hash) {
        if (a.active) {
          // Hash is a hint until the sender, nonce, payload and receipt are verified during reconciliation.
          await db.ethereumFundingAttempt.update({ where: { id: a.id }, data: { txHash: body.hash.toLowerCase(), status: "submitted" } });
        }
      } else if (a.active && !a.txHash) {
        await db.ethereumFundingAttempt.update({ where: { id: a.id }, data: { status: body.outcome || "uncertain" } });
      }
      return (await this.inspect(db, row, terms, head)).snapshot;
    });
  }

  recover(id: string, hash: Hash) {
    return this.locked(id, async (db, row, terms, head) => {
      const receipt = await receiptIfMined(this.client, hash);
      if (!receipt || receipt.blockNumber > head) throw new FundingError("The creation transaction is still pending or confirming. Check again shortly.");
      await this.bindCreation(db, row, terms, receipt);
      return (await this.inspect(db, row, terms, head)).snapshot;
    });
  }
}
