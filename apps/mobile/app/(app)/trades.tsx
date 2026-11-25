import { Text, useLanguage } from "../../src/language";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { AppBottomNav } from "../../src/AppBottomNav";
import { AppTopBar } from "../../src/AppTopBar";
import { useAuth } from "../../src/auth";
import { useLiveNotifications } from "../../src/liveNotifications";
import { formatAmount, shortAddr, tokenLabel } from "../../src/format";
import { colors } from "../../src/theme";
import type { TradeRow } from "../../src/types";
import { Button, Notice } from "../../src/ui";
import { readableLabel, statusColor } from "../../src/tradePresentation";
import { TradeRoleTags } from "../../src/TradeRoleTags";
import { TradePartyBadge } from "../../src/TradePartyBadge";
import { saveTextFileToDevice } from "../../src/TradeFiles";

const PAGE_SIZE = 5;
type CategoryFilter = "all" | "open" | "completed" | "disputed";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function tradeDate(row: TradeRow): Date | null {
  const raw = row.createdAt || row.updatedAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function csvEscape(value: string) {
  const safe = value.replace(/\r?\n/g, " ");
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function buildTradesCsv(items: TradeRow[]) {
  const header = ["Date", "Title", "Status", "Amount", "Token", "Chain", "Buyer", "Seller", "Contract"].join(",");
  const lines = items.map((item) => {
    const dt = tradeDate(item);
    return [
      dt ? dt.toISOString() : "",
      item.title || "",
      item.status || "",
      formatAmount(item.amountAtomic),
      tokenLabel(item.tokenSymbol),
      item.chain === "tron" ? "Tron" : "Ethereum",
      item.buyerUser?.displayName || item.buyerAddress || "",
      item.sellerUser?.displayName || item.sellerAddress || "",
      item.contractAddress || "",
    ].map(csvEscape).join(",");
  });
  return [header, ...lines].join("\n");
}

export default function TradesScreen({ publicOnly = false }: { publicOnly?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { syncEscrowIds } = useLiveNotifications();
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPublic, setShowPublic] = useState(publicOnly);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setError(null);
    try {
      const next = await api<TradeRow[]>(user && !showPublic ? "/v1/me/trades" : "/v1/escrows");
      if (request !== generation.current) return;
      setRows(next);
      if (user && !showPublic) syncEscrowIds(next.map((trade) => trade.id));
    } catch (err) {
      if (request === generation.current) setError(err instanceof ApiError ? err.message : "Could not load trades.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [user, showPublic, syncEscrowIds]);

  useFocusEffect(useCallback(() => {
    if (rows.length === 0) setLoading(true);
    void load();
    return () => { generation.current++; };
  }, [load, rows.length]));

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const row of rows) {
      const dt = tradeDate(row);
      if (dt) set.add(dt.getFullYear());
    }
    const list = Array.from(set).sort((a, b) => b - a);
    return list.length > 0 ? list : [new Date().getFullYear()];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((item) => {
      if (category === "open" && ["Completed", "Resolved", "Cancelled"].includes(item.status)) return false;
      if (category === "completed" && !["Completed", "Resolved"].includes(item.status)) return false;
      if (category === "disputed" && item.status !== "Disputed") return false;
      if (selectedYear !== null) {
        const dt = tradeDate(item);
        if (!dt || dt.getFullYear() !== selectedYear) return false;
        if (selectedMonth !== null && dt.getMonth() !== selectedMonth) return false;
      }
      return true;
    });
  }, [rows, category, selectedYear, selectedMonth]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const remainingCount = Math.max(0, filtered.length - visibleCount);

  const periodLabel = selectedYear === null
    ? t("All dates")
    : selectedMonth === null
      ? String(selectedYear)
      : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

  async function exportCsv() {
    if (exporting || filtered.length === 0) return;
    setExporting(true);
    setExportNotice(null);
    setError(null);
    try {
      const suffix = selectedYear === null
        ? "all"
        : selectedMonth === null
          ? String(selectedYear)
          : `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
      const filename = `2pescrow-${showPublic ? "ledger" : "trades"}-${suffix}.csv`;
      const csv = buildTradesCsv(filtered);
      const res = await saveTextFileToDevice(filename, "text/csv", csv);
      if (res.saved && Platform.OS === "android") {
        setExportNotice(t("Saved {name} to device.", { name: filename }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppTopBar />
      <FlatList
        style={{ backgroundColor: colors.bg, flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 36 }}
        data={visibleRows}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 34, marginBottom: 8 }}>
              {showPublic ? "Public ledger" : user ? "My trades" : "Trades"}
            </Text>
            <Text style={{ color: colors.muted, marginBottom: 14, fontSize: 15, lineHeight: 22 }}>
              {user && !showPublic
                ? "Every trade where you are buyer, seller, or linked by wallet."
                : "All escrow deals on the platform ledger, by chain. Sign in to see all your trades."}
            </Text>
            {error ? <><Notice text={error} /><Button label="Try again" tone="ghost" onPress={() => void load()} /></> : null}
            {exportNotice ? <Notice text={exportNotice} tone="ok" /> : null}
            {user && !publicOnly ? (
              <View style={{ marginBottom: 10 }}>
                <Button
                  label={showPublic ? "Show my trades" : "Browse public ledger"}
                  tone="ghost"
                  onPress={() => {
                    setRows([]);
                    setLoading(true);
                    setVisibleCount(PAGE_SIZE);
                    setShowPublic((value) => !value);
                  }}
                />
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}><Button label="Start a trade" onPress={() => router.push("/new-trade")} /></View>
              <View style={{ flex: 1 }}><Button label="Join a trade" tone="ghost" onPress={() => router.push(user ? "/join-trade" : "/sign-in")} /></View>
            </View>

            {/* Restrained filter & export utility strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {(["all", "open", "completed", "disputed"] as const).map((key) => {
                const active = category === key;
                const label = key === "all" ? "All" : key === "open" ? "Open" : key === "completed" ? "Completed" : "Disputed";
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => {
                      setCategory(key);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    style={[s.chip, active && s.chipActive]}
                  >
                    <Text style={[s.chipLabel, active && s.chipLabelActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={s.utilityRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setDatePickerOpen(true)}
                style={[s.utilPill, selectedYear !== null && s.utilPillActive]}
              >
                <Text translate={false} style={[s.utilPillText, selectedYear !== null && s.utilPillTextActive]}>
                  {periodLabel} ▾
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={exporting || filtered.length === 0}
                onPress={() => void exportCsv()}
                style={[s.utilPill, (exporting || filtered.length === 0) && { opacity: 0.45 }]}
              >
                <Text style={s.utilPillText}>{exporting ? "Exporting…" : "Export CSV"}</Text>
              </Pressable>
              <Text translate={false} style={s.countMeta}>
                {filtered.length} {filtered.length === 1 ? t("trade") : t("trades")}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          !error ? (
            <Text style={{ color: colors.muted, marginTop: 14 }}>
              {loading ? "Loading trades…" : rows.length > 0 ? "No trades match this filter." : "No trades yet."}
            </Text>
          ) : null
        }
        ListFooterComponent={
          remainingCount > 0 ? (
            <View style={{ marginTop: 16, gap: 8 }}>
              <Text translate={false} style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
                {t("Showing {shown} of {total}", { shown: visibleRows.length, total: filtered.length })}
              </Text>
              <Button
                label={`Load more (${remainingCount})`}
                tone="ghost"
                onPress={() => setVisibleCount((current) => current + PAGE_SIZE)}
              />
            </View>
          ) : filtered.length > PAGE_SIZE ? (
            <Text translate={false} style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>
              {t("Showing all {total} trades", { total: filtered.length })}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/trade/${item.id}`)}
            style={s.tradeCard}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <Text translate={false} numberOfLines={2} style={{ color: colors.text, fontWeight: "700", fontSize: 16, flex: 1, minWidth: 0 }}>
                {item.title}
              </Text>
              <View style={{
                backgroundColor: `${statusColor(item.status)}22`,
                borderColor: `${statusColor(item.status)}55`,
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 4,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                flexShrink: 0,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor(item.status), flexShrink: 0 }} />
                <Text numberOfLines={1} style={{ color: statusColor(item.status), fontWeight: "700", fontSize: 12 }}>
                  {readableLabel(item.status)}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Text style={{ color: colors.gold, fontWeight: "600" }}>{formatAmount(item.amountAtomic)} {tokenLabel(item.tokenSymbol)}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>· {item.chain === "tron" ? "Tron" : "Ethereum"}</Text>
              {tradeDate(item) ? (
                <Text translate={false} style={{ color: colors.muted, fontSize: 12 }}>
                  · {MONTH_NAMES[tradeDate(item)!.getMonth()]} {tradeDate(item)!.getDate()}, {tradeDate(item)!.getFullYear()}
                </Text>
              ) : null}
            </View>
            {user ? <TradePartyBadge trade={item} userId={user.id} walletAddresses={user.wallets?.map((wallet) => wallet.address)} /> : null}
            <TradeRoleTags
              buyer={item.buyerUser?.displayName || (item.buyerAddress ? shortAddr(item.buyerAddress) : "")}
              seller={item.sellerUser?.displayName || (item.sellerAddress ? shortAddr(item.sellerAddress) : "")}
            />
          </Pressable>
        )}
      />

      {/* Minimal Month / Year Filter Sheet */}
      <Modal visible={datePickerOpen} transparent animationType="fade" onRequestClose={() => setDatePickerOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setDatePickerOpen(false)}>
          <SafeAreaView style={s.sheetWrap}>
            <Pressable style={s.sheetCard} onPress={() => {}}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>Filter by date</Text>
                <Pressable onPress={() => setDatePickerOpen(false)} style={s.sheetClose}>
                  <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 13 }}>Done</Text>
                </Pressable>
              </View>

              <Text style={s.sheetLabel}>Year</Text>
              <View style={s.gridWrap}>
                <Pressable
                  onPress={() => {
                    setSelectedYear(null);
                    setSelectedMonth(null);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  style={[s.gridChip, selectedYear === null && s.gridChipActive]}
                >
                  <Text style={[s.chipLabel, selectedYear === null && s.chipLabelActive]}>All time</Text>
                </Pressable>
                {availableYears.map((yr) => (
                  <Pressable
                    key={yr}
                    onPress={() => {
                      setSelectedYear(yr);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    style={[s.gridChip, selectedYear === yr && s.gridChipActive]}
                  >
                    <Text translate={false} style={[s.chipLabel, selectedYear === yr && s.chipLabelActive]}>{yr}</Text>
                  </Pressable>
                ))}
              </View>

              {selectedYear !== null ? (
                <>
                  <Text style={[s.sheetLabel, { marginTop: 14 }]}>Month</Text>
                  <View style={s.gridWrap}>
                    <Pressable
                      onPress={() => {
                        setSelectedMonth(null);
                        setVisibleCount(PAGE_SIZE);
                      }}
                      style={[s.gridChip, selectedMonth === null && s.gridChipActive]}
                    >
                      <Text style={[s.chipLabel, selectedMonth === null && s.chipLabelActive]}>All year</Text>
                    </Pressable>
                    {MONTH_NAMES.map((mName, idx) => (
                      <Pressable
                        key={mName}
                        onPress={() => {
                          setSelectedMonth(idx);
                          setVisibleCount(PAGE_SIZE);
                        }}
                        style={[s.gridChip, selectedMonth === idx && s.gridChipActive]}
                      >
                        <Text translate={false} style={[s.chipLabel, selectedMonth === idx && s.chipLabelActive]}>{mName}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>

      <AppBottomNav active="escrows" />
    </View>
  );
}

const s = StyleSheet.create({
  chipRow: { flexDirection: "row", gap: 8, paddingBottom: 10 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(62, 207, 142, 0.14)",
  },
  chipLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipLabelActive: { color: colors.accent },
  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  utilPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  utilPillActive: {
    borderColor: colors.gold,
    backgroundColor: "rgba(232, 184, 74, 0.12)",
  },
  utilPillText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  utilPillTextActive: { color: colors.gold },
  countMeta: { color: colors.muted, fontSize: 12, marginLeft: "auto" },
  tradeCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(62, 207, 142, 0.16)",
    padding: 14,
    marginTop: 10,
    gap: 8,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(4, 10, 16, 0.72)",
    justifyContent: "flex-end",
  },
  sheetWrap: { width: "100%" },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: 20,
    paddingBottom: 28,
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  sheetClose: { paddingHorizontal: 10, paddingVertical: 6 },
  sheetLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  gridChipActive: {
    borderColor: colors.gold,
    backgroundColor: "rgba(232, 184, 74, 0.14)",
  },
});
