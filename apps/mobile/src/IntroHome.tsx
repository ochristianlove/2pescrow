import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { api } from "./api";
import { AppTopBar } from "./AppTopBar";
import { HomeFooter } from "./HomeFooter";

const steps = [
  ["1", "You set the terms", "Code"],
  ["2", "They confirm a wallet", "Join"],
  ["3", "Buyer funds the contract", "USDT"],
  ["4", "Release, or open a dispute", "Your call"],
] as const;

export function IntroHome() {
  const router = useRouter();
  const [tradeCount, setTradeCount] = useState("—");
  const [tronEnabled, setTronEnabled] = useState(false);
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (mounted) setMotion(!reduce);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (reduce) => setMotion(!reduce));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ id: string }[]>("/v1/escrows")
      .then((rows) => {
        if (!cancelled) setTradeCount(String(rows.length));
      })
      .catch(() => {});
    api<{ tronSupportEnabled?: boolean }>("/v1/settings")
      .then((settings) => {
        if (!cancelled) setTronEnabled(Boolean(settings.tronSupportEnabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function signIn() {
    router.push("/sign-in");
  }

  return (
    <View style={styles.screen}>
      <PageWash />
      <AppTopBar />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <DriftOrb motion={motion} style={styles.orbGreen} dx={-10} dy={8} duration={7000} />
          <DriftOrb motion={motion} style={styles.orbGold} dx={8} dy={-10} duration={8400} />
          <Rise motion={motion} delay={0}>
            <Text style={styles.kicker}>ERC-20 ON ETHEREUM, LOCKED UNTIL THE DEAL IS DONE</Text>
          </Rise>
          <Rise motion={motion} delay={70}>
            <Text style={styles.brand}>Pay a stranger without handing them the money.</Text>
          </Rise>
          <Rise motion={motion} delay={140}>
            <Text style={styles.lead}>
              Open a trade, pass a short code, and meet the other person in one shared room. On a phone, the buyer funds ERC-20 USDT or ERC-20 USDC on Ethereum. The coins sit in the smart contract until delivery is accepted. 2Pescrow never holds the funds.
            </Text>
          </Rise>
          <Rise motion={motion} delay={210}>
            <Breathe motion={motion}>
              <Pressable accessibilityRole="button" onPress={signIn} style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}>
                <Text style={styles.startLabel}>Start a trade</Text>
              </Pressable>
            </Breathe>
          </Rise>
          <Rise motion={motion} delay={280}>
            <Pressable accessibilityRole="button" onPress={signIn} style={({ pressed }) => [styles.joinButton, pressed && styles.pressed]}>
              <Text style={styles.joinLabel}>Join a trade</Text>
            </Pressable>
          </Rise>
          <Rise motion={motion} delay={340}>
            <View style={styles.stats}>
              <Stat strong="$1" label="to open a trade" />
              <Stat strong="90 / 10" label="seller / protocol on release" />
              <Stat strong={tradeCount} label="trades on the ledger" />
            </View>
          </Rise>
        </View>

        <Rise motion={motion} delay={180} distance={16}>
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>SHARED ROOM</Text>
              <View style={styles.liveRow}>
                <LiveDot motion={motion} />
                <Text style={styles.liveLabel}>BOTH SIDES</Text>
              </View>
            </View>
            {steps.map(([num, label, tag], index) => (
              <Rise key={num} motion={motion} delay={240 + index * 70} distance={0} fromX={10}>
                <View style={styles.step}>
                  <View style={[styles.stepNum, num === "4" && styles.stepNumGold]}>
                    <Text style={[styles.stepNumText, num === "4" && styles.stepNumTextGold]}>{num}</Text>
                  </View>
                  <Text style={styles.stepLabel}>{label}</Text>
                  <Text style={styles.stepTag}>{tag.toUpperCase()}</Text>
                </View>
              </Rise>
            ))}
          </View>
        </Rise>

        <View style={styles.trust}>
          <Rise motion={motion} delay={420}>
            <Trust title="Non-custodial" body="The contract holds the tokens, not us" />
          </Rise>
          <Rise motion={motion} delay={480}>
            <Trust title="One room" body="Same history for both people" />
          </Rise>
          <Rise motion={motion} delay={540}>
            <Trust title="Either side" body="The open seat decides who joins" />
          </Rise>
        </View>

        <View style={styles.coins}>
          <Rise motion={motion} delay={560}>
            <Text style={styles.coinsTitle}>Yes, we are accepting these coins.</Text>
          </Rise>
          <Rise motion={motion} delay={620}>
            <CoinCard
              index="01"
              title="ERC-20 USDT"
              body="On Ethereum. The funds sit in the smart contract until delivery is accepted."
            />
          </Rise>
          <Rise motion={motion} delay={700}>
            <CoinCard
              index="02"
              title="ERC-20 USDC"
              body="On Ethereum. The funds sit in the smart contract until delivery is accepted."
            />
          </Rise>
          {tronEnabled ? (
            <Rise motion={motion} delay={780}>
              <CoinCard
                index="03"
                title="TRC-20 USDT"
                body="On Tron. The buyer funds a Tron contract, and the coins stay there until release."
                tron
              />
            </Rise>
          ) : null}
        </View>
        <HomeFooter />
      </ScrollView>

      <Rise motion={motion} delay={120} distance={8}>
      <SafeAreaView edges={["bottom"]} style={styles.nav}>
        <NavItem label="Home" active icon="home" onPress={() => {}} />
        <NavItem label="Escrows" icon="escrows" onPress={() => router.push("/(app)/trades")} />
        <NavItem label="Start" fab icon="start" onPress={signIn} motion={motion} />
        <NavItem label="Join" icon="join" onPress={signIn} />
        <NavItem label="Sign in" icon="profile" onPress={signIn} />
      </SafeAreaView>
      </Rise>
    </View>
  );
}

function PageWash() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ flex: 1, backgroundColor: "#0c1a24" }} />
      <View style={{ flex: 1, backgroundColor: "#071018" }} />
      <View style={{ flex: 1, backgroundColor: "#050c12" }} />
      <View style={styles.washTeal} />
      <View style={styles.washGreen} />
    </View>
  );
}

