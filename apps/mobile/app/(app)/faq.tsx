import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { colors } from "../../src/theme";
import type { FaqItem } from "../../src/types";
import { Notice } from "../../src/ui";

export default function FaqScreen() {
  const [rows, setRows] = useState<FaqItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<FaqItem[]>("/v1/faq")
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the FAQ."));
  }, []);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={{ color: colors.muted, marginBottom: 14, lineHeight: 20 }}>The same published questions as the website.</Text>
      {error ? <Notice text={error} /> : null}
      {rows.map((item) => {
        const expanded = open === item.id;
        return (
          <Pressable key={item.id} onPress={() => setOpen(expanded ? null : item.id)} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: colors.card }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{item.question}</Text>
            {expanded ? <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 21 }}>{item.answer}</Text> : null}
          </Pressable>
        );
      })}
      {!error && rows.length === 0 ? <Text style={{ color: colors.muted }}>No questions are published yet.</Text> : null}
    </ScrollView>
  );
}
