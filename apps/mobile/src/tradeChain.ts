import { AbiCoder, Interface, JsonRpcProvider } from "ethers";
import {
  inspectEscrowDealCapabilities,
  type EscrowDealCapabilities,
} from "../../../packages/shared/src/escrowCompat";

const RPC = "https://ethereum-rpc.publicnode.com";
const CHAIN = "eip155:1";

const deal = new Interface([
  "function state() view returns (uint8)",
  "function buyer() view returns (address)",
  "function seller() view returns (address)",
  "function deliveryProofHash() view returns (bytes32)",
  "function buyerCancelRequested() view returns (bool)",
  "function fund()",
  "function submitProof(bytes32 proofHash)",
  "function requestCancel()",
  "function refuseCancel()",
  "function openDispute()",
  "function withdrawDispute()",
]);

const dealV1Release = new Interface([
  "function approveRelease()",
]);

const dealV2Release = new Interface([
  "function approveRelease(bytes32 proofHash)",
]);

const token = new Interface([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount)",
]);

const factory = new Interface([
  "function creationFee() view returns (uint256)",
]);

export type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }, chain?: string) => Promise<unknown>;
};

export type DealChainView = {
  state: number;
  buyerCancelRequested: boolean;
  proofSubmitted?: boolean;
  capabilities?: EscrowDealCapabilities | null;
};

const publicClient = new JsonRpcProvider(RPC, 1, { staticNetwork: true });
const capabilitiesCache = new Map<string, EscrowDealCapabilities>();

function proofIsSet(value: unknown): boolean {
  const hex = typeof value === "string" ? value : "";
  return /^0x[0-9a-fA-F]{64}$/.test(hex) && !/^0x0+$/.test(hex);
}

function decodeRevertData(data: unknown): string | null {
  if (typeof data !== "string" || !data.startsWith("0x") || data.length <= 2) return null;
  if (data.startsWith("0x08c379a0") && data.length >= 138) {
    try {
      const [reason] = AbiCoder.defaultAbiCoder().decode(["string"], `0x${data.slice(10)}`);
      if (typeof reason === "string" && reason.trim()) return reason.trim();
    } catch {
      return null;
    }
  }
  return null;
}

export function chainError(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as { reason?: unknown; shortMessage?: unknown; data?: unknown; message?: unknown };
    if (typeof record.reason === "string" && record.reason.trim()) {
      return record.reason.trim().slice(0, 280);
    }
    const decoded = decodeRevertData(record.data);
    if (decoded) return decoded.slice(0, 280);
    if (typeof record.shortMessage === "string" && record.shortMessage.trim()) {
      const cleaned = record.shortMessage.replace(/^execution reverted:?\s*/i, "").trim();
      if (cleaned && cleaned !== "execution reverted (unknown custom error)") return cleaned.slice(0, 280);
    }
  }
  const message = error instanceof Error ? error.message : "The wallet action failed.";
  if (/user rejected|user denied|rejected the request/i.test(message)) return "The wallet request was cancelled.";
  const short = message.replace(/^execution reverted:?\s*/i, "").trim();
  return short.slice(0, 280) || "The wallet action failed.";
}

async function read(to: string, data: string) {
  return publicClient.call({ to, data });
}

export async function readDealCapabilities(address: string): Promise<EscrowDealCapabilities> {
  const key = address.toLowerCase();
  const cached = capabilitiesCache.get(key);
  if (cached && cached.releaseMode !== "unknown") return cached;
  const caps = await inspectEscrowDealCapabilities(address, (target) => publicClient.getCode(target));
  if (caps.releaseMode !== "unknown") {
    capabilitiesCache.set(key, caps);
  }
  return caps;
}

export async function readDeal(address: string): Promise<DealChainView | null> {
  try {
    const [stateRaw, cancelRaw, proofRaw, capabilities] = await Promise.all([
      read(address, deal.encodeFunctionData("state")),
      read(address, deal.encodeFunctionData("buyerCancelRequested")),
      read(address, deal.encodeFunctionData("deliveryProofHash")).catch(() => null),
      readDealCapabilities(address).catch(() => null),
    ]);
    const state = Number(deal.decodeFunctionResult("state", stateRaw)[0]);
    const buyerCancelRequested = Boolean(deal.decodeFunctionResult("buyerCancelRequested", cancelRaw)[0]);
    const proofHash = proofRaw ? String(deal.decodeFunctionResult("deliveryProofHash", proofRaw)[0]) : "";
    return {
      state,
      buyerCancelRequested,
      proofSubmitted: proofIsSet(proofHash),
      capabilities,
    };
  } catch {
    return null;
  }
}

export async function readCreationFee(factoryAddress: string) {
  try {
    const raw = await read(factoryAddress, factory.encodeFunctionData("creationFee"));
    return factory.decodeFunctionResult("creationFee", raw)[0] as bigint;
  } catch {
    return 1_000_000n;
  }
}

async function ensureMainnet(provider: WalletProvider) {
  const chainId = await provider.request({ method: "eth_chainId" }, CHAIN);
  if (chainId !== "0x1") {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] }, CHAIN);
  }
}

async function simulateCall(from: string, to: string, data: string) {
  try {
    await publicClient.call({ from, to, data });
  } catch (error) {
    throw new Error(chainError(error));
  }
}

async function send(provider: WalletProvider, from: string, to: string, data: string) {
  await ensureMainnet(provider);
  await simulateCall(from, to, data);
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data }],
  }, CHAIN);
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet did not return a transaction.");
  const receipt = await publicClient.waitForTransaction(hash);
  if (!receipt || receipt.status !== 1) throw new Error("The transaction failed.");
  return receipt;
}

