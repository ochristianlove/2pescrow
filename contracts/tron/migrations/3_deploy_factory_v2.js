const TronEscrowDealV2 = artifacts.require("TronEscrowDealV2");
const TronEscrowFactoryV2 = artifacts.require("TronEscrowFactoryV2");
const MAINNET_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

module.exports = async function (deployer, network, accounts) {
  if (process.env.TRON_DEPLOY_V2 !== "1") {
    throw new Error("Refusing to deploy TronEscrowFactoryV2 unless TRON_DEPLOY_V2=1 is explicitly set");
  }

  const isMainnet = network === "mainnet";
  const configuredFeeRecipient = process.env.TRON_FEE_RECIPIENT_WALLET?.trim();
  const configuredResolver = process.env.TRON_RESOLVER_WALLET?.trim();
  const feeRecipient = configuredFeeRecipient || accounts[0];
  const resolver = configuredResolver || accounts[0];
  const usdt = process.env.TRON_USDT_ADDRESS?.trim();

  if (isMainnet && (!configuredFeeRecipient || !configuredResolver)) {
    throw new Error("Mainnet V2 deployment requires TRON_FEE_RECIPIENT_WALLET and TRON_RESOLVER_WALLET");
  }
  if (isMainnet && usdt !== MAINNET_USDT) {
    throw new Error("Mainnet V2 deployment requires the official TRON Mainnet USDT contract");
  }
  if (!usdt) {
    throw new Error("Set TRON_USDT_ADDRESS to the TRC-20 USDT contract for the target network");
  }

  // The implementation is deployed once and reused by inexpensive EIP-1167 clones.
  await deployer.deploy(TronEscrowDealV2);
  const implementation = await TronEscrowDealV2.deployed();
  await deployer.deploy(TronEscrowFactoryV2, feeRecipient, resolver, usdt, implementation.address);
};
