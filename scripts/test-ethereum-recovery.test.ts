import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hash, type TransactionReceipt } from "viem";
import { escrowFactoryAbi } from "@2pescrow/shared";
import { escrowFromCreationReceipt, recoverEthereumEscrow, saveCreatedEscrowBeforeFunding, type ExpectedEscrow } from "../apps/web/src/lib/ethereumEscrowRecovery";

const addr = (digit: string) => `0x${digit.repeat(40)}` as Address;
const hash = `0x${"ab".repeat(32)}` as Hash;
const expected: ExpectedEscrow = { factory: addr("1"), buyer: addr("2"), seller: addr("3"), token: addr("4"), amount: 4_000_000n };
const child = addr("5");
function receipt(overrides: Partial<ExpectedEscrow> = {}, emitter = expected.factory) {
  const trade = { ...expected, ...overrides };
  return {
    status: "success", from: expected.buyer, to: expected.factory, transactionHash: hash,
    logs: [{
      address: emitter,
      topics: encodeEventTopics({ abi: escrowFactoryAbi, eventName: "EscrowCreated", args: { escrow: child, buyer: trade.buyer, seller: trade.seller } }),
      data: encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "address" }], [trade.token, trade.amount, addr("0")]),
    }],
  } as TransactionReceipt;
}

test("recovers the exact child and retains the creation hash", async () => {
  const result = await recoverEthereumEscrow({ getChainId: async () => 1, getTransactionReceipt: async () => receipt() }, hash, expected);
  assert.equal(result.contractAddress.toLowerCase(), child);
  assert.equal(result.createTxHash, hash);
});

for (const field of ["buyer", "seller", "token", "amount"] as const) {
  test(`rejects a different ${field} before saving or funding`, () => {
    const mismatch = { [field]: field === "amount" ? 1n : addr("9") };
    assert.throws(() => escrowFromCreationReceipt(receipt(mismatch), expected), /matches this trade/);
  });
}

test("ignores a matching-looking event emitted by another contract", () => {
  assert.throws(() => escrowFromCreationReceipt(receipt({}, addr("9")), expected), /matches this trade/);
});

test("rejects failed, approval-only, ambiguous and wrong-origin receipts", () => {
  assert.throws(() => escrowFromCreationReceipt({ ...receipt(), status: "reverted" }, expected), /reverted/);
  assert.throws(() => escrowFromCreationReceipt({ ...receipt(), logs: [] }, expected), /creation transaction hash/);
  assert.throws(() => escrowFromCreationReceipt({ ...receipt(), logs: [...receipt().logs, ...receipt().logs] }, expected), /unique escrow/);
  assert.throws(() => escrowFromCreationReceipt({ ...receipt(), from: addr("9") }, expected), /not from/);
  assert.throws(() => escrowFromCreationReceipt({ ...receipt(), to: addr("9") }, expected), /not from/);
});

test("rejects wrong chain and malformed hash without fetching a receipt", async () => {
  let reads = 0;
  const client = { getChainId: async () => 89, getTransactionReceipt: async () => { reads++; return receipt(); } };
  await assert.rejects(recoverEthereumEscrow(client, hash, expected), /mainnet/);
  await assert.rejects(recoverEthereumEscrow(client, child, expected), /full Ethereum/);
  assert.equal(reads, 0);
});

test("API save must finish before the caller can approve or fund", async () => {
  const actions: string[] = [];
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  const work = (async () => {
    await saveCreatedEscrowBeforeFunding(receipt(), expected, async result => {
      assert.equal(result.createTxHash, hash);
      actions.push("save started"); await waiting; actions.push("saved");
    });
    actions.push("fund");
  })();
  await Promise.resolve();
  assert.deepEqual(actions, ["save started"]);
  finish(); await work;
  assert.deepEqual(actions, ["save started", "saved", "fund"]);
});

test("failed persistence stops funding; interrupted funding leaves the creation recoverable", async () => {
  let funded = false;
  await assert.rejects((async () => {
    await saveCreatedEscrowBeforeFunding(receipt(), expected, async () => { throw new Error("API unavailable"); });
    funded = true;
  })(), /API unavailable/);
  assert.equal(funded, false);
  let saved: { contractAddress: Address; createTxHash: Hash } | undefined;
  await assert.rejects((async () => {
    await saveCreatedEscrowBeforeFunding(receipt(), expected, async result => { saved = result; });
    throw new Error("Wallet rejected funding");
  })(), /rejected funding/);
  assert.equal(saved?.contractAddress.toLowerCase(), child);
  assert.equal(saved?.createTxHash, hash);
});
