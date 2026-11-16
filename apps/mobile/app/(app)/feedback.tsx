import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { Text } from "../../src/language";
import { colors } from "../../src/theme";
import { Button, Field, Notice } from "../../src/ui";

const CATEGORIES = [
  ["feature_request", "App / feature request"],
  ["ui_ux", "UI / UX — what I saw or felt"],
  ["recommendation", "Recommendation / improvement"],
  ["visibility", "Something I can't find or see"],
  ["other", "Other"],
] as const;

type Category = (typeof CATEGORIES)[number][0];

export default function FeedbackScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [category, setCategory] = useState<Category>("ui_ux");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void api<{ feedbackEnabled?: boolean }>("/v1/settings")
      .then((settings) => {
        if (!cancelled) setEnabled(Boolean(settings.feedbackEnabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []));

  async function submit() {
    if (message.trim().length < 10 || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await api<{ message: string }>("/v1/feedback", {
        method: "POST",
        body: JSON.stringify({
          category,
          subject: subject.trim() || undefined,
          message: message.trim(),
          pagePath: "mobile/feedback",
        }),
      });
      setNote(result.message || "Thank you — your feedback was sent to the team.");
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppTopBar />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Button label="Back to profile" tone="ghost" onPress={() => router.back()} />
        <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginTop: 16 }}>Help us improve</Text>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 6 }}>Send feedback</Text>
        {enabled == null ? <Text style={{ color: colors.muted, marginTop: 16 }}>Loading…</Text> : null}
        {enabled == false ? (
          <Text style={{ color: colors.muted, marginTop: 16, lineHeight: 22 }}>
            Feedback is turned off right now. Check back later or contact support through your usual channel.
          </Text>
        ) : null}
        {enabled ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={{ color: colors.muted, lineHeight: 22 }}>
              Tell us about features you want, UI/UX issues, things that confused you, or anything you experienced on the site. Your message goes to the platform admin by email and is stored for review.
            </Text>
            {note ? <Notice text={note} tone="ok" /> : null}
            {error ? <Notice text={error} /> : null}
            <Text style={{ color: colors.muted, marginTop: 8 }}>Category</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {CATEGORIES.map(([value, label]) => {
                const selected = category === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(value)}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.line,
                      backgroundColor: selected ? "rgba(62, 207, 142, 0.12)" : "transparent",
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: selected ? colors.accent : colors.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Field label="Short subject (optional)" value={subject} onChangeText={setSubject} maxLength={200} placeholder="e.g. Trade list is hard to read on mobile" />
            <Field
              label="Your feedback"
              value={message}
              onChangeText={setMessage}
              maxLength={8000}
              multiline
              placeholder="Describe what you want changed, what happened, or what you recommend…"
            />
            <Text style={{ color: colors.muted, lineHeight: 20 }}>
              Signed in as {user?.displayName || user?.email || "your account"}
            </Text>
            <Button label={busy ? "Sending…" : "Submit feedback"} busy={busy} disabled={message.trim().length < 10} onPress={() => void submit()} />
          </View>
        ) : null}
      </ScrollView>
      <AppBottomNav active="profile" />
    </View>
  );
}
