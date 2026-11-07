import dotenv from "dotenv";
import path from "path";
import { requireEnv } from "./secrets";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function loadConfig() {
  const jwtSecret = requireEnv("JWT_SECRET");
  const adminApiKey = requireEnv("ADMIN_API_KEY");
  const adminPassword = requireEnv("ADMIN_PASSWORD");
  const indexerApiKey = requireEnv("INDEXER_API_KEY");

  if (adminApiKey === indexerApiKey) {
    throw new Error("ADMIN_API_KEY and INDEXER_API_KEY must be different values");
  }

  const forbidden = new Set([
    "dev-secret",
    "dev-admin-key",
    "change-me-in-production",
    "change-me-admin-key",
    "change-me-indexer-key",
  ]);
  if (forbidden.has(jwtSecret) || forbidden.has(adminApiKey) || forbidden.has(indexerApiKey)) {
    throw new Error("JWT_SECRET, ADMIN_API_KEY, and INDEXER_API_KEY must not use placeholder values");
  }
  if (adminPassword === "@Adminpass1") {
    throw new Error("ADMIN_PASSWORD must not use the default placeholder value");
  }

  return {
    port: Number(process.env.PORT || 3000),
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    jwtSecret,
    adminApiKey,
    indexerApiKey,
    adminEmail: process.env.ADMIN_EMAIL || "ochristianlove@gmail.com",
    adminPassword,
    webOrigin: process.env.WEB_ORIGIN || "http://localhost:3003",
    uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, "../../../data/uploads"),
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
    ethereumChainId: Number(process.env.ETHEREUM_CHAIN_ID || 1),
    factoryAddress: process.env.ESCROW_FACTORY_ADDRESS as `0x${string}` | undefined,
    deployerWallet: process.env.DEPLOYER_WALLET as `0x${string}` | undefined,
    feeRecipientWallet: process.env.FEE_RECIPIENT_WALLET as `0x${string}` | undefined,
    buyerWallet: process.env.BUYER_WALLET as `0x${string}` | undefined,
    sellerWallet: process.env.SELLER_WALLET as `0x${string}` | undefined,
    agentWallet: process.env.AGENT_WALLET as `0x${string}` | undefined,
    usdcAddress: ((process.env.USDC_ADDRESS || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48").trim()) as `0x${string}`,
    usdtAddress: (process.env.USDT_ADDRESS || "0xdAC17F958D2ee523a2206206994597C13D831ec7").trim() as `0x${string}`,
    thirdStablecoinAddress: process.env.THIRD_STABLECOIN_ADDRESS as `0x${string}` | undefined,
    resolutionMode: process.env.RESOLUTION_MODE || "admin",
    tronGridUrl: process.env.TRON_GRID_URL || "https://api.trongrid.io",
    tronGridApiKey: process.env.TRONGRID_API_KEY || "",
    tronFactoryAddress: process.env.TRON_ESCROW_FACTORY_ADDRESS || "",
    tronUsdtAddress: process.env.TRON_USDT_ADDRESS || "",
    tronFeeRecipientWallet: process.env.TRON_FEE_RECIPIENT_WALLET || "",
    tronResolverWallet: process.env.TRON_RESOLVER_WALLET || "",
    tronAppChainId: Number(process.env.TRON_APP_CHAIN_ID || 728126428),
  };
}

export const config = loadConfig();
