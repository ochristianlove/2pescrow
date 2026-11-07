import { useDisconnect } from "wagmi";
import { disconnectEvmWallet } from "./evmWalletDisconnect";

/** Drop-in replacement for wagmi useDisconnect that tolerates broken connector.disconnect(). */
export function useEvmDisconnect() {
  return useDisconnect({
    mutation: {
      mutationFn: (variables) => disconnectEvmWallet(variables),
    },
  });
}
