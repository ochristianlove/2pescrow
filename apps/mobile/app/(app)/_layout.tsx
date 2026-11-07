import { Tabs } from "expo-router";
import { colors } from "../../src/theme";

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="trades" options={{ title: "Trades" }} />
      <Tabs.Screen name="ledger" options={{ title: "Ledger" }} />
      <Tabs.Screen name="faq" options={{ title: "FAQ" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
