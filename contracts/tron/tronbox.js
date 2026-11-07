/**
 * TronBox config for TRON Mainnet and public testnets.
 * Install: npm i -g tronbox
 * Compile: tronbox compile
 * Test deployment: tronbox migrate --network shasta
 * Mainnet deployment: tronbox migrate --network mainnet
 *
 * Set private key via TRON_PRIVATE_KEY env (never commit keys).
 */
module.exports = {
  networks: {
    mainnet: {
      privateKey: process.env.TRON_PRIVATE_KEY,
      userFeePercentage: 100,
      feeLimit: 1_000_000_000,
      fullHost: process.env.TRON_MAINNET_RPC_URL || "https://api.trongrid.io",
      network_id: "1",
    },
    shasta: {
      privateKey: process.env.TRON_PRIVATE_KEY,
      userFeePercentage: 100,
      feeLimit: 1_000_000_000,
      fullHost: "https://api.shasta.trongrid.io",
      network_id: "2",
    },
    nile: {
      privateKey: process.env.TRON_PRIVATE_KEY,
      userFeePercentage: 100,
      feeLimit: 1_000_000_000,
      fullHost: "https://nile.trongrid.io",
      network_id: "3",
    },
  },
  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 1,
        },
        evmVersion: "istanbul",
      },
    },
  },
};
