import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData } from "viem";
import { continueFunding, sendPreparedFundingTransaction, type FundingSnapshot, type FundingTransport, type PreparedFunding } from "../packages/shared/src/funding";
import { nextFundingCall, fundingReadAbi } from "../apps/api/src/ethereumFundingChain";
const buyer = "0x2222222222222222222222222222222222222222";
const factory = "0x1111111111111111111111111111111111111111";
const child = "0x5555555555555555555555555555555555555555";
const token = "0x4444444444444444444444444444444444444444";
const hash = `0x${"ab".repeat(32)}`;
const ready: FundingSnapshot = { stage: "ready", message: "Ready", contractAddress: null, approvalConfirmed: false, amountAtomic: "4000000", feeAtomic: "1000000", tokenSymbol: "USDT", canContinue: true, active: null, attempts: [] };
const attempt = { id: "attempt", kind: "create" as const, status: "reserved", hash: null, nonce: 7, gasPaidWei: null };
const tx: NonNullable<PreparedFunding["send"]> = { attemptId: attempt.id, chainId: 1, from: buyer, to: factory, data: "0x99830609", nonce: 7, gas: "0x493e0", value: "0x0" };
function harness() {
  let state = { ...ready };
  const events: string[] = [];
  const io: FundingTransport = {
    get: async () => state,
    prepare: async (_id, resume) => { events.push(`prepare:${resume}`); state = { ...state, stage: "pending", active: attempt }; return { snapshot: state, send: tx }; },
    send: async () => { events.push("send"); return hash; },
    remember: async () => { events.push("remember"); },
    report: async (_id, body) => { events.push(body.hash ? "report:hash" : `report:${body.outcome}`); state = { ...state, canContinue: false }; },
    progress: () => undefined, requestId: () => "test-request", pause: async () => undefined,
  };
  return { io, events, set: (value: FundingSnapshot) => { state = value; } };
}
test("opening an already-funded, closed or pending trade sends nothing", async () => {
  for (const stage of ["funded", "closed", "pending"] as const) {
    const h = harness(); h.set({ ...ready, stage, canContinue: false });
    await continueFunding(h.io); assert.deepEqual(h.events, []);
  }
});
test("server preparation is durable before signing, hash is remembered before reporting, polling never resends", async () => {
  const h = harness(); await continueFunding(h.io);
  assert.deepEqual(h.events, ["prepare:false", "send", "remember", "report:hash"]);
});
test("lost prepare response does not reach the wallet", async () => {
  const h = harness(); h.io.prepare = async () => { throw new Error("API connection lost"); };
  await assert.rejects(continueFunding(h.io), /connection lost/); assert.equal(h.events.length, 0);
});
test("lost hash-report response stops subsequent wallet requests", async () => {
  const h = harness(); h.io.report = async () => { throw new Error("offline"); };
  await assert.rejects(continueFunding(h.io), /offline/);
  assert.deepEqual(h.events, ["prepare:false", "send", "remember"]);
});
for (const error of [{ code: 4001, message: "Rejected" }, { code: -32000, message: "Simulation reverted" }, new Error("Wallet timed out")]) {
  test(`wallet error (${error.message}) stops without a second submission`, async () => {
    const h = harness(); h.io.send = async () => { h.events.push("send"); throw error; };
    await assert.rejects(continueFunding(h.io));
    assert.equal(h.events.filter(e => e === "send").length, 1);
    assert(h.events.includes("code" in error && error.code === 4001 ? "report:rejected" : "report:uncertain"));
  });
}
test("browser storage failure does not discard a returned hash: it is still reported", async () => {
  const h = harness(); h.io.remember = async () => { throw new Error("Storage unavailable"); };
  await continueFunding(h.io); assert(h.events.includes("report:hash"));
});
test("resuming an uncertain request requires explicit continuation and does not advance after cancellation", async () => {
  const h = harness(); h.set({ ...ready, stage: "pending", active: attempt });
  h.io.report = async () => h.set({ ...ready, attempts: [{ ...attempt, status: "cancelled", hash }] });
  await continueFunding(h.io);
  assert.equal(h.events[0], "prepare:true"); assert.equal(h.events.filter(e => e === "send").length, 1);
});
test("reverted deposit is not automatically retried", async () => {
  const h = harness(); h.io.report = async () => h.set({ ...ready, attempts: [{ ...attempt, status: "reverted", hash }] });
  await continueFunding(h.io); assert.equal(h.events.filter(e => e === "send").length, 1);
});
test("actual signer chain/account are checked, and nonce and zero ETH value are preserved", async () => {
  const requests: { method: string; params?: unknown[] }[] = [];
  let chain = "0x89"; let accounts = [buyer];
  const provider = { request: async (request: { method: string; params?: unknown[] }) => {
    requests.push(request);
    if (request.method === "eth_chainId") return chain;
    if (request.method === "eth_accounts") return accounts;
    return hash;
  } };
  await assert.rejects(sendPreparedFundingTransaction(provider, buyer, tx), /mainnet/);
  chain = "0x1"; accounts = [factory];
  await assert.rejects(sendPreparedFundingTransaction(provider, buyer, tx), /buyer wallet/);
  accounts = [buyer]; await sendPreparedFundingTransaction(provider, buyer, tx);
  const sends = requests.filter(r => r.method === "eth_sendTransaction");
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0].params, [{ from: buyer, to: factory, data: tx.data, gas: tx.gas, value: "0x0", nonce: "0x7", chainId: "0x1" }]);
});
test("legacy factory creates first and approves the child; combined factory approves the factory", () => {
  const terms = { factory, buyer, token, seller: "0x3333333333333333333333333333333333333333" as const, amount: 4_000_000n };
  const create = nextFundingCall(terms, null, false, 0n, 5_000_000n);
  assert.equal(create.kind, "create"); assert(create.data.startsWith("0x99830609"));
  const approval = nextFundingCall(terms, child, false, 0n, 5_000_000n);
  assert.equal(decodeFunctionData({ abi: fundingReadAbi, data: approval.data }).args![0], child);
  const combined = nextFundingCall(terms, null, true, 0n, 5_000_000n);
  assert.equal(decodeFunctionData({ abi: fundingReadAbi, data: combined.data }).args![0], factory);
  assert.equal(nextFundingCall(terms, child, false, 5_000_000n, 5_000_000n).kind, "deposit");
  assert.equal(nextFundingCall(terms, child, false, 1n, 5_000_000n).kind, "reset");
});
