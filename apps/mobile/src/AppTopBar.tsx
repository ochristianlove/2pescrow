import { Text } from "./language";
import { useEffect, useRef, useState } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAccount, useAppKit } from "@reown/appkit-react-native";
import { useRouter } from "expo-router";
import { disconnectWallet, walletConnectReady } from "./appkit";
import { LegalSheet, WalletAgreement, type LegalDoc } from "./LegalSheet";
import { shortAddr } from "./format";
import { useLiveNotifications } from "./liveNotifications";
import { Button } from "./ui";
import { useLanguage, languageOptions } from "./language";

const logo = require("../assets/logo.png");

export function AppTopBar() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.topbar, { paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right }]}
    >
      <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="2Pescrow" />
      <View style={styles.tools}>
        <LanguagePicker />
        <NotificationBell />
        <View style={styles.walletSlot}>
          <HeaderWallet />
        </View>
      </View>
    </SafeAreaView>
  );
}

function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t("Language")} onPress={() => setOpen(true)} style={styles.languageButton}>
      <Text style={{ color: "#e8f4f2", fontWeight: "700" }}>{language === "pt-BR" ? "PT" : language.toUpperCase()}</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 24 }}>
        <View accessibilityViewIsModal style={{ backgroundColor: "#0e1b24", borderRadius: 16, padding: 20, maxHeight: "85%" }}>
          <Text style={{ color: "#e8f4f2", fontSize: 22, fontWeight: "700", marginBottom: 12 }}>Language</Text>
          <ScrollView>{languageOptions.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: language === option.id }} onPress={() => { setLanguage(option.id); setOpen(false); }} style={{ minHeight: 48, justifyContent: "center", borderBottomWidth: 1, borderColor: "#1f3440" }}>
            <Text translate={false} style={{ color: language === option.id ? "#3ecf8e" : "#e8f4f2", fontSize: 16 }}>{option.label}</Text>
          </Pressable>)}</ScrollView>
          <View style={{ marginTop: 16 }}><Button label="Close" tone="ghost" onPress={() => setOpen(false)} /></View>
        </View>
      </View>
    </Modal>
  </>;
}

