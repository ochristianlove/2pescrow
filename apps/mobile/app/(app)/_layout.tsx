import { Tabs } from "expo-router";
import { colors } from "../../src/theme";

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="trades" options={{ title: "Trades" }} />
      <Tabs.Screen name="ledger" options={{ title: "Ledger" }} />
      <Tabs.Screen name="faq" options={{ title: "FAQ" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="referrals" options={{ title: "Payouts" }} />
      <Tabs.Screen name="feedback" options={{ title: "Feedback", href: null }} />
    </Tabs>
  );
}
