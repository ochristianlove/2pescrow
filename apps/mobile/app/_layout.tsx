import { AppKit, AppKitProvider, useAccount } from "@reown/appkit-react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { appKit } from "../src/appkit";
import { AuthProvider, useAuth } from "../src/auth";
import { LiveNotificationsProvider, useLiveNotifications } from "../src/liveNotifications";
import { shortAddr } from "../src/format";
import { colors } from "../src/theme";
import { LanguageProvider } from "../src/language";

const previousErrorHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("Calculated frame index should never be lower than 0") ||
    message.includes("moved to \"native\"")
  ) {
    return;
  }
  previousErrorHandler(error, isFatal);
});

class AppErrorBoundary extends Component<
  { children: ReactNode; fallback?: (reset: () => void) => ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <View style={styles.fallbackScreen}>
        <RNText style={styles.fallbackTitle}>2Pescrow</RNText>
        <RNText style={styles.fallbackBody}>
          Something went wrong while loading this screen. Tap below to reload.
        </RNText>
        <Pressable accessibilityRole="button" onPress={this.reset} style={styles.fallbackBtn}>
          <RNText style={styles.fallbackBtnText}>Reload</RNText>
        </Pressable>
      </View>
    );
  }
}

function Gate() {
  const { ready, user } = useAuth();
  const segments: readonly string[] = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const publicScreen =
      segments[0] === "trade" ||
      (segments[0] === "(app)" && (segments[1] === "ledger" || segments[1] === "trades" || segments[1] === "faq"));
    const needsSignIn = segments[0] === "new-trade" || (segments[0] === "(app)" && !publicScreen);
    if (!user && needsSignIn) router.replace("/sign-in");
  }, [ready, user, segments, router]);

  return null;
}

function WalletConnectedFeedback() {
  const { address, isConnected } = useAccount();
  const { pushNotification } = useLiveNotifications();
  const lastNotified = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      lastNotified.current = null;
      return;
    }
    const key = address.toLowerCase();
    if (lastNotified.current === key) return;
    const firstForSession = lastNotified.current === null;
    lastNotified.current = key;
    pushNotification({
      event: "wallet:connected",
      message: firstForSession ? `Wallet connected (${shortAddr(address)}).` : `Wallet switched to ${shortAddr(address)}.`,
    });
  }, [isConnected, address, pushNotification]);

  return null;
}

function WalletConnectShell({ children }: { children: ReactNode }) {
  if (!appKit) return <View style={styles.shell}>{children}</View>;
  return (
    <AppErrorBoundary fallback={() => <View style={styles.shell}>{children}</View>}>
      <AppKitProvider instance={appKit}>
        <View style={styles.shell}>
          {children}
          <WalletConnectedFeedback />
          <AppKit />
        </View>
      </AppKitProvider>
    </AppErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <View style={styles.shell}>
        <LanguageProvider>
          <AuthProvider>
            <LiveNotificationsProvider>
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
                  <Stack.Screen name="auth/verify" options={{ headerShown: false }} />
                  <Stack.Screen name="(app)" options={{ headerShown: false }} />
                  <Stack.Screen name="new-trade" options={{ headerShown: false }} />
                  <Stack.Screen name="join-trade" options={{ headerShown: false }} />
                  <Stack.Screen name="trade/[id]" options={{ headerShown: false }} />
                </Stack>
              </WalletConnectShell>
            </LiveNotificationsProvider>
          </AuthProvider>
        </LanguageProvider>
      </View>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, overflow: "hidden", backgroundColor: colors.bg },
  fallbackScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 14,
  },
  fallbackTitle: { color: colors.text, fontSize: 24, fontWeight: "800" },
  fallbackBody: { color: colors.muted, fontSize: 15, textAlign: "center", lineHeight: 22 },
  fallbackBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  fallbackBtnText: { color: colors.primaryFg, fontWeight: "700", fontSize: 15 },
});
