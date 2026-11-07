import { expect } from "chai";
import { ethers } from "hardhat";

describe("EscrowDeal V2", function () {
  async function deployFactory() {
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
      ethers.ZeroAddress,
    );

    return { token, factory, buyer, seller, feeRecipient, deployer };
  }

  async function createFundedEscrow() {
    const ctx = await deployFactory();
    const amount = ethers.parseUnits("100", 6);
    const fee = 1_000_000n;
    await ctx.token.connect(ctx.buyer).approve(await ctx.factory.getAddress(), amount + fee);
    const tx = await ctx.factory
      .connect(ctx.buyer)
      .createAndFund(ctx.seller.address, await ctx.token.getAddress(), amount, ethers.ZeroAddress);
    const receipt = await tx.wait();
    const created = receipt?.logs.find((l: { fragment?: { name?: string } }) => l.fragment?.name === "EscrowCreated");
    const escrowAddr = (created as { args: string[] }).args[0];
    const EscrowDeal = await ethers.getContractFactory("EscrowDeal");
    const escrow = EscrowDeal.attach(escrowAddr);
    return { ...ctx, escrow, escrowAddr, amount, fee };
  }

  it("happy path: createAndFund, buyer release with attested proof hash", async function () {
    this.timeout(120_000);
    const { token, buyer, seller, feeRecipient, escrow } = await createFundedEscrow();
    expect(await escrow.state()).to.equal(1n);

    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("delivery-proof"));
    await escrow.connect(buyer).approveRelease(proofHash);

    expect(await token.balanceOf(seller.address)).to.equal(ethers.parseUnits("90", 6));
    expect(await token.balanceOf(feeRecipient.address)).to.equal(ethers.parseUnits("11", 6));
  });

  it("optional seller submitProof before buyer release", async function () {
    this.timeout(120_000);
    const { token, buyer, seller, feeRecipient, escrow } = await createFundedEscrow();
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("delivery-proof"));
    await escrow.connect(seller).submitProof(proofHash);
    await escrow.connect(buyer).approveRelease(proofHash);
    expect(await token.balanceOf(seller.address)).to.equal(ethers.parseUnits("90", 6));
    expect(await token.balanceOf(feeRecipient.address)).to.equal(ethers.parseUnits("11", 6));
  });

  it("seller cancel refunds buyer minus $1 cancel commission and keeps the creation fee", async function () {
    this.timeout(120_000);
    const { token, escrow, buyer, seller, feeRecipient, amount, fee } = await createFundedEscrow();
    const cancelCommission = 1_000_000n;
    const buyerBefore = await token.balanceOf(buyer.address);
    await escrow.connect(seller).requestCancel();
    expect(await token.balanceOf(buyer.address)).to.equal(buyerBefore + amount - cancelCommission);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(fee + cancelCommission);
    expect(await escrow.state()).to.equal(4n);
  });

  it("buyer cancel is a request and does not move funds", async function () {
    this.timeout(120_000);
    const { token, escrow, buyer, seller, fee } = await createFundedEscrow();
    const buyerBefore = await token.balanceOf(buyer.address);
    await expect(escrow.connect(buyer).requestCancel()).to.emit(escrow, "CancelRequested");
    expect(await escrow.buyerCancelRequested()).to.equal(true);
    expect(await token.balanceOf(buyer.address)).to.equal(buyerBefore);
    expect(await escrow.state()).to.equal(1n);
    await escrow.connect(seller).refuseCancel();
    expect(await escrow.buyerCancelRequested()).to.equal(false);
  });

  it("dispute resolution still keeps the creation fee with the protocol", async function () {
    this.timeout(120_000);
    const { token, escrow, buyer, feeRecipient, deployer, amount, fee } = await createFundedEscrow();
    const buyerBefore = await token.balanceOf(buyer.address);
    await escrow.connect(buyer).openDispute();
    await escrow.connect(deployer).resolveDispute(true);
    expect(await token.balanceOf(buyer.address)).to.equal(buyerBefore + amount);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(fee);
    expect(await escrow.state()).to.equal(6n);
  });
});
