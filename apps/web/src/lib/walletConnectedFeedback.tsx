import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { shortAddr } from "./api";
import { useLiveNotifications } from "./liveNotifications";

/** Plays bell + in-app notice when the user connects or switches EVM wallet. */
export function WalletConnectedFeedback() {
  const { address, isConnected } = useAccount();
  const { pushNotification } = useLiveNotifications();
  const lastNotified = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      lastNotified.current = null;
      return;
    }
    const key = address.toLowerCase();
    if (lastNotified.current === key) return;
    const firstForSession = lastNotified.current === null;
    lastNotified.current = key;
    pushNotification({
      event: "wallet:connected",
      message: firstForSession
        ? `Wallet connected (${shortAddr(address)}).`
        : `Wallet switched to ${shortAddr(address)}.`,
    });
  }, [isConnected, address, pushNotification]);

  return null;
}
