import { keccak256, stringToHex } from "viem";
import type { TronWebLike } from "./types";

export type TronWalletSigner = {
  signTransaction: (transaction: unknown) => Promise<unknown>;
};

const TRC20_BALANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
];

const TRC20_ALLOWANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
];

export function isTronBase58Address(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim());
}

function parseTrc20BalanceRaw(raw: unknown): bigint {
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "number") return BigInt(raw);
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.startsWith("0x")) return BigInt(t);
    return BigInt(t || "0");
  }
  if (raw && typeof raw === "object") {
    if ("_hex" in raw) return BigInt((raw as { _hex: string })._hex);
    if ("toString" in raw && typeof (raw as { toString: () => string }).toString === "function") {
      const s = (raw as { toString: () => string }).toString();
      if (/^\d+$/.test(s)) return BigInt(s);
    }
  }
  return BigInt(String(raw ?? "0"));
}

export async function fetchTrc20Balance(
  tw: TronWebLike,
  tokenBase58: string,
  ownerBase58: string,
): Promise<bigint> {
  const factory = await tw.contract(TRC20_BALANCE_ABI, tokenBase58);
  const at = await factory.at(tokenBase58);
  const raw = await at.balanceOf(ownerBase58).call();
  return parseTrc20BalanceRaw(raw);
}

export async function fetchTrc20Allowance(
  tw: TronWebLike,
  tokenBase58: string,
  ownerBase58: string,
  spenderBase58: string,
): Promise<bigint> {
  const factory = await tw.contract(TRC20_ALLOWANCE_ABI, tokenBase58);
  const at = await factory.at(tokenBase58);
  const raw = await (at as unknown as {
    allowance: (owner: string, spender: string) => { call: () => Promise<unknown> };
  }).allowance(ownerBase58, spenderBase58).call();
  return parseTrc20BalanceRaw(raw);
}

