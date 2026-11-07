import type { Escrow } from "../lib/types";
import { useLanguage } from "../lib/language";

type TradePartyBadgeProps = {
  escrow: Escrow;
  userId?: string;
  walletAddresses?: string[];
};

function viewerRole(escrow: Escrow, userId?: string, walletAddresses: string[] = []) {
  if (escrow.partyRole === "buyer" || escrow.partyRole === "seller") return escrow.partyRole;
  if (userId && escrow.buyerUserId === userId) return "buyer";
  if (userId && escrow.sellerUserId === userId) return "seller";

  const normalize = (value: string) => escrow.chain === "tron" ? value.trim() : value.trim().toLowerCase();
  const connectedWallets = new Set(walletAddresses.map(normalize));
  const isBuyer = Boolean(escrow.buyerAddress && connectedWallets.has(normalize(escrow.buyerAddress)));
  const isSeller = Boolean(escrow.sellerAddress && connectedWallets.has(normalize(escrow.sellerAddress)));
  if (isBuyer === isSeller) return null;
  return isBuyer ? "buyer" : "seller";
}

export function TradePartyBadge({ escrow, userId, walletAddresses }: TradePartyBadgeProps) {
  const { t } = useLanguage();
  const role = viewerRole(escrow, userId, walletAddresses);
  if (!role) return null;
  return (
    <span className={`trade-party-badge trade-party-badge-${role}`}>
      {t(role === "buyer" ? "You are the buyer" : "You are the seller")}
    </span>
  );
}
