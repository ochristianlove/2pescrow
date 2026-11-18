import { decodeEventLog, type Address, type Hash, type PublicClient, type TransactionReceipt } from "viem";
import { escrowFactoryAbi } from "@2pescrow/shared";

export type ExpectedEscrow = { factory: Address; buyer: Address; seller: Address; token: Address; amount: bigint };
const sameAddress = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();

/** Only accept a successful factory event matching this trade, never an approval or a fund receipt. */
export function escrowFromCreationReceipt(receipt: TransactionReceipt, expected: ExpectedEscrow): Address {
  if (receipt.status !== "success") throw new Error("This creation transaction reverted. It did not create an escrow.");
  if (!sameAddress(receipt.to, expected.factory) || !sameAddress(receipt.from, expected.buyer)) {
    throw new Error("This transaction is not from this trade's buyer to the configured factory.");
  }
  const matches: Address[] = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, expected.factory)) continue;
    try {
      const event = decodeEventLog({ abi: escrowFactoryAbi, data: log.data, topics: log.topics });
      if (event.eventName === "EscrowCreated"
        && sameAddress(event.args.buyer, expected.buyer)
        && sameAddress(event.args.seller, expected.seller)
        && sameAddress(event.args.token, expected.token)
        && event.args.amount === expected.amount
        && sameAddress(event.args.optionalAgent, "0x0000000000000000000000000000000000000000")) {
        matches.push(event.args.escrow);
      }
    } catch { /* Other factory events are not creation evidence. */ }
  }
  if (matches.length !== 1) throw new Error("No unique escrow in this transaction matches this trade's buyer, seller, token and amount. Use the creation transaction hash, not the approval hash.");
  return matches[0];
}

/** Read-only recovery. The caller must persist this result before offering funding. */
export async function recoverEthereumEscrow(
  client: Pick<PublicClient, "getChainId" | "getTransactionReceipt">,
  hash: string,
  expected: ExpectedEscrow,
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Paste the full Ethereum creation transaction hash (0x followed by 64 characters).");
  if (await client.getChainId() !== 1) throw new Error("Escrow recovery requires Ethereum mainnet.");
  const receipt = await client.getTransactionReceipt({ hash: hash as Hash });
  return { contractAddress: escrowFromCreationReceipt(receipt, expected), createTxHash: receipt.transactionHash };
}

/** Keep confirmed deployment evidence even when the API or the later funding step fails. */
export async function saveCreatedEscrowBeforeFunding(
  receipt: TransactionReceipt,
  expected: ExpectedEscrow,
  save: (result: { contractAddress: Address; createTxHash: Hash }) => Promise<void>,
) {
  const contractAddress = escrowFromCreationReceipt(receipt, expected);
  await save({ contractAddress, createTxHash: receipt.transactionHash });
  return contractAddress;
}
