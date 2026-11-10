import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccount, useAppKit } from "@reown/appkit-react-native";
import { walletConnectReady } from "./appkit";
import { shortAddr } from "./format";

const logo = require("../assets/logo.png");

export function AppTopBar() {
  return (
    <SafeAreaView edges={["top"]} style={styles.topbar}>
      <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="2Pescrow" />
      <HeaderWallet />
    </SafeAreaView>
  );
}

function HeaderWallet() {
  if (!walletConnectReady) return null;
  return <WalletPill />;
}

function WalletPill() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const connected = Boolean(isConnected && address);
  const label = connected ? `ETH ${shortAddr(address)}` : "Connect wallet";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => open({ view: "Connect" })}
      style={styles.walletPill}
    >
      {connected ? <View style={styles.walletDot} /> : null}
      <Text style={styles.walletLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.walletChevron}>⌄</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: {
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "#1f3440",
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  logo: { height: 32, width: 148 },
  walletPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    maxWidth: 168,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1b24",
  },
  walletDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3ecf8e" },
  walletLabel: { color: "#e8f4f2", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  walletChevron: { color: "#8aa3ad", fontSize: 16, marginTop: -2 },
});
