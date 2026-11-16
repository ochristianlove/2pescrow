import { Text } from "../../src/language";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError, tokenFromInput } from "../../src/api";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { colors } from "../../src/theme";

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const raw = typeof params.token === "string" ? params.token : "";
  const token = tokenFromInput(raw) || raw;
  const { signInWithToken } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This sign-in link has no token.");
      return;
    }
    if (started.current === token) return;
    started.current = token;
    let cancelled = false;
    (async () => {
      try {
        const session = await api<{ token: string }>("/v1/auth/magic-link/verify", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        await signInWithToken(session.token);
        if (!cancelled) router.replace("/(app)/dashboard");
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "That sign-in link did not work.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, signInWithToken, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppTopBar />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        {error ? <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
      </View>
    </View>
  );
}
