import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, type Address, type Hash, type PublicClient, type Transaction, type TransactionReceipt } from "viem";
import { escrowFactoryAbi } from "@2pescrow/shared";
import { EthereumFundingService } from "../apps/api/src/ethereumFunding";
import { classifyFundingReceipt, fundingReadAbi, nextFundingCall } from "../apps/api/src/ethereumFundingChain";
import { continueFunding, sendPreparedFundingTransaction, type FundingSnapshot, type PreparedFunding, type FundingTransport } from "../packages/shared/src/funding";

// Isolated schema on the local development PostgreSQL only. Never loads .env or a production URL.
const schema = `funding_test_${randomUUID().replaceAll("-", "")}`;
const port = process.env.FUNDING_TEST_PORT || "5433";
assert.match(port, /^\d{4,5}$/);
assert(Number(port) >= 1024 && Number(port) <= 65535);
const url = `postgresql://twopescrow:twopescrow@127.0.0.1:${port}/twopescrow?schema=${schema}`;
let initialized = false;
const db = new PrismaClient({ datasources: { db: { url } } });
before(async () => {
  const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", timeout: 120_000,
  });
  assert.equal(migration.status, 0, migration.stdout + migration.stderr);
  await db.$connect();
  initialized = true;
});
after(async () => {
  assert.match(schema, /^funding_test_[a-f0-9]{32}$/);
  if (initialized) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
});
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const factory = addr(1), token = addr(2), seller = addr(3);
const zero = addr(0);

class MockChain {
  head = 100n;
  buyer = addr(10);
  child: Address | null = null;
  childState = 0;
  combined = false;
  allowance = 0n;
  balance = 20_000_000n;
  calls = 0;
  failSimulation = false;
  archive = true;
  transactions: Transaction[] = [];
  receipts = new Map<string, TransactionReceipt>();
  client = {
    getChainId: async () => 1,
    getBlockNumber: async () => this.head,
    getTransactionCount: async ({ address, blockNumber }: { address: string; blockNumber?: bigint }) => {
      if (!this.archive && blockNumber !== undefined && blockNumber !== this.head - 2n) throw new Error("archive state unavailable");
      return this.transactions.filter(t => t.from === address && t.blockNumber! <= (blockNumber ?? this.head)).length;
    },
    getTransactionReceipt: async ({ hash }: { hash: string }) => {
      const receipt = this.receipts.get(hash);
      if (!receipt) throw Object.assign(new Error("not mined"), { name: "TransactionReceiptNotFoundError" });
      return receipt;
    },
    getTransaction: async ({ hash }: { hash: string }) => this.transactions.find(t => t.hash === hash)!,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ transactions: this.transactions.filter(t => t.blockNumber === blockNumber) }),
    getBytecode: async ({ address }: { address: string }) => address === factory ? (this.combined ? "0x630b3d84fd00" : "0x639983060900") : "0x",
    readContract: async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case "creationFee": return 1_000_000n;
        case "allowance": return this.allowance;
        case "balanceOf": return this.balance;
        case "factory": return factory;
        case "buyer": return this.buyer;
        case "seller": return seller;
        case "token": return token;
        case "escrowAmount": return 4_000_000n;
        case "state": return this.childState;
        default: throw new Error(functionName);
      }
    },
    call: async () => { this.calls++; if (this.failSimulation) throw new Error("simulation reverted"); return { data: "0x" }; },
    estimateGas: async () => 150_000n,
    getBalance: async () => 10n ** 18n,
    getGasPrice: async () => 1_000_000_000n,
  } as unknown as PublicClient;

  mine(intent: NonNullable<PreparedFunding["send"]>, outcome: "success" | "reverted" | "cancelled" | "replaced" = "success") {
    const hash = `0x${(this.transactions.length + 1).toString(16).padStart(64, "0")}` as Hash;
    const blockNumber = this.head + 1n;
    const tx = { hash, from: intent.from, to: outcome === "cancelled" ? intent.from : outcome === "replaced" ? addr(99) : intent.to,
      nonce: intent.nonce, input: outcome === "cancelled" || outcome === "replaced" ? "0x" : intent.data, value: 0n, blockNumber } as Transaction;
    const logs: TransactionReceipt["logs"] = [];
    if (outcome === "success") {
      if (intent.data.startsWith("0x99830609") || intent.data.startsWith("0x0b3d84fd")) {
        this.child = addr(1000 + Number(BigInt(this.buyer)) * 100 + this.transactions.length);
        if (intent.data.startsWith("0x0b3d84fd")) this.childState = 1;
        logs.push({ address: factory,
          topics: encodeEventTopics({ abi: escrowFactoryAbi, eventName: "EscrowCreated", args: { escrow: this.child, buyer: this.buyer, seller } }),
          data: encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "address" }], [token, 4_000_000n, zero]),
        } as TransactionReceipt["logs"][number]);
      } else if (intent.data.startsWith("0x095ea7b3")) {
        const args = decodeFunctionData({ abi: fundingReadAbi, data: intent.data as `0x${string}` }).args;
        this.allowance = args![1] as bigint;
      } else if (intent.data.startsWith("0xb60d4288")) this.childState = 1;
    }
    const receipt = { transactionHash: hash, from: intent.from, to: tx.to, blockNumber, status: outcome === "reverted" ? "reverted" : "success", logs, gasUsed: 150_000n, effectiveGasPrice: 1_000_000_000n } as TransactionReceipt;
    this.transactions.push(tx); this.receipts.set(hash, receipt); this.head = blockNumber + 3n;
    return hash;
  }
}

