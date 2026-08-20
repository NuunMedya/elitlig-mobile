/**
 * MAÇ AL — takım başkanının saha talebi ekranı.
 *
 * Web'deki MatchRequestBoard'un mobil karşılığı. Akış: saha seç → haftayı gez →
 * boş saatleri işaretle → not yazıp gönder. Yönetici onaylayınca slot "dolu"
 * olur ve takıma MATCH_REQUEST bildirimi düşer.
 *
 * NEDEN ÇOKLU SEÇİM: saha panosunda tek saat istemek çoğu zaman reddedilmeyle
 * bitiyor (aynı saati birden çok takım istiyor). Sunucu tek talepte birden çok
 * saat kabul ediyor; başkan alternatiflerini birlikte gönderince yönetici
 * uygun olanı onaylıyor. Bu yüzden hücreler açma/kapama mantığıyla seçiliyor.
 *
 * DURUM RENKLERİ panonun kendi sözleşmesinden gelir:
 *   open      → seçilebilir (yeşil kenarlık)
 *   awaiting  → bir takım istemiş, rakip bekleniyor (sarı)
 *   booked    → maç alınmış (mor)
 *   closed    → yönetici kapatmış (gri)
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  Touchable,
  useRefresh,
  useToast,
} from "@/components/ui";
import type { AdminBoardCell, SlotStatus } from "@/lib/api/admin";
import {
  cancelMatchRequest,
  createMatchRequest,
  getMyMatchRequests,
  getVenueBoard,
  getVenues,
  MATCH_REQUEST_STATUS_LABELS,
  type MyMatchRequest,
} from "@/lib/api/team";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, haptics, radius, space, textScale, type } from "@/theme";

type Tab = "pano" | "taleplerim";

const TABS = [
  { key: "pano" as const, label: "Saha Panosu" },
  { key: "taleplerim" as const, label: "Taleplerim" },
];

/** Hücre anahtarı — seçim kümesinde ve sunucuya gönderirken aynı biçim. */
const cellKey = (cell: { date: string; hour: number; minute: number }) =>
  `${cell.date}|${cell.hour}|${cell.minute}`;

const parseCellKey = (key: string) => {
  const [date, hour, minute] = key.split("|");
  return { date, hour: Number(hour), minute: Number(minute) };
};

/** Gün başlığı: "Çar 20 Ağu" */
function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("tr-TR", { weekday: "short" });
  const rest = date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return `${day} ${rest}`;
}

function statusColor(status: SlotStatus): string {
  switch (status) {
    case "open":
      return colors.win;
    case "awaiting":
      return colors.warn;
    case "booked":
      return colors.brandAccent;
    default:
      return colors.textTertiary;
  }
}

