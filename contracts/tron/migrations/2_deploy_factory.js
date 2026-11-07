const TronEscrowFactory = artifacts.require("TronEscrowFactory");
const MAINNET_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

module.exports = async function (deployer, network, accounts) {
  const isMainnet = network === "mainnet";
  const configuredFeeRecipient = process.env.TRON_FEE_RECIPIENT_WALLET?.trim();
  const configuredResolver = process.env.TRON_RESOLVER_WALLET?.trim();
  const feeRecipient = configuredFeeRecipient || accounts[0];
  const resolver = configuredResolver || accounts[0];
  const usdt = process.env.TRON_USDT_ADDRESS?.trim();

  if (isMainnet && (!configuredFeeRecipient || !configuredResolver)) {
    throw new Error("Mainnet deployment requires TRON_FEE_RECIPIENT_WALLET and TRON_RESOLVER_WALLET");
  }
  if (isMainnet && usdt !== MAINNET_USDT) {
    throw new Error("Mainnet deployment requires TRON_USDT_ADDRESS to be the official TRON Mainnet USDT contract");
  }
  if (!usdt) {
    throw new Error("Set TRON_USDT_ADDRESS to the TRC-20 USDT contract for the target network");
  }
  await deployer.deploy(TronEscrowFactory, feeRecipient, resolver, usdt);
};
