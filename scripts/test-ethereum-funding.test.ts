import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, type Hash, type PublicClient } from "viem";
import { sendMainnetContractTransaction, waitForSuccessfulReceipt, type EthereumProvider } from "../apps/web/src/lib/ethereumTransaction";
import { normalizeEvmFundingError } from "../apps/web/src/lib/evmWalletErrors";

const buyer = "0x1df368e1c238d200cbda400f8cf0c8d1d7ad393e";
const token = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const spender = "0xfe79b53eeaa419cee8b9e4e13916f2fff8c121fb";
const hash = `0x${"ab".repeat(32)}` as Hash;
const abi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const parameters = { address: token, abi, functionName: "approve", args: [spender, 5_000_000n] } as const;

function wallet(options: { chain?: string; accounts?: string[]; sendError?: unknown; result?: unknown } = {}) {
  const calls: { method: string; params?: unknown[] }[] = [];
  const provider: EthereumProvider = { async request(request) {
    calls.push(request);
    if (request.method === "eth_chainId") return options.chain ?? "0x1";
    if (request.method === "eth_accounts") return options.accounts ?? [buyer];
    if (request.method === "eth_sendTransaction") {
      if (options.sendError) throw options.sendError;
      return options.result ?? hash;
    }
    throw new Error(`Unexpected wallet method ${request.method}`);
  } };
  return { provider, calls, sends: () => calls.filter(c => c.method.endsWith("sendTransaction")) };
}

test("one mainnet approval preserves spender, exact amount, value and gas", async () => {
  const w = wallet();
  assert.equal(await sendMainnetContractTransaction(w.provider, buyer, { ...parameters, gas: 80000n, value: 0n }), hash);
  assert.equal(w.sends().length, 1);
  const tx = w.sends()[0].params![0] as Record<string, string>;
  assert.equal(tx.chainId, "0x1");
  assert.equal(tx.from, buyer);
  assert.equal(tx.to, token);
  assert.equal(tx.data, encodeFunctionData(parameters));
  assert.equal(tx.gas, "0x13880");
  assert.equal(tx.value, "0x0");
});

for (const [label, error] of [
  ["user rejection", { code: 4001, message: "User rejected" }],
  ["wallet security block", { code: -32000, message: "High-risk transaction blocked" }],
  ["simulation revert", { code: 3, message: "execution reverted" }],
  ["uncertain network result", new Error("Network connection lost after submission")],
] as const) {
  test(`${label} never resubmits or switches RPC methods`, async () => {
    const w = wallet({ sendError: error });
    await assert.rejects(sendMainnetContractTransaction(w.provider, buyer, parameters), e => e === error);
    assert.equal(w.sends().length, 1);
  });
}

test("wrong signing chain stops before a send", async () => {
  const w = wallet({ chain: "0x89" });
  await assert.rejects(sendMainnetContractTransaction(w.provider, buyer, parameters), /not on Ethereum mainnet/);
  assert.equal(w.sends().length, 0);
});

test("a different signing account stops before a send", async () => {
  const w = wallet({ accounts: [spender] });
  await assert.rejects(sendMainnetContractTransaction(w.provider, buyer, parameters), /account selected/);
  assert.equal(w.sends().length, 0);
});

test("malformed wallet result does not trigger a second send", async () => {
  const w = wallet({ result: "0x123" });
  await assert.rejects(sendMainnetContractTransaction(w.provider, buyer, parameters), /valid transaction hash/);
  assert.equal(w.sends().length, 1);
});

test("a reverted approval prevents the deposit step", async () => {
  let depositStarted = false;
  const client = { waitForTransactionReceipt: async () => ({ status: "reverted", transactionHash: hash }) } as unknown as PublicClient;
  await assert.rejects(async () => { await waitForSuccessfulReceipt(client, hash); depositStarted = true; }, /reverted on Ethereum/);
  assert.equal(depositStarted, false);
});

test("a successful receipt remains available for escrow event decoding", async () => {
  const receipt = { status: "success", transactionHash: hash, logs: [{ address: spender }] };
  const client = { waitForTransactionReceipt: async () => receipt } as unknown as PublicClient;
  assert.equal(await waitForSuccessfulReceipt(client, hash), receipt);
});

test("plain wallet errors preserve the actual simulation or security message", () => {
  assert.equal(normalizeEvmFundingError({ code: 3, message: "execution reverted: Same party" }, {}), "execution reverted: Same party");
  assert.equal(normalizeEvmFundingError({ code: -32000, message: "High-risk approval blocked" }, {}), "High-risk approval blocked");
});

for (const reason of ["cancelled", "replaced", "repriced"] as const) {
  test(`a ${reason} transaction is handled before continuing`, async () => {
    const receipt = { status: "success", transactionHash: hash };
    const client = { waitForTransactionReceipt: async (args: { onReplaced: (event: { reason: string }) => void }) => {
      args.onReplaced({ reason });
      return receipt;
    } } as unknown as PublicClient;
    if (reason === "repriced") assert.equal(await waitForSuccessfulReceipt(client, hash), receipt);
    else await assert.rejects(waitForSuccessfulReceipt(client, hash), new RegExp(`was ${reason}`));
  });
}