/** Minimal factory + deal ABIs for TronLink contract().at() calls */
export const TRON_FACTORY_ABI = [
  { name: "resolver", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "factoryVersion", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    inputs: [
      { name: "seller", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "optionalAgent", type: "address" },
    ],
    name: "createAndFund",
    outputs: [{ name: "escrow", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "optionalAgent", type: "address" },
    ],
    name: "createEscrow",
    outputs: [{ name: "escrow", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export async function tronFactoryVersion(tw: TronWebLike, factoryBase58: string): Promise<number> {
  try {
    const bound = await tw.contract(TRON_FACTORY_ABI, factoryBase58);
    const factory = await bound.at(factoryBase58);
    const value = await (factory as unknown as { factoryVersion: () => { call: () => Promise<unknown> } }).factoryVersion().call();
    return Number(value);
  } catch {
    // Legacy factories and unreachable RPCs are both treated as unsupported.
    return 0;
  }
}

export const TRON_DEAL_ABI = [
  { name: "factory", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "fund", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    name: "submitProof",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "proofHash", type: "bytes32" }],
    outputs: [],
  },
  { name: "approveRelease", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "requestCancel", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "refuseCancel", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "state", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "buyerCancelRequested", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { name: "deliveryProofHash", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "openDispute", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "freezeDispute", type: "function", stateMutability: "nonpayable", inputs: [{ name: "opener", type: "address" }], outputs: [] },
  { name: "withdrawDispute", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    name: "resolveDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "buyerFavor", type: "bool" }],
    outputs: [],
  },
];

export async function tronDealAction(
  tw: TronWebLike,
  signer: TronWalletSigner,
  ownerAddress: string,
  contractBase58: string,
  fn: "fund" | "submitProof" | "approveRelease" | "requestCancel" | "refuseCancel" | "openDispute" | "freezeDispute" | "withdrawDispute" | "resolveDispute",
  args: unknown[] = [],
  note?: string,
): Promise<string> {
  const selectors: Record<typeof fn, string> = {
    fund: "fund()",
    submitProof: "submitProof(bytes32)",
    approveRelease: "approveRelease()",
    requestCancel: "requestCancel()",
    refuseCancel: "refuseCancel()",
    openDispute: "openDispute()",
    freezeDispute: "freezeDispute(address)",
    withdrawDispute: "withdrawDispute()",
    resolveDispute: "resolveDispute(bool)",
  };
  const types: Record<typeof fn, string[]> = {
    fund: [],
    submitProof: ["bytes32"],
    approveRelease: [],
    requestCancel: [],
    refuseCancel: [],
    openDispute: [],
    freezeDispute: ["address"],
    withdrawDispute: [],
    resolveDispute: ["bool"],
  };
  return sendTronContractAction(
    tw,
    signer,
    ownerAddress,
    contractBase58,
    selectors[fn],
    types[fn].map((type, index) => ({ type, value: args[index] })),
    note,
  );
}

export async function tronCreateEscrow(
  tw: TronWebLike,
  signer: TronWalletSigner,
  ownerAddress: string,
  factoryBase58: string,
  buyer: string,
  seller: string,
  token: string,
  amountAtomic: string,
  agent: string,
): Promise<string> {
  return sendTronContractAction(
    tw,
    signer,
    ownerAddress,
    factoryBase58,
    "createEscrow(address,address,address,uint256,address)",
    [
      { type: "address", value: buyer },
      { type: "address", value: seller },
      { type: "address", value: token },
      { type: "uint256", value: amountAtomic },
      { type: "address", value: agent },
    ],
  );
}

export async function tronCreateAndFundEscrow(
  tw: TronWebLike,
  signer: TronWalletSigner,
  ownerAddress: string,
  factoryBase58: string,
  seller: string,
  token: string,
  amountAtomic: string,
  agent: string,
  note?: string,
): Promise<{ txId: string; escrowAddress: string }> {
  const txId = await sendTronContractAction(
    tw,
    signer,
    ownerAddress,
    factoryBase58,
    "createAndFund(address,address,uint256,address)",
    [
      { type: "address", value: seller },
      { type: "address", value: token },
      { type: "uint256", value: amountAtomic },
      { type: "address", value: agent },
    ],
    note,
  );
  const info = await tw.trx.getTransactionInfo(txId);
  const topic0 = keccak256(stringToHex("EscrowCreated(address,address,address,address,uint256,address)")).toLowerCase();
  const eventLog = info.log?.find((log) => log.topics?.[0]?.toLowerCase() === topic0 && log.topics?.[1]);
  const topic = eventLog?.topics?.[1];
  if (!topic) throw new Error("The funding transaction confirmed, but its escrow address was not found in the factory receipt.");
  const addressHex = `41${topic.slice(-40)}`;
  return { txId, escrowAddress: tw.address.fromHex(addressHex) };
}

export async function tronApproveTrc20(
  tw: TronWebLike,
  signer: TronWalletSigner,
  ownerAddress: string,
  tokenBase58: string,
  spenderBase58: string,
  amountAtomic: string,
  note?: string,
): Promise<string> {
  return sendTronContractAction(
    tw,
    signer,
    ownerAddress,
    tokenBase58,
    "approve(address,uint256)",
    [
      { type: "address", value: spenderBase58 },
      { type: "uint256", value: amountAtomic },
    ],
    note,
  );
}

async function sendTronContractAction(
  tw: TronWebLike,
  signer: TronWalletSigner,
  ownerAddress: string,
  contractAddress: string,
  functionSelector: string,
  parameters: { type: string; value: unknown }[],
  note?: string,
): Promise<string> {
  const built = await tw.transactionBuilder.triggerSmartContract(
    contractAddress,
    functionSelector,
    { feeLimit: 100_000_000, callValue: 0, shouldPollResponse: false },
    parameters,
    tw.address.toHex(ownerAddress),
  );
  if (!built.result?.result || !built.transaction) {
    throw new Error(built.Error || built.result?.message || `Could not prepare ${functionSelector} transaction`);
  }

  const transaction = note?.trim()
    ? await tw.transactionBuilder.addUpdateData(built.transaction, note.trim(), "utf8")
    : built.transaction;
  const signed = await signer.signTransaction(transaction);
  if (!signed || typeof signed !== "object" || !("txID" in signed)) {
    throw new Error("The selected wallet did not return a signed TRON transaction");
  }
  const signedTransaction = signed as { txID: string; signature?: string[] };
  if (!signedTransaction.signature?.length) throw new Error("The selected wallet did not sign the transaction");

  const broadcast = await tw.trx.sendRawTransaction(signed);
  if (!broadcast.result) {
    throw new Error(broadcast.message || broadcast.code || "The TRON network rejected the transaction");
  }
  return waitForTronTransaction(tw, broadcast.txid || signedTransaction.txID);
}

async function waitForTronTransaction(tw: TronWebLike, txId: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const info = await tw.trx.getTransactionInfo(txId);
    if (info.result === "FAILED") throw new Error(info.resMessage || "The TRON transaction failed on-chain");
    if (info.receipt?.result && info.receipt.result !== "SUCCESS") {
      throw new Error(info.resMessage || "The TRON transaction reverted on-chain");
    }
    if (info.receipt?.result === "SUCCESS" || "contractResult" in info) return txId;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Transaction submitted (${txId}) but is not confirmed yet. Refresh the trade in a moment.`);
}
