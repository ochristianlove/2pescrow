import {
  encodeFunctionData,
  formatTransactionRequest,
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
  type WriteContractParameters,
} from "viem";
import { mainnet } from "viem/chains";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type EthereumContractWrite = Omit<
  WriteContractParameters<Abi, string, unknown[], typeof mainnet>,
  "account" | "chain"
>;

/** One wallet request only. Rejections, security blocks and uncertain submissions must never trigger another send. */
export async function sendMainnetContractTransaction(
  provider: EthereumProvider,
  account: Address,
  parameters: EthereumContractWrite,
): Promise<Hash> {
  // Check the provider that will actually sign, not just the UI's selected connector.
  const chainId = await provider.request({ method: "eth_chainId" });
  if (Number(chainId) !== mainnet.id) {
    throw new Error("The signing wallet is not on Ethereum mainnet. Switch its network before continuing.");
  }
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || !accounts.some((value) => typeof value === "string" && value.toLowerCase() === account.toLowerCase())) {
    throw new Error("The signing wallet does not have the buyer or seller account selected. Reconnect the wallet linked to this trade.");
  }
  const data = encodeFunctionData({
    abi: parameters.abi,
    functionName: parameters.functionName,
    args: parameters.args as readonly unknown[],
  });
  const request = formatTransactionRequest({
    from: account,
    to: parameters.address,
    data,
    value: parameters.value,
    gas: parameters.gas,
    ...(parameters.gasPrice !== undefined
      ? { gasPrice: parameters.gasPrice }
      : { maxFeePerGas: parameters.maxFeePerGas, maxPriorityFeePerGas: parameters.maxPriorityFeePerGas }),
    nonce: parameters.nonce,
  });
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ ...request, chainId: "0x1" }],
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error("The wallet did not return a valid transaction hash. Check its activity before trying again.");
  }
  return hash as Hash;
}

/** A mined receipt can still be reverted; never advance a trade based on mining alone. */
export async function waitForSuccessfulReceipt(
  publicClient: Pick<PublicClient, "waitForTransactionReceipt">,
  hash: Hash,
) {
  let replacementReason: string | undefined;
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    onReplaced: ({ reason }) => {
      if (reason !== "repriced") replacementReason = reason;
    },
  });
  if (replacementReason) {
    throw new Error(`Transaction ${hash} was ${replacementReason} in the wallet. The next step was stopped. Check wallet activity before trying again.`);
  }
  if (receipt.status !== "success") {
    throw new Error(`Transaction ${hash} reverted on Ethereum. The next step was stopped. Check the transaction before trying again.`);
  }
  return receipt;
}
