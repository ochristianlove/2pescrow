const fs = require("fs");
const path = require("path");
const { ContractFactory, Contract, JsonRpcProvider, Wallet, ethers } = require("ethers");

const V2_FACTORY = "0x65b93De2FF1be330110F9A8e0DabCc189938afBe";

const INITIAL_RESOLVERS = [
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

  const resolvers = INITIAL_RESOLVERS.map((a) => ethers.getAddress(a));
  if (new Set(resolvers).size !== 11) throw new Error("Expected 11 unique resolver addresses");

  const provider = new JsonRpcProvider(env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com");
  const network = await provider.getNetwork();
  if (network.chainId !== 1n) throw new Error(`Refusing to deploy on chain ${network.chainId}`);

  const wallet = new Wallet(key, provider);
  if (wallet.address.toLowerCase() !== resolvers[0].toLowerCase()) {
    throw new Error("Deployer key does not match main owner wallet");
  }

  const block = await provider.getBlock("latest");
  const fee = await provider.getFeeData();
  const baseFee = block?.baseFeePerGas ?? fee.gasPrice ?? 400_000_000n;
  const maxPriorityFeePerGas = 50_000_000n;
  const maxFeePerGas = (baseFee * 150n) / 100n + maxPriorityFeePerGas;
  if (maxFeePerGas > 2_000_000_000n) {
    throw new Error(`Gas price ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei exceeds 2 gwei safety cap`);
  }
  const overrides = { maxFeePerGas, maxPriorityFeePerGas };

  const routerJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../artifacts/contracts/ResolverRouter.sol/ResolverRouter.json"), "utf8"),
  );
  const factoryJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../artifacts/contracts/EscrowFactory.sol/EscrowFactory.json"), "utf8"),
  );

  const startBalance = await provider.getBalance(wallet.address);
  console.log("Deploying ResolverRouter (11 resolvers) at maxFee", ethers.formatUnits(maxFeePerGas, "gwei"), "gwei...");
  const router = await new ContractFactory(routerJson.abi, routerJson.bytecode, wallet).deploy(resolvers, overrides);
  const deployTx = router.deploymentTransaction();
  console.log("ResolverRouter tx:", deployTx?.hash);
  await router.waitForDeployment();
  const deployReceipt = await deployTx.wait();
  const routerAddress = await router.getAddress();

  const factory = new Contract(V2_FACTORY, factoryJson.abi, wallet);
  console.log("Linking V2 EscrowFactory.setResolver ->", routerAddress);
  const setTx = await factory.setResolver(routerAddress, overrides);
  console.log("setResolver tx:", setTx.hash);
  const setReceipt = await setTx.wait();

  const endBalance = await provider.getBalance(wallet.address);
  console.log("ResolverRouter:", routerAddress, "gasUsed:", deployReceipt.gasUsed.toString());
  console.log("V2 Factory setResolver gasUsed:", setReceipt.gasUsed.toString());
  console.log("Total ETH spent:", ethers.formatEther(startBalance - endBalance), "Remaining ETH:", ethers.formatEther(endBalance));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
