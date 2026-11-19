import { Interface, JsonRpcProvider } from "ethers";

const RPC = "https://ethereum-rpc.publicnode.com";
const CHAIN = "eip155:1";

const deal = new Interface([
  "function state() view returns (uint8)",
  "function buyerCancelRequested() view returns (bool)",
  "function fund()",
  "function approveRelease(bytes32 proofHash)",
  "function requestCancel()",
  "function refuseCancel()",
  "function openDispute()",
  "function withdrawDispute()",
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

const publicClient = new JsonRpcProvider(RPC, 1, { staticNetwork: true });

export function chainError(error: unknown) {
  const message = error instanceof Error ? error.message : "The wallet action failed.";
  if (/user rejected|user denied|rejected the request/i.test(message)) return "The wallet request was cancelled.";
  const short = message.replace(/^execution reverted:?\s*/i, "").trim();
  return short.slice(0, 280) || "The wallet action failed.";
}

async function read(to: string, data: string) {
  const result = await publicClient.call({ to, data });
  return result;
}

export async function readDeal(address: string) {
  try {
    const stateRaw = await read(address, deal.encodeFunctionData("state"));
    const cancelRaw = await read(address, deal.encodeFunctionData("buyerCancelRequested"));
    const state = Number(deal.decodeFunctionResult("state", stateRaw)[0]);
    const buyerCancelRequested = Boolean(deal.decodeFunctionResult("buyerCancelRequested", cancelRaw)[0]);
    return { state, buyerCancelRequested };
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

async function send(provider: WalletProvider, from: string, to: string, data: string) {
  await ensureMainnet(provider);
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

export async function releaseFunds(provider: WalletProvider, from: string, escrow: string, proofHash: string) {
  return send(provider, from, escrow, deal.encodeFunctionData("approveRelease", [proofHash]));
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

export async function readTronDeal(address: string) {
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