async function balanceOf(owner: string, tokenAddress: string) {
  const raw = await read(tokenAddress, token.encodeFunctionData("balanceOf", [owner]));
  return token.decodeFunctionResult("balanceOf", raw)[0] as bigint;
}

export async function submitProofOnChain(provider: WalletProvider, from: string, escrow: string, proofHash: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(proofHash)) {
    throw new Error("Upload fulfilment proof in chat first, then submit fulfilment on-chain.");
  }
  const [stateRaw, sellerRaw] = await Promise.all([
    read(escrow, deal.encodeFunctionData("state")),
    read(escrow, deal.encodeFunctionData("seller")),
  ]);
  const state = Number(deal.decodeFunctionResult("state", stateRaw)[0]);
  const onChainSeller = String(deal.decodeFunctionResult("seller", sellerRaw)[0]);
  if (from.toLowerCase() !== onChainSeller.toLowerCase()) {
    throw new Error("Connect the seller wallet linked to this trade before submitting on-chain proof.");
  }
  if (state === 2) {
    return null;
  }
  if (state !== 1) {
    throw new Error("The on-chain escrow must be Funded before submitting fulfilment proof.");
  }
  return send(provider, from, escrow, deal.encodeFunctionData("submitProof", [proofHash]));
}

export async function releaseFunds(provider: WalletProvider, from: string, escrow: string, proofHash?: string) {
  const [caps, stateRaw, buyerRaw, onChainProofRaw] = await Promise.all([
    readDealCapabilities(escrow),
    read(escrow, deal.encodeFunctionData("state")),
    read(escrow, deal.encodeFunctionData("buyer")),
    read(escrow, deal.encodeFunctionData("deliveryProofHash")).catch(() => null),
  ]);
  const state = Number(deal.decodeFunctionResult("state", stateRaw)[0]);
  const onChainBuyer = String(deal.decodeFunctionResult("buyer", buyerRaw)[0]);
  if (from.toLowerCase() !== onChainBuyer.toLowerCase()) {
    throw new Error("Connect the buyer wallet linked to this trade before releasing funds.");
  }
  if (caps.releaseMode === "v1-zero-arg") {
    if (state === 1) {
      throw new Error("The seller must submit fulfilment proof on-chain before you can release funds on this escrow contract.");
    }
    if (state !== 2) {
      throw new Error("This escrow contract is not in a releasable state.");
    }
    return send(provider, from, escrow, dealV1Release.encodeFunctionData("approveRelease"));
  }
  if (caps.releaseMode === "v2-proof-hash") {
    if (state !== 1 && state !== 2) {
      throw new Error("This escrow contract is not in a releasable state.");
    }
    if (!proofHash || !/^0x[0-9a-fA-F]{64}$/.test(proofHash)) {
      throw new Error("Waiting for fulfilment proof in chat before release.");
    }
    const onChainProof = onChainProofRaw ? String(deal.decodeFunctionResult("deliveryProofHash", onChainProofRaw)[0]) : "";
    if (proofIsSet(onChainProof) && onChainProof.toLowerCase() !== proofHash.toLowerCase()) {
      throw new Error("The chat fulfilment proof hash does not match the proof hash recorded on-chain.");
    }
    return send(provider, from, escrow, dealV2Release.encodeFunctionData("approveRelease", [proofHash]));
  }
  throw new Error("Could not determine the release function supported by this escrow contract.");
}

export async function requestCancel(provider: WalletProvider, from: string, escrow: string) {
  return send(provider, from, escrow, deal.encodeFunctionData("requestCancel"));
}

export async function refuseCancel(provider: WalletProvider, from: string, escrow: string) {
  return send(provider, from, escrow, deal.encodeFunctionData("refuseCancel"));
}

export async function openDisputeOnChain(provider: WalletProvider, from: string, escrow: string) {
  return send(provider, from, escrow, deal.encodeFunctionData("openDispute"));
}

export async function withdrawDisputeOnChain(provider: WalletProvider, from: string, escrow: string) {
  const caps = await readDealCapabilities(escrow);
  if (!caps.supportsWithdrawDispute) {
    throw new Error("This escrow contract version does not support on-chain dispute withdrawal.");
  }
  return send(provider, from, escrow, deal.encodeFunctionData("withdrawDispute"));
}

export async function readTokenBalance(owner: string, tokenAddress: string) {
  return balanceOf(owner, tokenAddress);
}

async function tronConstant(contractAddress: string, selector: string) {
  const response = await fetch("https://api.trongrid.io/wallet/triggerconstantcontract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_address: contractAddress,
      contract_address: contractAddress,
      function_selector: selector,
      visible: true,
    }),
  });
  if (!response.ok) return null;
  const body = await response.json() as { constant_result?: string[] };
  const hex = body.constant_result?.[0];
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  return BigInt(`0x${hex}`);
}

export async function readTronCreationFee(factoryAddress: string) {
  try {
    const fee = await tronConstant(factoryAddress, "creationFee()");
    return fee == null ? 1_000_000n : fee;
  } catch {
    return 1_000_000n;
  }
}

export async function readTronDeal(address: string): Promise<DealChainView | null> {
  try {
    const state = await tronConstant(address, "state()");
    const cancel = await tronConstant(address, "buyerCancelRequested()");
    if (state == null) return null;
    return { state: Number(state), buyerCancelRequested: cancel === 1n };
  } catch {
    return null;
  }
}

// Ethereum funding uses the durable server-prepared flow in NativeEthereumFunding.tsx.
