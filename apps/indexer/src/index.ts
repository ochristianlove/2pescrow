import dotenv from "dotenv";
import path from "path";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { escrowDealAbi, escrowDealV1EventsAbi, escrowFactoryAbi } from "@2pescrow/shared";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const RPC = process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com";
const API = process.env.API_INTERNAL_URL || "http://localhost:3000";
const INDEXER_KEY = process.env.INDEXER_API_KEY ?? "";
if (!INDEXER_KEY) {
  throw new Error("INDEXER_API_KEY is required");
}
const LEGACY_FACTORIES = [
  "0x08Be929Ac784E8aEe20403c4F5bbEE2668e183c9",
  "0x65b93De2FF1be330110F9A8e0DabCc189938afBe",
];
const FACTORIES = Array.from(
  new Set(
    [process.env.ESCROW_FACTORY_ADDRESS, ...(process.env.LEGACY_ESCROW_FACTORY_ADDRESSES || "").split(","), ...LEGACY_FACTORIES]
      .map((a) => (a || "").trim())
      .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a))
      .map((a) => a.toLowerCase()),
  ),
) as `0x${string}`[];

const client = createPublicClient({
  chain: mainnet,
  transport: http(RPC),
});

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function ingest(payload: Record<string, unknown>) {
  await fetch(`${API}/v1/indexer/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-indexer-key": INDEXER_KEY,
    },
    body: jsonStringify(payload),
  });
}

const escrowWatchAbi = [...escrowDealAbi, ...escrowDealV1EventsAbi] as const;

async function watchEscrow(address: `0x${string}`) {
  const unwatch = client.watchContractEvent({
    address,
    abi: escrowWatchAbi,
    onLogs: async (logs) => {
      for (const log of logs) {
        const eventName = log.eventName || "Unknown";
        await ingest({
          contractAddress: address,
          eventName,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber?.toString(),
          payload: log.args as Record<string, unknown>,
        });
      }
    },
  });
  return unwatch;
}

async function main() {
  console.log("2Pescrow indexer starting on Ethereum", RPC);
  if (FACTORIES.length === 0) {
    console.warn("ESCROW_FACTORY_ADDRESS not set — polling disabled until factory deployed");
    setInterval(() => {}, 60_000);
    return;
  }

  for (const factory of FACTORIES) {
    console.log("Watching factory", factory);
    client.watchContractEvent({
      address: factory,
      abi: escrowFactoryAbi,
      eventName: "EscrowCreated",
      onLogs: async (logs) => {
        for (const log of logs) {
          const args = log.args as { escrow?: `0x${string}` };
          const escrow = args.escrow;
          if (escrow) {
            console.log("Watching escrow", escrow);
            await watchEscrow(escrow);
            await ingest({
              contractAddress: escrow,
              eventName: "EscrowCreated",
              txHash: log.transactionHash,
              blockNumber: log.blockNumber?.toString(),
              payload: log.args as Record<string, unknown>,
            });
          }
        }
      },
    });
  }
}

main().catch(console.error);
