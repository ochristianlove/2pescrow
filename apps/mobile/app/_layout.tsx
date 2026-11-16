import { AppKit, AppKitProvider, useAccount } from "@reown/appkit-react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appKit } from "../src/appkit";
import { LegalSheet, WalletAgreement, type LegalDoc } from "../src/LegalSheet";
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

function WalletSheetFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [legal, setLegal] = useState<LegalDoc | null>(null);
  return (
    <View style={styles.sheetFrame}>
      {children}
      <View style={[styles.legalBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <WalletAgreement onOpen={setLegal} />
      </View>
      {legal ? <LegalSheet key={legal} embedded doc={legal} onClose={() => setLegal(null)} /> : null}
    </View>
  );
}

function WalletConnectShell({ children }: { children: ReactNode }) {
  if (!appKit) return <>{children}</>;
  return (
    <AppKitProvider instance={appKit}>
      <View style={styles.shell}>
        {children}
        <WalletConnectedFeedback />
        <AppKit modalContentWrapper={WalletSheetFrame} />
      </View>
    </AppKitProvider>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider><AuthProvider>
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
    </AuthProvider></LanguageProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, overflow: "hidden" },
  sheetFrame: { flex: 1, width: "100%", overflow: "hidden" },
  legalBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#0e1b24",
    borderTopWidth: 1,
    borderTopColor: "#1f3440",
  },
});
