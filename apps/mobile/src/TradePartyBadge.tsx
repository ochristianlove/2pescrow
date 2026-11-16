import { Text } from "./language";
import { StyleSheet, View } from "react-native";
import { colors } from "./theme";
import type { TradeRow } from "./types";

export function viewerRole(trade: Pick<TradeRow, "partyRole" | "buyerUserId" | "sellerUserId" | "buyerAddress" | "sellerAddress" | "chain">, userId?: string, walletAddresses: string[] = []) {
  if (trade.partyRole === "buyer" || trade.partyRole === "seller") return trade.partyRole;
  if (userId && trade.buyerUserId === userId) return "buyer";
  if (userId && trade.sellerUserId === userId) return "seller";
  const normalize = (value: string) => trade.chain === "tron" ? value.trim() : value.trim().toLowerCase();
  const wallets = new Set(walletAddresses.map(normalize));
  const buyer = Boolean(trade.buyerAddress && wallets.has(normalize(trade.buyerAddress)));
  const seller = Boolean(trade.sellerAddress && wallets.has(normalize(trade.sellerAddress)));
  if (buyer === seller) return null;
  return buyer ? "buyer" : "seller";
}

export function TradePartyBadge({ trade, userId, walletAddresses }: { trade: Pick<TradeRow, "partyRole" | "buyerUserId" | "sellerUserId" | "buyerAddress" | "sellerAddress" | "chain">; userId?: string; walletAddresses?: string[] }) {
  const role = viewerRole(trade, userId, walletAddresses);
  if (!role) return null;
  const seller = role === "seller";
  return (
    <View style={[styles.badge, seller ? styles.seller : styles.buyer]}>
      <Text style={[styles.label, seller ? styles.sellerLabel : styles.buyerLabel]}>{seller ? "You are the seller" : "You are the buyer"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  buyer: { borderColor: "rgba(62, 207, 142, 0.4)", backgroundColor: "rgba(62, 207, 142, 0.08)" },
  seller: { borderColor: "rgba(232, 184, 74, 0.45)", backgroundColor: "rgba(232, 184, 74, 0.08)" },
  label: { fontSize: 12, fontWeight: "700" },
  buyerLabel: { color: colors.accent },
  sellerLabel: { color: colors.gold },
});
