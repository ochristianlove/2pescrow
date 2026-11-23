const fs = require("fs");
const path = require("path");
const { ContractFactory, Contract, JsonRpcProvider, Wallet, ethers } = require("ethers");

const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETHEREUM_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

const PLATFORM_RESOLVERS = [
  "0x5ADE0bD2Ef7f5168f9f303f7595e7Cd83252EA40",
  "0xB93C00A1383de2F4114E2e023a9D39210c582F43",
  "0x44243DD2F03eBD5b2C6085A1b2c74e575cccD4Aa",
  "0x4C5F6099E24b91DFd8f360e371c861F367342607",
  "0x3b67c4ddA0A1069d1D758E0bD9218F28Befea513",
  "0x9FDdb4CD6891d19266683A17DAc5844431BFB375",
  "0xDCF1a2B1F514Db641dC5Ab850886540e03dD8c98",
  "0x5653b2F75aeC770a7941DC1f1CB783EEa722A461",
  "0x12b4E8711339a92e81b1B0e648783af65A1a5Bf9",
  "0x0b3441EB7FCb9e39c98DB972201d8c201Bd7A6A7",
  "0x519B6aAd6919265839377234d4eC643B239f3441",
];

function loadEnv() {
  const map = {};
  const text = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) map[match[1]] = match[2].trim();
  }
  return map;
}

async function main() {
  const env = loadEnv();
  const key = env.DEPLOYER_PRIVATE_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("DEPLOYER_PRIVATE_KEY is missing or invalid");

  const feeRecipient = ethers.getAddress(env.FEE_RECIPIENT_WALLET);
  const resolvers = PLATFORM_RESOLVERS.map((a) => ethers.getAddress(a));
  if (new Set(resolvers).size !== 11) throw new Error("Expected 11 unique platform resolver wallets");

  const provider = new JsonRpcProvider(env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com");
  const network = await provider.getNetwork();
  if (network.chainId !== 1n) throw new Error(`Refusing to deploy on chain ${network.chainId}`);

  const wallet = new Wallet(key, provider);
  if (wallet.address.toLowerCase() !== resolvers[0].toLowerCase()) {
    throw new Error("Deployer key does not match DEPLOYER_WALLET");
  }

  const block = await provider.getBlock("latest");
  const fee = await provider.getFeeData();
  const baseFee = block?.baseFeePerGas ?? fee.gasPrice ?? 400_000_000n;
  const maxPriorityFeePerGas = 50_000_000n;
  const maxFeePerGas = (baseFee * 150n) / 100n + maxPriorityFeePerGas;
  if (maxFeePerGas > 2_000_000_000n) {
    throw new Error(`Refusing to deploy: maxFee ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei exceeds 2 gwei cap`);
  }
  const overrides = { maxFeePerGas, maxPriorityFeePerGas };

  const dealJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/EscrowDeal.sol/EscrowDeal.json"), "utf8"));
  const routerJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/ResolverRouter.sol/ResolverRouter.json"), "utf8"));
  const factoryJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/EscrowFactory.sol/EscrowFactory.json"), "utf8"));

  const startBalance = await provider.getBalance(wallet.address);
  if (startBalance < 1_000_000_000_000_000n) {
    throw new Error(`Deployer balance too low: ${ethers.formatEther(startBalance)} ETH`);
  }

  console.log("Deploying final Path-A V2 stack at maxFee", ethers.formatUnits(maxFeePerGas, "gwei"), "gwei...");

  // 1. Deploy V2 EscrowDeal (with 50/50 optionalAgent fee split)
  const impl = await new ContractFactory(dealJson.abi, dealJson.bytecode, wallet).deploy(overrides);
  const implTx = impl.deploymentTransaction();
  console.log("EscrowDeal tx:", implTx?.hash);
  await impl.waitForDeployment();
  const implReceipt = await implTx.wait();
  const implAddr = await impl.getAddress();

  // 2. Deploy two-tier ResolverRouter (preloaded with 11 platform resolvers)
  const router = await new ContractFactory(routerJson.abi, routerJson.bytecode, wallet).deploy(resolvers, overrides);
  const routerTx = router.deploymentTransaction();
  console.log("ResolverRouter tx:", routerTx?.hash);
  await router.waitForDeployment();
  const routerReceipt = await routerTx.wait();
  const routerAddr = await router.getAddress();

  // 3. Deploy V2 EscrowFactory pointing directly to implAddr + routerAddr as resolver
  const factory = await new ContractFactory(factoryJson.abi, factoryJson.bytecode, wallet).deploy(
    implAddr,
    feeRecipient,
    routerAddr,
    ETHEREUM_USDC,
    ETHEREUM_USDT,
    ethers.ZeroAddress,
    overrides
  );
  const factoryTx = factory.deploymentTransaction();
  console.log("EscrowFactory tx:", factoryTx?.hash);
  await factory.waitForDeployment();
  const factoryReceipt = await factoryTx.wait();
  const factoryAddr = await factory.getAddress();

  const endBalance = await provider.getBalance(wallet.address);
  console.log("DEPLOYED_IMPL:", implAddr, "gas:", implReceipt.gasUsed.toString());
  console.log("DEPLOYED_ROUTER:", routerAddr, "gas:", routerReceipt.gasUsed.toString());
  console.log("DEPLOYED_FACTORY:", factoryAddr, "gas:", factoryReceipt.gasUsed.toString());
  console.log("TOTAL_ETH_SPENT:", ethers.formatEther(startBalance - endBalance), "REMAINING_ETH:", ethers.formatEther(endBalance));

  // Immediate live on-chain verification
  const f = new Contract(factoryAddr, factoryJson.abi, provider);
  const r = new Contract(routerAddr, routerJson.abi, provider);
  const [liveImpl, liveRes, liveFeeRec, liveUsdt, liveUsdc, liveResolvers] = await Promise.all([
    f.implementation(),
    f.resolver(),
    f.feeRecipient(),
    f.whitelistedTokens(ETHEREUM_USDT),
    f.whitelistedTokens(ETHEREUM_USDC),
    r.getResolvers(),
  ]);
  console.log("VERIFIED_LIVE:", {
    liveImpl,
    liveRes,
    liveFeeRec,
    liveUsdt,
    liveUsdc,
    platformResolverCount: liveResolvers.length,
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