function Rise({
  motion,
  delay = 0,
  distance = 12,
  fromX = 0,
  children,
}: {
  motion: boolean;
  delay?: number;
  distance?: number;
  fromX?: number;
  children: ReactNode;
}) {
  const value = useRef(new Animated.Value(motion ? 0 : 1)).current;

  useEffect(() => {
    if (!motion) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    const anim = Animated.timing(value, {
      toValue: 1,
      duration: 560,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [delay, motion, value]);

  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

function LiveDot({ motion }: { motion: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!motion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [motion, pulse]);

  return (
    <View style={styles.liveDotWrap}>
      <Animated.View
        style={[
          styles.liveRing,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.liveDot,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
          },
        ]}
      />
    </View>
  );
}

function Breathe({ motion, children }: { motion: boolean; children: ReactNode }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!motion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [motion, value]);

  return (
    <Animated.View style={{ transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }) }] }}>
      {children}
    </Animated.View>
  );
}

function DriftOrb({
  motion,
  style,
  dx,
  dy,
  duration,
}: {
  motion: boolean;
  style: object;
  dx: number;
  dy: number;
  duration: number;
}) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!motion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, duration, motion]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          ],
        },
      ]}
    />
  );
}

function Stat({ strong, label }: { strong: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statStrong}>{strong}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Trust({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.trustPill}>
      <Text style={styles.trustTitle}>{title}</Text>
      <Text style={styles.trustBody}>{body}</Text>
    </View>
  );
}

function CoinCard({ index, title, body, tron }: { index: string; title: string; body: string; tron?: boolean }) {
  return (
    <View style={[styles.coinCard, tron ? styles.coinCardTron : styles.coinCardEth]}>
      <Text style={[styles.coinIndex, tron && styles.coinIndexTron]}>{index}</Text>
      <Text style={styles.coinTitle}>{title}</Text>
      <Text style={styles.coinBody}>{body}</Text>
    </View>
  );
}