function NotificationBell() {
  const { language, t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications, unreadCount, markAllRead, clearAll, soundEnabled, setSoundEnabled } = useLiveNotifications();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Notifications")}
        onPress={() => {
          setOpen((value) => !value);
          if (!open) markAllRead();
        }}
        style={styles.bell}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.73 21a2 2 0 0 1-3.46 0"
            fill="none"
            stroke="#e8f4f2"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.bellPanel, { marginTop: insets.top + 52 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.bellHead}>
              <Text style={styles.bellTitle}>Live updates</Text>
              <View style={styles.soundRow}>
                <Text style={styles.soundLabel}>Bell sound</Text>
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  trackColor={{ false: "#1f3440", true: "#1f6b4a" }}
                  thumbColor={soundEnabled ? "#3ecf8e" : "#8aa3ad"}
                />
              </View>
            </View>
            {notifications.length === 0 ? (
              <Text style={styles.bellEmpty}>Trade and wallet activity will appear here in real time.</Text>
            ) : (
              <ScrollView style={styles.bellList}>
                {notifications.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setOpen(false);
                      if (item.escrowId) router.push(`/trade/${item.escrowId}`);
                    }}
                    style={styles.bellItem}
                  >
                    <Text style={styles.bellMessage}>{item.message}</Text>
                    <Text style={styles.bellTime}>{new Date(item.at).toLocaleTimeString(language)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {notifications.length > 0 ? (
              <Pressable onPress={clearAll}>
                <Text style={styles.clear}>Clear all</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function HeaderWallet() {
  if (!walletConnectReady) return null;
  return <WalletPill />;
}

function WalletPill() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { open } = useAppKit();
  const { address, isConnected, chain, chainId } = useAccount();
  const [menu, setMenu] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [legal, setLegal] = useState<LegalDoc | null>(null);
  const pendingAction = useRef<"connect" | "disconnect" | null>(null);
  const connected = Boolean(isConnected && address);
  const onMainnet = chainId === "1" || chain?.id === 1;
  const label = connected ? `ETH ${shortAddr(address)}` : "Connect wallet";

  function runPendingAction() {
    const action = pendingAction.current;
    if (!action) return;
    pendingAction.current = null;
    if (action === "connect") {
      open({ view: "Connect" });
    } else if (action === "disconnect") {
      setDisconnecting(true);
      void disconnectWallet().finally(() => setDisconnecting(false));
    }
  }

  useEffect(() => {
    if (menu || !pendingAction.current || Platform.OS === "ios") return;
    const timer = setTimeout(runPendingAction, 180);
    return () => clearTimeout(timer);
  }, [menu]);

  return (
    <View style={styles.walletSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(label)}
        onPress={() => {
          if (!connected) {
            open({ view: "Connect" });
            return;
          }
          setMenu(true);
        }}
        style={styles.walletPill}
      >
        {connected ? <View style={styles.walletDot} /> : null}
        <Text style={styles.walletLabel} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
        <Text style={styles.walletChevron}>⌄</Text>
      </Pressable>
      <Modal
        visible={menu}
        transparent
        animationType="fade"
        onDismiss={runPendingAction}
        onRequestClose={() => { if (legal) setLegal(null); else setMenu(false); }}
      >
        <View style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)}>
          <Pressable
            style={[styles.walletMenu, { marginTop: insets.top + 52 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.bellTitle}>Wallet connections</Text>
            <Text style={styles.bellEmpty}>Connect an Ethereum wallet for ERC-20 trades.</Text>
            <View style={styles.networkRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.networkName}>{chain?.name || "Ethereum"}</Text>
                {connected ? <Text style={styles.networkAddress}>{shortAddr(address)}</Text> : null}
                <Text style={styles.networkStatus}>
                  {connected
                    ? onMainnet
                      ? "Connected · Ethereum mainnet"
                      : "Wrong network · Ethereum mainnet required"
                    : "Connect for ERC-20 USDT trades"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={disconnecting}
                onPress={() => {
                  pendingAction.current = "connect";
                  setMenu(false);
                }}
                style={styles.changeButton}
              >
                <Text style={styles.changeLabel}>{connected ? "Change" : "Connect"}</Text>
              </Pressable>
            </View>
            {connected ? (
              <Button
                label={disconnecting ? "Disconnecting…" : "Disconnect WalletConnect"}
                tone="ghost"
                busy={disconnecting}
                onPress={() => {
                  pendingAction.current = "disconnect";
                  setMenu(false);
                }}
              />
            ) : null}
            <View style={{ marginTop: 12 }}>
              <WalletAgreement onOpen={setLegal} />
            </View>
          </Pressable>
        </Pressable>
        {legal ? <LegalSheet key={legal} embedded doc={legal} onClose={() => setLegal(null)} /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "#1f3440",
    paddingBottom: 10,
    overflow: "hidden",
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logo: { height: 32, width: 128, maxWidth: "38%", flexShrink: 1 },
  tools: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, minWidth: 0 },
  languageButton: { minWidth: 36, minHeight: 40, paddingHorizontal: 2, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  walletSlot: { flexShrink: 1, minWidth: 0, maxWidth: "100%" },
  bell: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1b24",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: "#3ecf8e",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#042016", fontSize: 10, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  bellPanel: {
    alignSelf: "center",
    width: "92%",
    maxHeight: "55%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1b24",
    padding: 12,
  },
  bellHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  bellTitle: { color: "#e8f4f2", fontWeight: "700" },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  soundLabel: { color: "#8aa3ad", fontSize: 12 },
  bellEmpty: { color: "#8aa3ad", fontSize: 14, lineHeight: 20, marginVertical: 8 },
  bellList: { maxHeight: 280 },
  bellItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1f3440" },
  bellMessage: { color: "#e8f4f2", fontSize: 14, lineHeight: 20 },
  bellTime: { color: "#8aa3ad", fontSize: 12, marginTop: 2 },
  clear: { color: "#e8b84a", marginTop: 10, fontSize: 14 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3ecf8e", marginRight: 6 },
  bellItemHeader: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  bellItemTitle: { color: "#8aa3ad", fontSize: 13, fontWeight: "600", flex: 1 },
  bellItemTitleUnread: { color: "#e8f4f2", fontWeight: "700" },
  bellItemUnread: { backgroundColor: "rgba(62, 207, 142, 0.05)", borderRadius: 8, paddingHorizontal: 6 },
  settingsBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "#1f3440" },
  settingsBtnText: { color: "#e8f4f2", fontSize: 11, fontWeight: "600" },
  markReadBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "#1f6b4a" },
  markReadText: { color: "#3ecf8e", fontSize: 11, fontWeight: "600" },
  settingsPanel: { paddingVertical: 8, gap: 12 },
  prefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 6 },
  prefLabel: { color: "#e8f4f2", fontSize: 13, fontWeight: "600" },
  prefDesc: { color: "#8aa3ad", fontSize: 11, marginTop: 1 },
  bellFooter: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  walletPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 4,
    minHeight: 36,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    overflow: "hidden",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1b24",
  },
  walletDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3ecf8e", flexShrink: 0 },
  walletLabel: { color: "#e8f4f2", fontSize: 12, fontWeight: "700", flexShrink: 1, minWidth: 0 },
  walletChevron: { color: "#8aa3ad", fontSize: 16, marginTop: -2, flexShrink: 0 },
  walletMenu: {
    alignSelf: "flex-end",
    marginRight: 12,
    width: "88%",
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "#0e1b24",
    padding: 14,
    gap: 8,
  },
  networkRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#1f3440", paddingTop: 10 },
  networkName: { color: "#e8f4f2", fontWeight: "700", fontSize: 16 },
  networkAddress: { color: "#e8f4f2", marginTop: 2 },
  networkStatus: { color: "#8aa3ad", marginTop: 4, lineHeight: 18 },
  changeButton: { borderWidth: 1, borderColor: "#1f3440", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  changeLabel: { color: "#e8f4f2", fontWeight: "700" },
});
