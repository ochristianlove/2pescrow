import { Text } from "./language";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "./auth";

type Tab = "home" | "escrows" | "start" | "join" | "profile";

export function AppBottomNav({ active }: { active?: Tab }) {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <SafeAreaView edges={["bottom"]} style={styles.nav}>
      <NavItem label="Home" icon="home" active={active === "home"} onPress={() => router.replace(user ? "/(app)/dashboard" : "/")} />
      <NavItem
        label="Escrows"
        icon="escrows"
        active={active === "escrows"}
        onPress={() => router.push("/(app)/trades")}
      />
      <NavItem
        label="Start"
        fab
        icon="start"
        active={active === "start"}
        onPress={() => router.push(user ? "/new-trade" : "/sign-in")}
      />
      <NavItem
        label="Join"
        icon="join"
        active={active === "join"}
        onPress={() => router.push(user ? "/join-trade" : "/sign-in")}
      />
      <NavItem
        label={user ? "Profile" : "Sign in"}
        icon="profile"
        active={active === "profile"}
        onPress={() => router.push(user ? "/(app)/account" : "/sign-in")}
      />
    </SafeAreaView>
  );
}

function NavItem({
  label,
  icon,
  active,
  fab,
  onPress,
}: {
  label: string;
  icon: Tab;
  active?: boolean;
  fab?: boolean;
  onPress: () => void;
}) {
  const color = active ? "#3ecf8e" : "#8aa3ad";
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress} style={styles.navItem}>
      <View style={[styles.navIconSlot, fab && styles.navFab]}>
        <NavIcon name={icon} color={fab ? "#04130d" : color} active={Boolean(active)} />
      </View>
      <Text style={[styles.navLabel, active && { color: "#3ecf8e" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function NavIcon({ name, color, active }: { name: Tab; color: string; active: boolean }) {
  const common = { fill: "none" as const, stroke: color, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" fill={active ? "#3ecf8e" : "none"} />
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
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1f3440",
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "flex-end", minHeight: 58, gap: 2 },
  navIconSlot: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  navFab: { backgroundColor: "#3ecf8e", borderRadius: 12 },
  navLabel: { color: "#8aa3ad", fontSize: 10, fontWeight: "600" },
});
