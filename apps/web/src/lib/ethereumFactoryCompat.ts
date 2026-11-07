import type { Address, PublicClient } from "viem";
import { escrowFactoryAbi } from "@2pescrow/shared";

/** EscrowDeal V2 exposes markFunded; the live mainnet impl at deploy time is V1 (fund-only). */
const MARK_FUNDED_SELECTOR = "c5666eb2";

export async function factorySupportsCreateAndFund(
  publicClient: PublicClient,
  factoryAddress: Address,
): Promise<boolean> {
  const implementation = await publicClient.readContract({
    address: factoryAddress,
    abi: escrowFactoryAbi,
    functionName: "implementation",
  });
  const bytecode = await publicClient.getBytecode({ address: implementation });
  if (!bytecode) return false;
  return bytecode.toLowerCase().includes(MARK_FUNDED_SELECTOR);
}
