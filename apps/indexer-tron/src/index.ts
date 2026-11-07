import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const TRON_GRID = process.env.TRON_GRID_URL || "https://api.trongrid.io";
const API = process.env.API_INTERNAL_URL || "http://localhost:3000";
const INDEXER_KEY = process.env.INDEXER_API_KEY ?? "";
if (!INDEXER_KEY) {
  throw new Error("INDEXER_API_KEY is required");
}
const FACTORY = process.env.TRON_ESCROW_FACTORY_ADDRESS;

type TronGridEvent = {
  block_number?: number;
  transaction_id?: string;
  contract_address?: string;
  event_name?: string;
  result?: Record<string, string>;
};

const watchedEscrows = new Set<string>();
const lastFactoryFingerprint: { value?: string } = {};

async function tronFetch(urlPath: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.TRONGRID_API_KEY;
  if (key) headers["TRON-PRO-API-KEY"] = key;
  const res = await fetch(`${TRON_GRID}${urlPath}`, { headers });
  if (!res.ok) throw new Error(`TronGrid ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ingest(payload: Record<string, unknown>) {
  await fetch(`${API}/v1/indexer/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-indexer-key": INDEXER_KEY,
    },
    body: JSON.stringify({ chain: "tron", ...payload }),
  });
}

async function pollContractEvents(contractAddress: string) {
  const data = (await tronFetch(
    `/v1/contracts/${contractAddress}/events?limit=50&order_by=block_timestamp,desc`
  )) as { data?: TronGridEvent[] };
  for (const ev of data.data || []) {
    const eventName = ev.event_name || "Unknown";
    await ingest({
      contractAddress,
      eventName,
      txHash: ev.transaction_id,
      blockNumber: ev.block_number?.toString(),
      payload: ev.result,
    });
  }
}

async function pollFactory() {
  if (!FACTORY) return;
  const data = (await tronFetch(
    `/v1/contracts/${FACTORY}/events?event_name=EscrowCreated&limit=50&order_by=block_timestamp,desc`
  )) as { data?: TronGridEvent[]; meta?: { fingerprint?: string } };

  const fp = data.meta?.fingerprint;
  if (fp && fp === lastFactoryFingerprint.value) return;
  lastFactoryFingerprint.value = fp;

  for (const ev of data.data || []) {
    const escrow = ev.result?.escrow || ev.result?.["0"];
    if (!escrow || watchedEscrows.has(escrow)) continue;
    watchedEscrows.add(escrow);
    console.log("Tron escrow created", escrow);
    await ingest({
      contractAddress: escrow,
      eventName: "EscrowCreated",
      txHash: ev.transaction_id,
      blockNumber: ev.block_number?.toString(),
      payload: ev.result,
    });
  }
}

async function pollAllEscrows() {
  for (const addr of watchedEscrows) {
    try {
      await pollContractEvents(addr);
    } catch (e) {
      console.warn("poll escrow failed", addr, e);
    }
  }
}

async function main() {
  console.log("2Pescrow Tron indexer · TronGrid", TRON_GRID);
  if (!FACTORY) {
    console.warn("TRON_ESCROW_FACTORY_ADDRESS not set — idle until configured");
  } else {
    await pollFactory();
  }
  setInterval(async () => {
    try {
      await pollFactory();
      await pollAllEscrows();
    } catch (e) {
      console.error(e);
    }
  }, 15_000);
}

main().catch(console.error);
