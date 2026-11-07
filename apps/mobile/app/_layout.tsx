import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../src/auth";
import { colors } from "../src/theme";

function Gate() {
  const { ready, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inApp = segments[0] === "(app)" || segments[0] === "trade" || segments[0] === "new-trade" || segments[0] === "join-trade";
    if (!user && inApp) router.replace("/sign-in");
  }, [ready, user, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
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
        <Stack.Screen name="join-trade" options={{ title: "Join a trade" }} />
        <Stack.Screen name="trade/[id]" options={{ title: "Trade" }} />
      </Stack>
    </AuthProvider>
  );
}