export default function MacAlScreen() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("pano");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const venuesQuery = useQuery({
    queryKey: ["team", "venues"],
    queryFn: getVenues,
    enabled: Boolean(auth.user),
    staleTime: 5 * 60_000,
  });

  const activeVenue = venueId ?? venuesQuery.data?.items[0]?.public_id ?? null;

  const boardQuery = useQuery({
    queryKey: ["team", "venue-board", activeVenue, weekStart ?? "bu-hafta"],
    queryFn: () => getVenueBoard(activeVenue as string, weekStart),
    enabled: Boolean(activeVenue) && tab === "pano",
    staleTime: 30_000,
  });

  const requestsQuery = useQuery({
    queryKey: ["team", "match-requests"],
    queryFn: () => getMyMatchRequests(),
    enabled: Boolean(auth.user) && tab === "taleplerim",
    staleTime: 30_000,
  });

  const refresh = useRefresh(
    tab === "pano" ? boardQuery.refetch : requestsQuery.refetch,
    { refreshing: tab === "pano" ? boardQuery.isRefetching : requestsQuery.isRefetching }
  );

  /* ─────────────────────────── talep gönderme ─────────────────────────── */

  const submit = useMutation({
    mutationFn: () =>
      createMatchRequest({
        venueId: activeVenue as string,
        slots: [...selected].map(parseCellKey),
        note: note.trim() || undefined,
      }),
    onSuccess: (data) => {
      setSelected(new Set());
      setNote("");
      toast.show({ message: data.message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["team", "match-requests"] });
      void boardQuery.refetch();
      setTab("taleplerim");
    },
    onError: (error) => {
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Talep gönderilemedi.",
        tone: "danger",
      });
    },
  });

  const withdraw = useMutation({
    mutationFn: (publicId: string) => cancelMatchRequest(publicId),
    onSuccess: (data) => {
      toast.show({ message: data.message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["team", "match-requests"] });
    },
    onError: (error) => {
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Talep geri çekilemedi.",
        tone: "danger",
      });
    },
  });

  const toggleCell = useCallback((cell: AdminBoardCell) => {
    if (cell.status !== "open" || !cell.is_bookable) return;
    haptics.select();
    setSelected((prev) => {
      const next = new Set(prev);
      const key = cellKey(cell);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** Hücreler güne göre gruplanır; pano gün satırları hâlinde çizilir. */
  const days = useMemo(() => {
    const cells = boardQuery.data?.cells ?? [];
    const map = new Map<string, AdminBoardCell[]>();
    cells.forEach((cell) => {
      const list = map.get(cell.date);
      if (list) list.push(cell);
      else map.set(cell.date, [cell]);
    });
    return [...map.entries()].map(([date, list]) => ({ date, cells: list }));
  }, [boardQuery.data]);

  const weeks = boardQuery.data?.weeks ?? venuesQuery.data?.weeks ?? [];
  const currentWeek = boardQuery.data?.week_start ?? weekStart ?? weeks[0]?.start;

  const shiftWeek = useCallback(
    (direction: -1 | 1) => {
      if (!weeks.length || !currentWeek) return;
      const index = weeks.findIndex((week) => week.start === currentWeek);
      const next = weeks[index + direction];
      if (!next) return;
      haptics.select();
      setWeekStart(next.start);
      setSelected(new Set());
    },
    [weeks, currentWeek]
  );

  if (!auth.user) return <Redirect href="/giris" />;

  const canManageTeam =
    Boolean(auth.user.managed_team_id) ||
    auth.user.profile_type === "takim_baskani" ||
    auth.user.profile_type === "double";

  if (!canManageTeam) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Maç Al" back />
        <EmptyState
          icon="calendar-outline"
          title="Takım yönetimi gerekiyor"
          body="Saha talebi yalnızca takım başkanları tarafından gönderilebilir. Takım yönetimi yetkisi için elitlig.com üzerinden başvurabilirsin."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Maç Al" subtitle="Saha talebi gönder" back />

      <View style={styles.tabs}>
        <SegmentedControl items={TABS} value={tab} onChange={setTab} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} tintColor={colors.brandAccent} />
        }
      >
        {tab === "pano" ? (
          <>
            {venuesQuery.isLoading ? (
              <SkeletonCard />
            ) : venuesQuery.error ? (
              <ErrorState error={venuesQuery.error} onRetry={venuesQuery.refetch} />
            ) : !venuesQuery.data?.items.length ? (
              <EmptyState
                icon="location-outline"
                title="Bu ilde saha tanımlı değil"
                body="Yönetim henüz bu il için saha eklememiş. Maç talebi açıldığında burada görünecek."
                variant="inline"
              />
            ) : (
              <>
                <SectionHeader title="SAHA" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueRow}>
                  {venuesQuery.data.items.map((venue) => (
                    <Chip
                      key={venue.public_id}
                      label={venue.name}
                      selected={venue.public_id === activeVenue}
                      onPress={() => {
                        haptics.select();
                        setVenueId(venue.public_id);
                        setSelected(new Set());
                      }}
                    />
                  ))}
                </ScrollView>

                {/* Hafta gezinme */}
                <View style={styles.weekRow}>
                  <Touchable feedback="icon" onPress={() => shiftWeek(-1)} accessibilityLabel="Önceki hafta">
                    <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
                  </Touchable>
                  <Text style={styles.weekLabel} numberOfLines={1}>
                    {weeks.find((week) => week.start === currentWeek)?.label ?? "Bu hafta"}
                  </Text>
                  <Touchable feedback="icon" onPress={() => shiftWeek(1)} accessibilityLabel="Sonraki hafta">
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </Touchable>
                </View>

                {/* Lejant */}
                <View style={styles.legend}>
                  {(
                    [
                      ["open", "Uygun"],
                      ["awaiting", "Rakip bekleniyor"],
                      ["booked", "Dolu"],
                      ["closed", "Kapalı"],
                    ] as [SlotStatus, string][]
                  ).map(([status, label]) => (
                    <View key={status} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: statusColor(status) }]} />
                      <Text style={styles.legendText}>{label}</Text>
                    </View>
                  ))}
                </View>

                {boardQuery.isLoading ? (
                  <SkeletonCard />
                ) : boardQuery.error ? (
                  <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
                ) : !days.length ? (
                  <EmptyState
                    icon="calendar-outline"
                    title="Bu hafta saat yok"
                    body="Seçtiğin haftada bu sahada açık saat bulunmuyor. Sonraki haftayı deneyebilirsin."
                    variant="inline"
                  />
                ) : (
                  days.map((day) => (
                    <Card key={day.date} padding="sm" style={styles.dayCard}>
                      <Text style={styles.dayTitle}>{dayLabel(day.date)}</Text>
                      <View style={styles.slotWrap}>
                        {day.cells.map((cell) => {
                          const key = cellKey(cell);
                          const isSelected = selected.has(key);
                          const selectable = cell.status === "open" && cell.is_bookable;
                          return (
                            <Touchable
                              key={key}
                              feedback={selectable ? "chip" : "none"}
                              onPress={selectable ? () => toggleCell(cell) : undefined}
                              accessibilityLabel={`${cell.label} ${
                                selectable ? "uygun" : "seçilemez"
                              }`}
                              style={[
                                styles.slot,
                                { borderColor: statusColor(cell.status) },
                                !selectable && styles.slotDisabled,
                                isSelected && styles.slotSelected,
                              ]}
                            >
                              <Text
                                style={[styles.slotText, isSelected && styles.slotTextSelected]}
                                allowFontScaling={false}
                              >
                                {cell.label}
                              </Text>
                            </Touchable>
                          );
                        })}
                      </View>
                    </Card>
                  ))
                )}

                {selected.size > 0 ? (
                  <Card padding="md" style={styles.submitCard}>
                    <Text style={styles.submitTitle}>
                      {selected.size} saat seçildi
                    </Text>
                    <Text style={styles.submitHint} {...textScale.long}>
                      Birden fazla saat seçebilirsin; yönetici uygun olanı onaylar. Onaylanan saat
                      takımına maç olarak yazılır ve bildirim gelir.
                    </Text>
                    <Input
                      value={note}
                      onChangeText={setNote}
                      placeholder="Not (isteğe bağlı) — örn. rakip bulundu, hakem talebi"
                      multiline
                    />
                    <View style={styles.submitActions}>
                      <Button
                        label="Seçimi temizle"
                        variant="ghost"
                        size="sm"
                        onPress={() => setSelected(new Set())}
                      />
                      <Button
                        label="Talebi gönder"
                        size="sm"
                        onPress={() => submit.mutate()}
                        loading={submit.isPending}
                      />
                    </View>
                  </Card>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            {requestsQuery.isLoading ? (
              <SkeletonCard />
            ) : requestsQuery.error ? (
              <ErrorState error={requestsQuery.error} onRetry={requestsQuery.refetch} />
            ) : !requestsQuery.data?.items.length ? (
              <EmptyState
                icon="document-text-outline"
                title="Henüz talebin yok"
                body="Saha panosundan boş saatleri seçip talep gönderdiğinde burada listelenir."
                action={{ label: "Saha panosunu aç", onPress: () => setTab("pano") }}
                variant="inline"
              />
            ) : (
              requestsQuery.data.items.map((request) => (
                <RequestCard
                  key={request.public_id}
                  request={request}
                  onWithdraw={() => withdraw.mutate(request.public_id)}
                  withdrawing={withdraw.isPending}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ TALEP KARTI ═══════════════════════════ */

function RequestCard({
  request,
  onWithdraw,
  withdrawing,
}: {
  request: MyMatchRequest;
  onWithdraw: () => void;
  withdrawing: boolean;
}) {
  const tone =
    request.status === "approved"
      ? colors.win
      : request.status === "rejected"
        ? colors.danger
        : request.status === "cancelled"
          ? colors.textTertiary
          : colors.warn;

  return (
    <Card padding="md" style={styles.requestCard}>
      <View style={styles.requestHead}>
        <Text style={styles.requestVenue} numberOfLines={1}>
          {request.venue_name}
        </Text>
        <Text style={[styles.requestStatus, { color: tone }]} allowFontScaling={false}>
          {MATCH_REQUEST_STATUS_LABELS[request.status] ?? request.status}
        </Text>
      </View>

      {request.venue_location ? (
        <Text style={styles.requestMeta} numberOfLines={1}>
          {request.venue_location}
        </Text>
      ) : null}

      <View style={styles.slotWrap}>
        {(request.slots ?? []).map((slot, index) => (
          <View key={`${slot.date}-${slot.hour}-${slot.minute}-${index}`} style={styles.requestSlot}>
            <Text style={styles.requestSlotText} allowFontScaling={false}>
              {dayLabel(slot.date)} · {slot.label ?? `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`}
            </Text>
          </View>
        ))}
      </View>

      {request.note ? <Text style={styles.requestNote} {...textScale.long}>Notun: {request.note}</Text> : null}
      {request.admin_note ? (
        <Text style={styles.requestNote} {...textScale.long}>Yönetici notu: {request.admin_note}</Text>
      ) : null}

      {request.status === "pending" ? (
        <Button label="Talebi geri çek" variant="ghost" size="sm" onPress={onWithdraw} loading={withdrawing} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { paddingHorizontal: space.md, paddingBottom: space.sm },
  content: { padding: space.md, gap: space.md, paddingBottom: space.giant },

  venueRow: { gap: space.sm, paddingVertical: space.xs },

  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  weekLabel: { ...type.label, color: colors.textPrimary, flex: 1, textAlign: "center" },

  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.caption, color: colors.textSecondary },

  dayCard: { gap: space.sm },
  dayTitle: { ...type.label, color: colors.textPrimary },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  slot: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.s,
    minWidth: 58,
    alignItems: "center",
    backgroundColor: colors.surface2,
  },
  slotDisabled: { opacity: 0.45 },
  slotSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotText: { ...type.caption, color: colors.textPrimary },
  slotTextSelected: { color: colors.textOnBrand },

  submitCard: { gap: space.sm },
  submitTitle: { ...type.h3, color: colors.textPrimary },
  submitHint: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
  submitActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm },

  requestCard: { gap: space.sm },
  requestHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  requestVenue: { ...type.h3, color: colors.textPrimary, flex: 1 },
  requestStatus: { ...type.caption },
  requestMeta: { ...type.caption, color: colors.textTertiary },
  requestSlot: {
    backgroundColor: colors.surface3,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  requestSlotText: { ...type.caption, color: colors.textSecondary },
  requestNote: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
});
