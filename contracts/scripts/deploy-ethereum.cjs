const fs = require("fs");
const path = require("path");
const { ContractFactory, JsonRpcProvider, Wallet, ethers } = require("ethers");

const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETHEREUM_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

function loadEnv() {
  const map = {};
  const text = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) map[match[1]] = match[2].trim();
  }
  return map;
}

function realAddress(value) {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) return undefined;
  if (/^0x0+$/i.test(value) || /^0x0{39}[0-9a-fA-F]$/i.test(value)) return undefined;
  return value;
}

async function main() {
  const env = loadEnv();
  const key = env.DEPLOYER_PRIVATE_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("DEPLOYER_PRIVATE_KEY is missing or invalid");

  const feeRecipient = realAddress(env.FEE_RECIPIENT_WALLET);
  const resolver = realAddress(env.DEPLOYER_WALLET);
  const usdc = realAddress(env.USDC_ADDRESS);
  const usdt = realAddress(env.USDT_ADDRESS);
  const third = realAddress(env.THIRD_STABLECOIN_ADDRESS) || ethers.ZeroAddress;
  if (!feeRecipient || !resolver || !usdc || !usdt) throw new Error("Fee recipient, resolver, USDC, or USDT is missing");
  if (usdc.toLowerCase() !== ETHEREUM_USDC.toLowerCase() || usdt.toLowerCase() !== ETHEREUM_USDT.toLowerCase()) {
    throw new Error("USDC and USDT must be the Ethereum mainnet contracts");
  }

  const provider = new JsonRpcProvider(env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com");
  const network = await provider.getNetwork();
  if (network.chainId !== 1n) throw new Error(`Refusing to deploy on chain ${network.chainId}`);
  const wallet = new Wallet(key, provider);
  if (wallet.address.toLowerCase() !== resolver.toLowerCase()) {
    throw new Error("The deployer key does not match DEPLOYER_WALLET");
  }

  const block = await provider.getBlock("latest");
  const fee = await provider.getFeeData();
  const baseFee = block?.baseFeePerGas ?? fee.gasPrice ?? 400_000_000n;
  const maxPriorityFeePerGas = 50_000_000n; // 0.05 gwei tip for prompt inclusion
  const maxFeePerGas = (baseFee * 150n) / 100n + maxPriorityFeePerGas;
  const HARD_MAX_FEE_PER_GAS = 2_000_000_000n; // 2 gwei hard ceiling (~$8 worst-case cap)
  if (maxFeePerGas > HARD_MAX_FEE_PER_GAS) {
    throw new Error(`Refusing to deploy: gas price ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei exceeds 2 gwei safety cap`);
  }
  const overrides = { maxFeePerGas, maxPriorityFeePerGas };

  const deal = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/EscrowDeal.sol/EscrowDeal.json"), "utf8"));
  const factoryJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/EscrowFactory.sol/EscrowFactory.json"), "utf8"));

  const startBalance = await provider.getBalance(wallet.address);
  if (startBalance < 600_000_000_000_000n) {
    throw new Error(`Deployer balance is too low: ${ethers.formatEther(startBalance)} ETH`);
  }

  console.log("Deploying V2 EscrowDeal implementation at maxFee", ethers.formatUnits(maxFeePerGas, "gwei"), "gwei...");
  const implementation = await new ContractFactory(deal.abi, deal.bytecode, wallet).deploy(overrides);
  const implTx = implementation.deploymentTransaction();
  console.log("EscrowDeal tx:", implTx?.hash);
  await implementation.waitForDeployment();
  const implReceipt = await implTx.wait();
  const implementationAddress = await implementation.getAddress();

  const remaining = await provider.getBalance(wallet.address);
  if (remaining < 220_000_000_000_000n) {
    throw new Error(`Implementation deployed at ${implementationAddress}, but ${ethers.formatEther(remaining)} ETH is left, which is not enough for the factory.`);
  }

  console.log("Deploying V2 EscrowFactory...");
  const factory = await new ContractFactory(factoryJson.abi, factoryJson.bytecode, wallet).deploy(
    implementationAddress,
    feeRecipient,
    resolver,
    usdc,
    usdt,
    third,
    overrides
  );
  const factoryTx = factory.deploymentTransaction();
  console.log("EscrowFactory tx:", factoryTx?.hash);
  await factory.waitForDeployment();
  const factoryReceipt = await factoryTx.wait();
  const factoryAddress = await factory.getAddress();

  const endBalance = await provider.getBalance(wallet.address);
  console.log("EscrowDeal implementation:", implementationAddress, "gasUsed:", implReceipt.gasUsed.toString());
  console.log("EscrowFactory:", factoryAddress, "gasUsed:", factoryReceipt.gasUsed.toString());
  console.log("Total ETH spent:", ethers.formatEther(startBalance - endBalance), "Remaining ETH:", ethers.formatEther(endBalance));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
