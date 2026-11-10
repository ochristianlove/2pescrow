import { AppKit, AppKitProvider } from "@reown/appkit-react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { appKit } from "../src/appkit";
import { AuthProvider, useAuth } from "../src/auth";
import { colors } from "../src/theme";

function Gate() {
  const { ready, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inApp = segments[0] === "(app)" || segments[0] === "trade" || segments[0] === "new-trade";
    const publicTrades = segments[0] === "(app)" && (segments[1] === "ledger" || segments[1] === "trades");
    if (!user && inApp && !publicTrades) router.replace("/sign-in");
  }, [ready, user, segments, router]);

  return null;
}

function WalletConnectShell({ children }: { children: ReactNode }) {
  if (!appKit) return <>{children}</>;
  return (
    <AppKitProvider instance={appKit}>
      {children}
      <View pointerEvents="box-none" style={{ position: "absolute", height: "100%", width: "100%" }}>
        <AppKit />
      </View>
    </AppKitProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <WalletConnectShell>
        <StatusBar style="light" />
        <Gate />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="auth/verify" options={{ title: "Sign in" }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="new-trade" options={{ title: "New trade" }} />
          <Stack.Screen name="join-trade" options={{ headerShown: false }} />
          <Stack.Screen name="trade/[id]" options={{ headerShown: false }} />
        </Stack>
      </WalletConnectShell>
    </AuthProvider>
  );
}
