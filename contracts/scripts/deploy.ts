import { ethers } from "hardhat";

const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETHEREUM_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

function realAddress(value?: string) {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) return undefined;
  if (/^0x0+$/i.test(value) || /^0x0{39}[0-9a-fA-F]$/i.test(value)) return undefined;
  return value;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 1n) {
    throw new Error(`Refusing to deploy on chain ${network.chainId}. Ethereum mainnet is required.`);
  }

  const feeRecipient = realAddress(process.env.FEE_RECIPIENT_WALLET);
  const resolver = realAddress(process.env.DEPLOYER_WALLET || process.env.RESOLVER_WALLET);
  const usdc = realAddress(process.env.USDC_ADDRESS);
  const usdt = realAddress(process.env.USDT_ADDRESS);
  const third = realAddress(process.env.THIRD_STABLECOIN_ADDRESS) || ethers.ZeroAddress;

  if (!feeRecipient || !resolver || !usdc || !usdt) {
    throw new Error("Set FEE_RECIPIENT_WALLET, DEPLOYER_WALLET, USDC_ADDRESS, USDT_ADDRESS");
  }
  if (usdc.toLowerCase() !== ETHEREUM_USDC.toLowerCase() || usdt.toLowerCase() !== ETHEREUM_USDT.toLowerCase()) {
    throw new Error("USDC and USDT must be the Ethereum mainnet contracts");
  }

  const fee = await ethers.provider.getFeeData();
  const maxPriorityFeePerGas = 10_000_000n;
  const maxFeePerGas = (fee.gasPrice ?? 400_000_000n) + maxPriorityFeePerGas;
  const overrides = { maxFeePerGas, maxPriorityFeePerGas };
  const signer = await ethers.provider.getSigner();
  const balance = await ethers.provider.getBalance(await signer.getAddress());
  if (balance < 600_000_000_000_000n) {
    throw new Error(`Deployer balance is too low to deploy the factory: ${ethers.formatEther(balance)} ETH`);
  }

  const EscrowDeal = await ethers.getContractFactory("EscrowDeal");
  const impl = await EscrowDeal.deploy(overrides);
  await impl.waitForDeployment();

  const remaining = await ethers.provider.getBalance(await signer.getAddress());
  if (remaining < 250_000_000_000_000n) {
    throw new Error(`Implementation deployed at ${await impl.getAddress()}, but ${ethers.formatEther(remaining)} ETH is left, which is not enough for the factory.`);
  }

  const Factory = await ethers.getContractFactory("EscrowFactory");
  const factory = await Factory.deploy(
    await impl.getAddress(),
    feeRecipient,
    resolver,
    usdc,
    usdt,
    third,
    overrides
  );
  await factory.waitForDeployment();

  console.log("EscrowDeal V2 implementation:", await impl.getAddress());
  console.log("EscrowFactory V2 (createAndFund):", await factory.getAddress());
  console.log("Update ESCROW_FACTORY_ADDRESS in .env and Admin, then redeploy web/API/indexer.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
