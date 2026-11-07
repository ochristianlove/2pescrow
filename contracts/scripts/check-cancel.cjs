const hre = require("hardhat");
const { ethers } = hre;

async function fundedTrade() {
  const [deployer, buyer, seller, feeRecipient] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("USDC", "USDC", 6);
  await token.mint(buyer.address, ethers.parseUnits("1000", 6));
  const EscrowDeal = await ethers.getContractFactory("EscrowDeal");
  const impl = await EscrowDeal.deploy();
  const Factory = await ethers.getContractFactory("EscrowFactory");
  const factory = await Factory.deploy(
    await impl.getAddress(),
    feeRecipient.address,
    deployer.address,
    await token.getAddress(),
    await token.getAddress(),
    ethers.ZeroAddress
  );
  const amount = ethers.parseUnits("100", 6);
  const fee = 1_000_000n;
  const tx = await factory.createEscrow(buyer.address, seller.address, await token.getAddress(), amount, ethers.ZeroAddress);
  const receipt = await tx.wait();
  const created = receipt.logs.find((log) => log.fragment && log.fragment.name === "EscrowCreated");
  const escrow = EscrowDeal.attach(created.args[0]);
  await token.connect(buyer).approve(await escrow.getAddress(), amount + fee);
  await escrow.connect(buyer).fund();
  return { token, escrow, buyer, seller, feeRecipient, deployer, amount, fee };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  const happy = await fundedTrade();
  const proofHash = ethers.keccak256(ethers.toUtf8Bytes("delivery-proof"));
  await happy.escrow.connect(happy.seller).submitProof(proofHash);
  await happy.escrow.connect(happy.buyer).approveRelease();
  assert((await happy.token.balanceOf(happy.seller.address)) === ethers.parseUnits("90", 6), "seller should receive 90");
  assert((await happy.token.balanceOf(happy.feeRecipient.address)) === ethers.parseUnits("11", 6), "protocol should keep $1 plus 10%");
  console.log("release: seller 90, protocol 11 (fee kept)");

  const sellerCancel = await fundedTrade();
  const buyerBefore = await sellerCancel.token.balanceOf(sellerCancel.buyer.address);
  const cancelTx = await sellerCancel.escrow.connect(sellerCancel.seller).requestCancel();
  const cancelReceipt = await cancelTx.wait();
  const names = cancelReceipt.logs.map((log) => log.fragment && log.fragment.name).filter(Boolean);
  assert(names.includes("CancelRequested"), "seller cancel should emit CancelRequested");
  assert(names.includes("Cancelled"), "seller cancel should emit Cancelled");
  const cancelCommission = 1_000_000n;
  assert(
    (await sellerCancel.token.balanceOf(sellerCancel.buyer.address)) === buyerBefore + sellerCancel.amount - cancelCommission,
    "buyer should get trade amount minus $1 cancel commission",
  );
  assert(
    (await sellerCancel.token.balanceOf(sellerCancel.feeRecipient.address)) === sellerCancel.fee + cancelCommission,
    "protocol keeps creation fee plus cancel commission",
  );
  assert((await sellerCancel.escrow.state()) === 4n, "trade should be cancelled");
  console.log("seller cancel: trade amount returned to buyer minus commission, creation fee kept, CancelRequested and Cancelled emitted");

  const buyerCancel = await fundedTrade();
  const buyerStill = await buyerCancel.token.balanceOf(buyerCancel.buyer.address);
  const requestTx = await buyerCancel.escrow.connect(buyerCancel.buyer).requestCancel();
  const requestReceipt = await requestTx.wait();
  const requestNames = requestReceipt.logs.map((log) => log.fragment && log.fragment.name).filter(Boolean);
  assert(requestNames.includes("CancelRequested"), "buyer cancel should emit CancelRequested");
  assert(!requestNames.includes("Cancelled"), "buyer cancel should not close the trade");
  assert((await buyerCancel.escrow.buyerCancelRequested()) === true, "buyer flag should be set");
  assert((await buyerCancel.token.balanceOf(buyerCancel.buyer.address)) === buyerStill, "buyer cancel should not move funds");
  assert((await buyerCancel.token.balanceOf(buyerCancel.feeRecipient.address)) === buyerCancel.fee, "fee stays on a buyer cancel request");
  await buyerCancel.escrow.connect(buyerCancel.seller).refuseCancel();
  assert((await buyerCancel.escrow.buyerCancelRequested()) === false, "seller refuse should clear the request");
  assert((await buyerCancel.escrow.state()) === 1n, "refused trade stays funded");
  console.log("buyer cancel: request only, seller can refuse, fee stays");

  const dispute = await fundedTrade();
  const disputeBuyerBefore = await dispute.token.balanceOf(dispute.buyer.address);
  await dispute.escrow.connect(dispute.buyer).openDispute();
  await dispute.escrow.connect(dispute.deployer).resolveDispute(true);
  assert((await dispute.token.balanceOf(dispute.buyer.address)) === disputeBuyerBefore + dispute.amount, "buyer favor returns the trade amount");
  assert((await dispute.token.balanceOf(dispute.feeRecipient.address)) === dispute.fee, "buyer favor adds no release fee");
  assert((await dispute.escrow.state()) === 6n, "dispute still resolves");
  console.log("buyer favor returns the trade amount and keeps the creation fee");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