let unique = 10;
async function setup() {
  const chain = new MockChain(); chain.buyer = addr(unique++);
  const row = await db.escrow.create({ data: { chain: "ethereum", chainId: 1, title: "Funding regression", buyerAddress: chain.buyer, sellerAddress: seller, tokenAddress: token, tokenSymbol: "USDT", amountAtomic: "4000000" } });
  const service = new EthereumFundingService(db, chain.client, async () => ({ factory, tokens: { USDT: token } }));
  return { chain, row, service };
}

test("concurrent devices reserve only one creation; lost prepare response is not sent again automatically", async () => {
  const { service, row } = await setup();
  const requestId = randomUUID();
  const results = await Promise.all([service.prepare(row.id, requestId), service.prepare(row.id, randomUUID())]);
  assert.equal(results.filter(r => r.send).length, 1);
  assert.equal(await db.ethereumFundingAttempt.count({ where: { escrowId: row.id } }), 1);
  assert.equal((await service.prepare(row.id, requestId)).send, undefined);
  const resumed = await service.prepare(row.id, randomUUID(), true);
  assert.equal(resumed.send?.nonce, results.find(r => r.send)!.send!.nonce);
  assert.equal(resumed.send?.data, results.find(r => r.send)!.send!.data);
});

test("hash lost after broadcast is recovered by nonce; new service instance sees saved child", async () => {
  const { service, row, chain } = await setup();
  const prepared = await service.prepare(row.id, randomUUID());
  chain.mine(prepared.send!); // No report call: phone disappeared immediately after submission.
  const restarted = new EthereumFundingService(db, chain.client, async () => ({ factory, tokens: { USDT: token } }));
  const state = await restarted.get(row.id);
  assert.equal(state.contractAddress, chain.child);
  assert.equal(state.active, null);
  assert.equal((await restarted.prepare(row.id, randomUUID())).send?.to, token);
  assert.equal(await db.ethereumFundingAttempt.count({ where: { escrowId: row.id, kind: "create" } }), 1);
});

test("legacy flow persists creation, approves child, then confirms deposit; approval alone is not funding", async () => {
  const { service, row, chain } = await setup();
  const create = (await service.prepare(row.id, randomUUID())).send!;
  assert(create.data.startsWith("0x99830609"));
  await service.report(row.id, create.attemptId, { hash: chain.mine(create) });
  const approval = (await service.prepare(row.id, randomUUID())).send!;
  const decoded = decodeFunctionData({ abi: fundingReadAbi, data: approval.data as `0x${string}` });
  assert.equal(decoded.functionName, "approve");
  assert.equal(String(decoded.args![0]).toLowerCase(), chain.child);
  assert.equal(decoded.args![1], 5_000_000n);
  await service.report(row.id, approval.attemptId, { hash: chain.mine(approval) });
  assert.equal((await db.escrow.findUniqueOrThrow({ where: { id: row.id } })).status, "Created");
  const deposit = (await service.prepare(row.id, randomUUID())).send!;
  assert.equal(deposit.to, chain.child); assert.equal(deposit.data, "0xb60d4288");
  const final = await service.report(row.id, deposit.attemptId, { hash: chain.mine(deposit) });
  assert.equal(final.stage, "funded"); assert.equal(final.canContinue, false);
  assert.equal((await service.prepare(row.id, randomUUID())).send, undefined);
});

test("sufficient existing approval skips another approval and insufficient nonzero allowance resets first", async () => {
  const { service, row, chain } = await setup();
  const create = (await service.prepare(row.id, randomUUID())).send!;
  await service.report(row.id, create.attemptId, { hash: chain.mine(create) });
  chain.allowance = 5_000_000n;
  assert.equal((await service.prepare(row.id, randomUUID())).send?.data, "0xb60d4288");
  const terms = { factory, buyer: chain.buyer, seller, token, amount: 4_000_000n };
  const reset = nextFundingCall(terms, chain.child, false, 1n, 5_000_000n);
  assert.equal(reset.kind, "reset");
  assert.equal(decodeFunctionData({ abi: fundingReadAbi, data: reset.data }).args![1], 0n);
});

for (const outcome of ["reverted", "cancelled", "replaced"] as const) {
  test(`${outcome} transaction consumes nonce but never marks the trade paid`, async () => {
    const { service, row, chain } = await setup();
    const prepared = (await service.prepare(row.id, randomUUID())).send!;
    const state = await service.report(row.id, prepared.attemptId, { hash: chain.mine(prepared, outcome) });
    assert.equal(state.stage, "ready"); assert.equal(state.active, null);
    assert.equal(state.attempts[0].status, outcome); assert.equal(state.contractAddress, null);
    assert.equal((await service.prepare(row.id, randomUUID())).send?.nonce, 1);
  });
}

