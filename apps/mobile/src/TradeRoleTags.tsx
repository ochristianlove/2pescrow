import { Text } from "./language";
import { StyleSheet, View } from "react-native";
import { colors } from "./theme";

export function TradeRoleTags({ buyer, seller }: { buyer?: string | null; seller?: string | null }) {
  return (
    <View style={styles.row}>
      <View style={styles.tag}>
        <Text style={styles.label}>trade</Text>
      </View>
      <View style={[styles.tag, styles.buyer]}>
        <Text style={[styles.label, styles.buyerLabel]} numberOfLines={1}>buyer</Text>
        {buyer ? <Text translate={false} style={[styles.label, styles.buyerLabel]} numberOfLines={1}>{`· ${buyer}`}</Text> : null}
      </View>
      <View style={[styles.tag, styles.seller]}>
        <Text style={[styles.label, styles.sellerLabel]} numberOfLines={1}>seller</Text>
        {seller ? <Text translate={false} style={[styles.label, styles.sellerLabel]} numberOfLines={1}>{`· ${seller}`}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, maxWidth: "100%", minWidth: 0 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  buyer: { borderColor: "rgba(62, 207, 142, 0.4)" },
  seller: { borderColor: "rgba(232, 184, 74, 0.45)" },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", flexShrink: 1, minWidth: 0 },
  buyerLabel: { color: colors.accent },
  sellerLabel: { color: colors.gold },
});
