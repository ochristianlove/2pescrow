const fs = require("fs");
const path = require("path");
const { ethers, JsonRpcProvider, ContractFactory } = require("ethers");

const FACTORY = "0x08Be929Ac784E8aEe20403c4F5bbEE2668e183c9";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const BUYER = "0x5ADE0bD2Ef7f5168f9f303f7595e7Cd83252EA40";
const SELLER = "0xed0fb3be4d800b603b3b7bf26f97c45410c96c9b";
const AMOUNT = 4_000_000n;

async function main() {
  const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com");
  const factoryJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../artifacts/contracts/EscrowFactory.sol/EscrowFactory.json"), "utf8"),
  );
  const dealJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../artifacts/contracts/EscrowDeal.sol/EscrowDeal.json"), "utf8"),
  );
  const factory = new ethers.Contract(FACTORY, factoryJson.abi, provider);

  const [impl, feeRecipient, creationFee, wl] = await Promise.all([
    factory.implementation(),
    factory.feeRecipient(),
    factory.creationFee(),
    factory.whitelistedTokens(USDT),
  ]);
  console.log({ impl, feeRecipient, creationFee: creationFee.toString(), whitelisted: wl });

  const onChainImplCode = await provider.getCode(impl);
  const localBytecode = dealJson.bytecode;
  console.log("impl code length on-chain:", (onChainImplCode.length - 2) / 2);
  console.log("local artifact bytecode length:", (localBytecode.length - 2) / 2);
  console.log("bytecode match:", onChainImplCode.toLowerCase() === localBytecode.toLowerCase());

  const erc20 = new ethers.Contract(
    USDT,
    ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"],
    provider,
  );
  const [bal, allow] = await Promise.all([erc20.balanceOf(BUYER), erc20.allowance(BUYER, FACTORY)]);
  console.log({ usdtBalance: bal.toString(), allowance: allow.toString(), need: (AMOUNT + creationFee).toString() });

  await provider.send("hardhat_reset", [{ forking: { jsonRpcUrl: process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com" } }]).catch(() => undefined);

  try {
    await factory.createAndFund.staticCall(SELLER, USDT, AMOUNT, ethers.ZeroAddress, { from: BUYER });
    console.log("staticCall: success");
  } catch (e) {
    console.log("staticCall error:", e.shortMessage || e.message);
    if (e.data) console.log("revert data:", e.data);
    if (e.reason) console.log("reason:", e.reason);
  }

  try {
    const trace = await provider.send("debug_traceCall", [
      {
        from: BUYER,
        to: FACTORY,
        data: factory.interface.encodeFunctionData("createAndFund", [SELLER, USDT, AMOUNT, ethers.ZeroAddress]),
      },
      "latest",
      { tracer: "callTracer" },
    ]);
    const failed = JSON.stringify(trace).includes('"error"');
    console.log("trace has error:", failed);
    if (failed) console.log(JSON.stringify(trace, null, 2).slice(0, 4000));
  } catch (e) {
    console.log("trace unsupported:", e.message?.slice(0, 120));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
