import fs from "fs";
import path from "path";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY || "";
const deployerAccount = deployerKey
  ? [deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 31337 },
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
      chainId: 1,
      accounts: deployerAccount,
    },
  },
};

export default config;
