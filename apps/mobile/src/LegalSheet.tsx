import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "./language";
import { privacyBlocks, termsBlocks, type LegalBlock } from "./legalCopy";

export type LegalDoc = "terms" | "privacy";

export function WalletAgreement({ onOpen }: { onOpen: (doc: LegalDoc) => void }) {
  return (
    <Text style={styles.agreement}>
      By connecting your wallet, you agree to the <Text style={styles.agreementLink} onPress={() => onOpen("terms")}>Terms</Text>
      {" and "}
      <Text style={styles.agreementLink} onPress={() => onOpen("privacy")}>Privacy Policy</Text>.
    </Text>
  );
}

export function LegalSheet({ doc, onClose, embedded = false }: { doc: LegalDoc; onClose: () => void; embedded?: boolean }) {
  const [active, setActive] = useState<LegalDoc>(doc);
  const blocks = active === "terms" ? termsBlocks : privacyBlocks;
  const title = active === "terms" ? "Terms of Service" : "Privacy Policy";
  const sheet = (
      <SafeAreaView style={[styles.screen, embedded && styles.embedded]} edges={["top", "bottom"]}>
        <View style={styles.bar}>
          <Text style={styles.eyebrow}>Legal</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.updated}>
          Last updated
          {": 3 November 2026"}
        </Text>
        <View style={styles.tabs}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: active === "terms" }} onPress={() => setActive("terms")} style={[styles.tab, active === "terms" && styles.tabOn]}>
            <Text style={[styles.tabLabel, active === "terms" && styles.tabLabelOn]}>Terms</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: active === "privacy" }} onPress={() => setActive("privacy")} style={[styles.tab, active === "privacy" && styles.tabOn]}>
            <Text style={[styles.tabLabel, active === "privacy" && styles.tabLabelOn]}>Privacy Policy</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {blocks.map((block, index) => (
            <LegalLine key={`${active}-${index}`} block={block} />
          ))}
        </ScrollView>
      </SafeAreaView>
  );
  if (embedded) return sheet;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {sheet}
    </Modal>
  );
}

function LegalLine({ block }: { block: LegalBlock }) {
  if (block.kind === "h2") return <Text style={styles.h2}>{block.text}</Text>;
  if ("lead" in block) {
    return (
      <Text style={styles.li}>
        <Text style={styles.lead}>{block.lead}</Text> {block.text}
      </Text>
    );
  }
  if (block.kind === "li") return <Text style={styles.li}>{block.text}</Text>;
  return <Text style={styles.p}>{block.text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#071018" },
  embedded: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  agreement: { color: "#8aa3ad", fontSize: 13, lineHeight: 20, textAlign: "center" },
  agreementLink: { color: "#2bb8c8", fontWeight: "700" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
  eyebrow: { color: "#e8b84a", fontSize: 12, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  closeLabel: { color: "#2bb8c8", fontWeight: "700", fontSize: 16 },
  title: { color: "#e8f4f2", fontSize: 28, fontWeight: "800", letterSpacing: -0.6, paddingHorizontal: 16, marginTop: 8 },
  updated: { color: "#8aa3ad", fontSize: 13, paddingHorizontal: 16, marginTop: 6, marginBottom: 12 },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: { minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: "#1f3440", paddingHorizontal: 14, justifyContent: "center" },
  tabOn: { backgroundColor: "rgba(62, 207, 142, 0.16)", borderColor: "rgba(62, 207, 142, 0.5)" },
  tabLabel: { color: "#8aa3ad", fontWeight: "700", fontSize: 14 },
  tabLabelOn: { color: "#e8f4f2" },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  h2: { color: "#e8f4f2", fontSize: 18, fontWeight: "800", marginTop: 18, marginBottom: 8 },
  p: { color: "rgba(232, 244, 242, 0.86)", fontSize: 15, lineHeight: 23, marginBottom: 10 },
  li: { color: "rgba(232, 244, 242, 0.86)", fontSize: 15, lineHeight: 23, marginBottom: 8, paddingLeft: 8 },
  lead: { color: "#e8f4f2", fontWeight: "700" },
});
