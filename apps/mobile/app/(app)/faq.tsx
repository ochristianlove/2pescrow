import { Text } from "../../src/language";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { colors } from "../../src/theme";
import type { FaqItem } from "../../src/types";
import { Button, Notice, ScreenTitle } from "../../src/ui";
import { plainTerms } from "../../src/tradePresentation";

export default function FaqScreen() {
  const [rows, setRows] = useState<FaqItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true); setError(null);
    api<FaqItem[]>("/v1/faq")
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the FAQ."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <AppTopBar />
    <ScrollView style={{ backgroundColor: colors.bg, flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <ScreenTitle title="FAQ" subtitle="Plain answers about how a trade stays safe, what happens in a dispute, and how referral and agent pay works." />
      {loading ? <Text style={{ color: colors.muted }}>Loading…</Text> : null}
      {error ? <><Notice text={error} /><Button label="Try again" tone="ghost" onPress={load} /></> : null}
      {rows.map((item) => {
        const expanded = open === item.id;
        return (
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} key={item.id} onPress={() => setOpen(expanded ? null : item.id)} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: colors.card }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{item.question}</Text>
            {expanded ? <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 21 }}>{plainTerms(item.answer)}</Text> : null}
          </Pressable>
        );
      })}
      {!loading && !error && rows.length === 0 ? <Text style={{ color: colors.muted }}>No questions are published yet.</Text> : null}
    </ScrollView>
    <AppBottomNav />
    </View>
  );
}
