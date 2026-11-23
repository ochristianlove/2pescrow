import { decodeEventLog, encodeFunctionData, parseAbi, type Address, type Hash, type PublicClient, type Transaction, type TransactionReceipt } from "viem";
import { escrowFactoryAbi, type FundingKind } from "@2pescrow/shared";

export const fundingReadAbi = parseAbi([
  "function state() view returns (uint8)", "function factory() view returns (address)",
  "function buyer() view returns (address)", "function seller() view returns (address)",
  "function token() view returns (address)", "function escrowAmount() view returns (uint256)",
  "function fund()", "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)",
]);
export type FundingTerms = { factory: Address; allowedFactories?: Address[]; optionalAgent?: Address; buyer: Address; seller: Address; token: Address; amount: bigint };
export const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const allowedFactoryMatch = (candidate: string | null | undefined, terms: FundingTerms) =>
  (terms.allowedFactories?.length ? terms.allowedFactories : [terms.factory]).some((f) => same(candidate, f));
const zero = "0x0000000000000000000000000000000000000000" as Address;

export function creationChild(receipt: TransactionReceipt, terms: FundingTerms): Address {
  if (receipt.status !== "success" || !same(receipt.from, terms.buyer) || !allowedFactoryMatch(receipt.to, terms)) {
    throw new Error("The creation receipt does not match this buyer and factory.");
  }
  const expectedAgent = terms.optionalAgent || zero;
  const matches: Address[] = [];
  for (const log of receipt.logs) {
    if (!allowedFactoryMatch(log.address, terms)) continue;
    try {
      const e = decodeEventLog({ abi: escrowFactoryAbi, data: log.data, topics: log.topics });
      if (e.eventName === "EscrowCreated" && same(e.args.buyer, terms.buyer) && same(e.args.seller, terms.seller)
        && same(e.args.token, terms.token) && e.args.amount === terms.amount && same(e.args.optionalAgent, expectedAgent)) matches.push(e.args.escrow);
    } catch { /* Not a creation event. */ }
  }
  if (matches.length !== 1) throw new Error("This transaction does not contain one escrow matching this trade.");
  return matches[0];
}

export function classifyFundingReceipt(
  intent: { buyerAddress: string; toAddress: string; data: string; nonce: number },
  tx: Pick<Transaction, "from" | "to" | "input" | "value" | "nonce">,
  receipt: Pick<TransactionReceipt, "status">,
): "confirmed" | "reverted" | "cancelled" | "replaced" {
  if (!same(tx.from, intent.buyerAddress) || tx.nonce !== intent.nonce) throw new Error("Transaction does not match the saved wallet request.");
  if (same(tx.to, intent.toAddress) && tx.input.toLowerCase() === intent.data.toLowerCase() && tx.value === 0n) {
    return receipt.status === "success" ? "confirmed" : "reverted";
  }
  return same(tx.to, tx.from) && tx.value === 0n && tx.input === "0x" ? "cancelled" : "replaced";
}

export async function verifyChild(client: PublicClient, child: Address, terms: FundingTerms, blockNumber: bigint) {
  const [factory, buyer, seller, token, amount, state] = await Promise.all([
    client.readContract({ address: child, abi: fundingReadAbi, functionName: "factory", blockNumber }),
    client.readContract({ address: child, abi: fundingReadAbi, functionName: "buyer", blockNumber }),
    client.readContract({ address: child, abi: fundingReadAbi, functionName: "seller", blockNumber }),
    client.readContract({ address: child, abi: fundingReadAbi, functionName: "token", blockNumber }),
    client.readContract({ address: child, abi: fundingReadAbi, functionName: "escrowAmount", blockNumber }),
    client.readContract({ address: child, abi: fundingReadAbi, functionName: "state", blockNumber }),
  ]);
  if (!allowedFactoryMatch(factory, terms) || !same(buyer, terms.buyer) || !same(seller, terms.seller) || !same(token, terms.token) || amount !== terms.amount) {
    throw new Error("The saved escrow does not match this trade. Funding is paused for review.");
  }
  return Number(state);
}

export function nextFundingCall(terms: FundingTerms, child: Address | null, combined: boolean, allowance: bigint, required: bigint) {
  const spender = child || terms.factory;
  const optionalAgent = terms.optionalAgent || zero;
  if (!child && !combined) return {
    kind: "create" as FundingKind, to: terms.factory,
    data: encodeFunctionData({ abi: escrowFactoryAbi, functionName: "createEscrow", args: [terms.buyer, terms.seller, terms.token, terms.amount, optionalAgent] }),
  };
  if (allowance < required) return {
    kind: (allowance > 0n ? "reset" : "approve") as FundingKind, to: terms.token,
    data: encodeFunctionData({ abi: fundingReadAbi, functionName: "approve", args: [spender, allowance > 0n ? 0n : required] }),
  };
  return child
    ? { kind: "deposit" as FundingKind, to: child, data: encodeFunctionData({ abi: fundingReadAbi, functionName: "fund" }) }
    : { kind: "createAndFund" as FundingKind, to: terms.factory, data: encodeFunctionData({ abi: escrowFactoryAbi, functionName: "createAndFund", args: [terms.seller, terms.token, terms.amount, optionalAgent] }) };
}

/** First block containing a consumed nonce. Archive-state RPCs use O(log n); callers retain a bounded scan fallback. */
export async function findNonceTransaction(client: PublicClient, buyer: Address, nonce: number, start: bigint, end: bigint): Promise<Transaction | undefined> {
  let low = start;
  let high = end;
  while (low < high) {
    const mid = (low + high) / 2n;
    const count = await client.getTransactionCount({ address: buyer, blockNumber: mid });
    if (count > nonce) high = mid;
    else low = mid + 1n;
  }
  const block = await client.getBlock({ blockNumber: low, includeTransactions: true });
  return block.transactions.find(tx => same(tx.from, buyer) && tx.nonce === nonce);
}

export async function receiptIfMined(client: PublicClient, hash: Hash) {
  try { return await client.getTransactionReceipt({ hash }); }
  catch (e) {
    if (e && typeof e === "object" && "name" in e && e.name === "TransactionReceiptNotFoundError") return null;
    throw e; // RPC failure is uncertainty, never evidence that a transaction failed or disappeared.
  }
}