function NavItem({
  label,
  icon,
  active,
  fab,
  motion,
  onPress,
}: {
  label: string;
  icon: "home" | "escrows" | "start" | "join" | "profile";
  active?: boolean;
  fab?: boolean;
  motion?: boolean;
  onPress: () => void;
}) {
  const color = active ? "#3ecf8e" : "#8aa3ad";
  const iconSlot = (
    <View style={[styles.navIconSlot, fab && styles.navFab]}>
      <NavIcon name={icon} color={fab ? "#04130d" : color} />
    </View>
  );
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.navItem}>
      {fab ? <Breathe motion={Boolean(motion)}>{iconSlot}</Breathe> : iconSlot}
      <Text style={[styles.navLabel, active && { color: "#3ecf8e" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function NavIcon({ name, color }: { name: "home" | "escrows" | "start" | "join" | "profile"; color: string }) {
  const common = { fill: "none" as const, stroke: color, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" fill={color === "#3ecf8e" ? "#3ecf8e" : "none"} />
      </Svg>
    );
  }
  if (name === "escrows") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M7 11V7a5 5 0 0 1 10 0v4M6 11h12v10H6V11Z" />
      </Svg>
    );
  }
  if (name === "start") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M12 5v14M5 12h14" />
      </Svg>
    );
  }
  if (name === "join") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M7 11h10M7 15h6M10 7V5a2 2 0 1 1 4 0v2M6 11h12v10H6V11Z" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path {...common} d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      <Path {...common} d="M4 20a8 8 0 0 1 16 0" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c1a24" },
  washTeal: {
    position: "absolute",
    width: 280,
    height: 180,
    borderRadius: 140,
    backgroundColor: "rgba(46, 184, 200, 0.18)",
    top: -40,
    right: -60,
  },
  washGreen: {
    position: "absolute",
    width: 240,
    height: 160,
    borderRadius: 120,
    backgroundColor: "rgba(62, 207, 142, 0.12)",
    top: 80,
    left: -80,
  },
  topbar: {
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "#1f3440",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  logo: { height: 32, width: 168 },
  scroll: { padding: 16, paddingBottom: 24, gap: 14 },
  hero: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.22)",
    backgroundColor: "#081620",
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 22,
    overflow: "hidden",
  },
  orbGreen: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(62, 207, 142, 0.22)",
    top: -50,
    right: -40,
  },
  orbGold: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(232, 184, 74, 0.16)",
    bottom: -30,
    left: -30,
  },
  kicker: {
    color: "#e8b84a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  brand: {
    color: "#f5fffb",
    fontSize: 40,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.4,
    marginBottom: 14,
  },
  lead: { color: "rgba(232, 244, 242, 0.82)", fontSize: 16, lineHeight: 26, marginBottom: 16 },
  startButton: {
    backgroundColor: "#3ecf8e",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  startLabel: { color: "#04130d", fontWeight: "700", fontSize: 16 },
  pressed: { transform: [{ scale: 0.98 }] },
  joinButton: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(232, 184, 74, 0.55)",
    backgroundColor: "rgba(232, 184, 74, 0.12)",
    marginBottom: 16,
  },
  joinLabel: { color: "#e8b84a", fontWeight: "700", fontSize: 16 },
  stats: { gap: 8 },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.25)",
    backgroundColor: "rgba(4, 12, 18, 0.65)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statStrong: { color: "#3ecf8e", fontWeight: "700", marginRight: 8 },
  statLabel: { color: "#8aa3ad", fontSize: 13, flexShrink: 1 },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(43, 184, 200, 0.28)",
    backgroundColor: "rgba(4, 14, 22, 0.88)",
    padding: 14,
    gap: 8,
  },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  panelTitle: { color: "#2bb8c8", fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDotWrap: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  liveRing: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#3ecf8e",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#3ecf8e" },
  liveLabel: { color: "#3ecf8e", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(138, 170, 184, 0.12)",
    backgroundColor: "rgba(7, 19, 26, 0.75)",
  },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(62, 207, 142, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.4)",
  },
  stepNumGold: { backgroundColor: "rgba(232, 184, 74, 0.14)", borderColor: "rgba(232, 184, 74, 0.45)" },
  stepNumText: { color: "#3ecf8e", fontWeight: "700" },
  stepNumTextGold: { color: "#e8b84a" },
  stepLabel: { color: "#e8f4f2", fontWeight: "600", flex: 1, fontSize: 14 },
  stepTag: { color: "#8aa3ad", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  trust: { gap: 8 },
  trustPill: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f3440",
    backgroundColor: "rgba(14, 28, 38, 0.55)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  trustTitle: { color: "#e8f4f2", fontWeight: "700", fontSize: 14, marginBottom: 2 },
  trustBody: { color: "#8aa3ad", fontSize: 13 },
  coins: { gap: 12, marginTop: 26 },
  coinsTitle: { color: "#e8f4f2", fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.4, marginBottom: 4 },
  coinCard: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#0e1c26",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  coinCardEth: { borderColor: "rgba(232, 184, 74, 0.55)" },
  coinCardTron: { borderColor: "rgba(255, 6, 10, 0.5)" },
  coinIndex: { color: "#e8b84a", fontSize: 28, fontWeight: "800", marginBottom: 8 },
  coinIndexTron: { color: "#ff4d4d" },
  coinTitle: { color: "#e8f4f2", fontSize: 16, fontWeight: "700", marginBottom: 6 },
  coinBody: { color: "#8aa3ad", fontSize: 14, lineHeight: 21 },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1f3440",
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "flex-end", minHeight: 58, gap: 2 },
  navIconSlot: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  navFab: { backgroundColor: "#3ecf8e", borderRadius: 12 },
  navLabel: { color: "#8aa3ad", fontSize: 10, fontWeight: "600" },
});
