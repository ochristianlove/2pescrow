const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async () => ({
  version: "0.8.26",
  longVersion: "0.8.26+commit.local",
  compilerPath: require.resolve("solc/soljson.js"),
  isSolcJs: true,
}));

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 1 },
  },
};
