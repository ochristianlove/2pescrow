import type { Abi, Address, PublicClient } from "viem";
import { escrowFactoryAbi } from "@2pescrow/shared";
import { formatEthWei } from "./evmWalletErrors";

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

/** 35% headroom for fee spikes between the two signatures. */
const GAS_BUFFER_NUM = 135n;
const GAS_BUFFER_DEN = 100n;

/** Fallback when RPC estimate fails (approve + heavy createAndFund clone). */
const FALLBACK_APPROVE_GAS = 80_000n;
const FALLBACK_CREATE_AND_FUND_GAS = 650_000n;

export type DeployFundingGasPlan = {
  approveGas: bigint;
  createAndFundGas: bigint;
  gasPrice: bigint;
  totalGasUnits: bigint;
  totalEthWei: bigint;
  bufferedEthWei: bigint;
  needsApprove: boolean;
};

async function estimateGasUnits(
  publicClient: PublicClient,
  params: {
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    account: Address;
  },
  fallback: bigint,
): Promise<bigint> {
  try {
    return await publicClient.estimateContractGas({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      account: params.account,
    });
  } catch {
    return fallback;
  }
}

export async function planDeployFundingGas(
  publicClient: PublicClient,
  params: {
    owner: Address;
    factory: Address;
    token: Address;
    seller: Address;
    amountAtomic: bigint;
    optionalAgent: Address;
    approveSpender: Address;
    requiredAllowance: bigint;
    currentAllowance: bigint;
  },
): Promise<DeployFundingGasPlan> {
  const needsApprove = params.currentAllowance < params.requiredAllowance;
  let approveGas = 0n;
  if (needsApprove) {
    approveGas = await estimateGasUnits(
      publicClient,
      {
        address: params.token,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [params.approveSpender, params.requiredAllowance],
        account: params.owner,
      },
      FALLBACK_APPROVE_GAS,
    );
  }

  const createAndFundGas = await estimateGasUnits(
    publicClient,
    {
      address: params.factory,
      abi: escrowFactoryAbi,
      functionName: "createAndFund",
      args: [params.seller, params.token, params.amountAtomic, params.optionalAgent],
      account: params.owner,
    },
    FALLBACK_CREATE_AND_FUND_GAS,
  );

  const gasPrice = await publicClient.getGasPrice();
  const totalGasUnits = approveGas + createAndFundGas;
  const totalEthWei = totalGasUnits * gasPrice;
  const bufferedEthWei = (totalEthWei * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;

  return {
    approveGas,
    createAndFundGas,
    gasPrice,
    totalGasUnits,
    totalEthWei,
    bufferedEthWei,
    needsApprove,
  };
}

/** Gas for legacy factory: createEscrow → approve(escrow) → fund(). */
export async function planLegacyDeployFundingGas(
  publicClient: PublicClient,
  params: {
    owner: Address;
    factory: Address;
    token: Address;
    seller: Address;
    amountAtomic: bigint;
    optionalAgent: Address;
    requiredAllowance: bigint;
  },
): Promise<DeployFundingGasPlan & { fundGas: bigint }> {
  const createEscrowGas = await estimateGasUnits(
    publicClient,
    {
      address: params.factory,
      abi: escrowFactoryAbi,
      functionName: "createEscrow",
      args: [params.owner, params.seller, params.token, params.amountAtomic, params.optionalAgent],
      account: params.owner,
    },
    250_000n,
  );
  const approveGas = await estimateGasUnits(
    publicClient,
    {
      address: params.token,
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [params.factory, params.requiredAllowance],
      account: params.owner,
    },
    FALLBACK_APPROVE_GAS,
  );
  const fundGas = 200_000n;
  const gasPrice = await publicClient.getGasPrice();
  const totalGasUnits = createEscrowGas + approveGas + fundGas;
  const totalEthWei = totalGasUnits * gasPrice;
  const bufferedEthWei = (totalEthWei * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
  return {
    approveGas,
    createAndFundGas: createEscrowGas + fundGas,
    fundGas,
    gasPrice,
    totalGasUnits,
    totalEthWei,
    bufferedEthWei,
    needsApprove: true,
  };
}

export async function planEscrowFundGas(
  publicClient: PublicClient,
  params: {
    owner: Address;
    escrow: Address;
    token: Address;
    requiredAllowance: bigint;
    currentAllowance: bigint;
    fundAbi: Abi;
  },
): Promise<{ totalEthWei: bigint; bufferedEthWei: bigint; needsApprove: boolean; approveGas: bigint; fundGas: bigint }> {
  const needsApprove = params.currentAllowance < params.requiredAllowance;
  let approveGas = 0n;
  if (needsApprove) {
    approveGas = await estimateGasUnits(
      publicClient,
      {
        address: params.token,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [params.escrow, params.requiredAllowance],
        account: params.owner,
      },
      FALLBACK_APPROVE_GAS,
    );
  }
  const fundGas = await estimateGasUnits(
    publicClient,
    {
      address: params.escrow,
      abi: params.fundAbi,
      functionName: "fund",
      args: [],
      account: params.owner,
    },
    200_000n,
  );
  const gasPrice = await publicClient.getGasPrice();
  const totalEthWei = (approveGas + fundGas) * gasPrice;
  const bufferedEthWei = (totalEthWei * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
  return { totalEthWei, bufferedEthWei, needsApprove, approveGas, fundGas };
}

export function insufficientMainnetEthMessage(requiredWei: bigint): string {
  return `Not enough ETH on Ethereum mainnet for network fees. You need about ${formatEthWei(requiredWei)} ETH for the two wallet steps (token approval + escrow deposit). That is separate from the USDT trade amount.`;
}

export async function ensureMainnetEthBudget(
  ethBalance: bigint,
  requiredWei: bigint,
): Promise<void> {
  if (ethBalance < requiredWei) {
    throw new Error(insufficientMainnetEthMessage(requiredWei));
  }
}

export async function ethBudgetForSecondStep(
  publicClient: PublicClient,
  createAndFundGas: bigint,
): Promise<bigint> {
  const gasPrice = await publicClient.getGasPrice();
  const wei = createAndFundGas * gasPrice;
  return (wei * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
}
