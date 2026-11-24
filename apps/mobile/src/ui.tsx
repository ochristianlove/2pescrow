import { Text, TextInput, useLanguage } from "./language";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type TextInputProps } from "react-native";
import { breakable } from "./format";
import { colors, space } from "./theme";

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({ label, style, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, props.multiline && { textAlignVertical: "top", minHeight: 96 }, style]} {...props} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy,
  disabled = false,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger";
}) {
  const { t } = useLanguage();
  const isDisabled = disabled || Boolean(busy);
  const mutedPrimary = disabled && !busy && tone === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(label)}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(busy) }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "ghost" && styles.ghost,
        tone === "danger" && styles.danger,
        mutedPrimary && styles.disabledPrimary,
        isDisabled && !mutedPrimary && { opacity: 0.45 },
        pressed && !isDisabled && { opacity: 0.75 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone === "primary" ? colors.primaryFg : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            tone !== "primary" && { color: colors.text },
            mutedPrimary && styles.disabledPrimaryText,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Notice({ text, tone = "error" }: { text: string; tone?: "error" | "ok" }) {
  const { t } = useLanguage();
  return <Text accessibilityLiveRegion="polite" style={[styles.notice, tone === "ok" && { color: colors.accent }]}>{breakable(t(text))}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 34 },
  subtitle: { color: colors.muted, marginTop: 8, fontSize: 16, lineHeight: 24 },
  label: { color: colors.muted, marginBottom: 6, fontSize: 13 },
  input: {
    color: colors.text,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(232, 184, 74, 0.38)" },
  danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.danger },
  disabledPrimary: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, opacity: 0.78 },
  disabledPrimaryText: { color: colors.muted },
  buttonText: { color: colors.primaryFg, fontWeight: "700", fontSize: 15, textAlign: "center", paddingVertical: 10 },
  notice: { color: colors.danger, marginBottom: 12, lineHeight: 20, width: "100%" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.gap + 4,
    marginBottom: 12,
  },
});