test("rejected or uncertain wallet results retain the exact nonce and payload", async () => {
  const { service, row } = await setup();
  const original = (await service.prepare(row.id, randomUUID())).send!;
  for (const outcome of ["rejected", "uncertain"] as const) {
    await service.report(row.id, original.attemptId, { outcome });
    const next = (await service.prepare(row.id, randomUUID(), true)).send!;
    assert.equal(next.attemptId, original.attemptId); assert.equal(next.nonce, original.nonce); assert.equal(next.data, original.data);
  }
});

test("simulation failure and low balance reserve no request", async () => {
  const { service, row, chain } = await setup();
  chain.failSimulation = true;
  await assert.rejects(service.prepare(row.id, randomUUID()), /simulation reverted/);
  chain.failSimulation = false; chain.balance = 1n;
  await assert.rejects(service.prepare(row.id, randomUUID()), /token balance/);
  assert.equal(await db.ethereumFundingAttempt.count({ where: { escrowId: row.id } }), 0);
});

test("database partial index prevents another active request for the same wallet on a second trade", async () => {
  const { service, row } = await setup();
  await service.prepare(row.id, randomUUID());
  const other = await db.escrow.create({ data: { chainId: 1, title: "Other trade", buyerAddress: row.buyerAddress, sellerAddress: seller, tokenAddress: token, tokenSymbol: "USDT", amountAtomic: "4000000" } });
  await assert.rejects(service.prepare(other.id, randomUUID()), /other trade/);
  const first = await db.ethereumFundingAttempt.findFirstOrThrow({ where: { escrowId: row.id } });
  await assert.rejects(db.ethereumFundingAttempt.create({ data: { ...first, id: randomUUID(), requestId: randomUUID(), escrowId: other.id } }), /Unique constraint/);
});

test("combined factory flow is detected before signing and funds atomically", async () => {
  const { service, row, chain } = await setup(); chain.combined = true; chain.allowance = 5_000_000n;
  const request = (await service.prepare(row.id, randomUUID())).send!;
  assert(request.data.startsWith("0x0b3d84fd"));
  assert.equal((await service.report(row.id, request.attemptId, { hash: chain.mine(request) })).stage, "funded");
});

test("nonce recovery works with the bounded block-scan fallback", async () => {
  const { service, row, chain } = await setup();
  const request = (await service.prepare(row.id, randomUUID())).send!;
  chain.mine(request); chain.archive = false;
  assert.equal((await service.get(row.id)).contractAddress, chain.child);
});

test("single send verifies actual chain/account and pins nonce; wallet failure has no fallback", async () => {
  const tx = { attemptId: randomUUID(), from: addr(10), to: factory, data: "0x99830609", nonce: 9, gas: "0x493e0", chainId: 1, value: "0x0" } as const;
  let sends = 0;
  const provider = { request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_accounts") return [tx.from];
    sends++; assert.equal((params![0] as { nonce: string }).nonce, "0x9");
    throw { code: 4001, message: "rejected" };
  } };
  await assert.rejects(sendPreparedFundingTransaction(provider, tx.from, tx)); assert.equal(sends, 1);
  await assert.rejects(sendPreparedFundingTransaction(provider, seller, tx), /does not match/); assert.equal(sends, 1);
});

test("client stops after lost report, pending receipt or wallet rejection; polling cannot resend", async () => {
  const { service, row } = await setup();
  let sends = 0; let failedReport = false;
  const io: FundingTransport = {
    get: () => service.get(row.id), prepare: (id, resume) => service.prepare(row.id, id, resume),
    report: async () => { failedReport = true; throw new Error("API offline"); },
    send: async () => { sends++; return `0x${"ab".repeat(32)}`; }, remember: async () => undefined,
    progress: () => undefined, requestId: randomUUID, pause: async () => undefined,
  };
  await assert.rejects(continueFunding(io), /API offline/);
  assert.equal(sends, 1); assert.equal(failedReport, true);
  for (let i = 0; i < 3; i++) await io.get();
  assert.equal(sends, 1);
  assert.equal(await db.ethereumFundingAttempt.count({ where: { escrowId: row.id } }), 1);
});

test("fee-only replacement remains a valid confirmation; unrelated receipts cannot settle a saved nonce", () => {
  const intent = { buyerAddress: addr(10), toAddress: factory, nonce: 1, data: "0x99830609" };
  const tx = { from: addr(10), to: factory, nonce: 1, input: "0x99830609", value: 0n } as const;
  assert.equal(classifyFundingReceipt(intent, tx, { status: "success" }), "confirmed");
  assert.throws(() => classifyFundingReceipt(intent, { ...tx, nonce: 2 }, { status: "success" }), /does not match/);
});
