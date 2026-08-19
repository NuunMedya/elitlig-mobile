import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  getAdminBoard,
  getAdminRequests,
  getAdminVenues,
  releaseSlot,
  REQUEST_STATUS_LABELS,
  reviewMatchRequest,
  setSlotStatus,
  SLOT_STATUS_LABELS,
  type AdminBoardCell,
  type AdminMatchRequest,
  type AdminVenue,
  type RequestStatus,
} from "@/lib/api/admin";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Saha Yönetimi — iki sekme:
 *
 *   Talepler : takımların maç alma talepleri; not ekleyerek onayla / reddet.
 *   Sahalar  : saha listesi; seçilen sahanın haftalık programı gün gün açılır,
 *              hücreler duruma göre renklenir, dokununca kapatılır / açılır.
 *              Takım yazılı hücreler istenirse boşaltılır.
 *
 * Hücre durumları sunucudaki SLOT_STATUSES ile birebir:
 *   open (yeşil çerçeve) · closed (gri) · awaiting (sarı) · booked (mor).
 */

type Tab = "requests" | "venues";

const REQUEST_FILTERS: (RequestStatus | null)[] = [null, "pending", "approved", "rejected"];

/** Talep durumu → renk. */
function requestColor(status: RequestStatus): string {
  if (status === "pending") return colors.yellow;
  if (status === "approved") return colors.green;
  if (status === "rejected") return colors.red;
  return colors.muted;
}

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.userMessage : "Beklenmeyen bir hata oluştu.";

/** "2026-08-17" + gün → ISO tarih (hafta gezinmesi için). */
const addDaysISO = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export default function AdminVenuesScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("requests");

  /* ---------- Talepler sekmesi ---------- */
  const [requestFilter, setRequestFilter] = useState<RequestStatus | null>(null);
  const [review, setReview] = useState<{ request: AdminMatchRequest; decision: "approve" | "reject" } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["admin", "match-requests", requestFilter],
    queryFn: () => getAdminRequests({ status: requestFilter ?? "all" }),
    enabled: Boolean(auth.user) && auth.isManagement && tab === "requests",
    staleTime: 10_000,
    retry: false,
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { publicId: string; decision: "approve" | "reject"; adminNote?: string }) =>
      reviewMatchRequest(input.publicId, { decision: input.decision, adminNote: input.adminNote }),
    onSuccess: (result) => {
      setReview(null);
      setAdminNote("");
      queryClient.invalidateQueries({ queryKey: ["admin", "match-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "venue-board"] });
      Alert.alert("Tamam", result.message);
    },
    onError: (error) => Alert.alert("İşlem yapılamadı", errorText(error)),
  });

  /* ---------- Sahalar sekmesi ---------- */
  const [selectedVenue, setSelectedVenue] = useState<AdminVenue | null>(null);
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);

  const venuesQuery = useQuery({
    queryKey: ["admin", "venues"],
    queryFn: getAdminVenues,
    enabled: Boolean(auth.user) && auth.isManagement && tab === "venues",
    staleTime: 30_000,
    retry: false,
  });

  const boardQuery = useQuery({
    queryKey: ["admin", "venue-board", selectedVenue?.public_id, weekStart ?? null],
    queryFn: () => getAdminBoard(selectedVenue?.public_id as string, weekStart),
    enabled: Boolean(auth.user) && auth.isManagement && Boolean(selectedVenue),
    staleTime: 10_000,
    retry: false,
  });

  const refreshBoard = () => queryClient.invalidateQueries({ queryKey: ["admin", "venue-board"] });

  const slotMutation = useMutation({
    mutationFn: (input: { publicId: string; date: string; hour: number; minute: number; status: "open" | "closed" }) =>
      setSlotStatus(input.publicId, input),
    onSuccess: refreshBoard,
    onError: (error) => Alert.alert("Saat güncellenemedi", errorText(error)),
  });

  const releaseMutation = useMutation({
    mutationFn: (input: { publicId: string; date: string; hour: number; minute: number }) =>
      releaseSlot(input.publicId, { date: input.date, hour: input.hour, minute: input.minute }),
    onSuccess: (result) => {
      refreshBoard();
      Alert.alert("Tamam", result.message);
    },
    onError: (error) => Alert.alert("Saat boşaltılamadı", errorText(error)),
  });

  const board = boardQuery.data;

  /* Hücreler gün gün gruplanır: dikey gün listesi, yatay saat çipleri. */
  const cellsByDay = useMemo(() => {
    if (!board) return [];
    const map = new Map<string, AdminBoardCell[]>();
    board.cells.forEach((cell) => {
      const group = map.get(cell.date) ?? [];
      group.push(cell);
      map.set(cell.date, group);
    });
    return board.venue.grid.days.map((day) => ({ day, cells: map.get(day.date) ?? [] }));
  }, [board]);

  const onCellPress = (cell: AdminBoardCell) => {
    if (!selectedVenue) return;
    const label = `${formatDateShort(cell.date)} ${cell.label}`;

    if (cell.status === "open") {
      Alert.alert("Saati kapat", `${label} saati talebe kapatılsın mı?`, [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kapat",
          style: "destructive",
          onPress: () =>
            slotMutation.mutate({
              publicId: selectedVenue.public_id,
              date: cell.date,
              hour: cell.hour,
              minute: cell.minute,
              status: "closed",
            }),
        },
      ]);
      return;
    }

    if (cell.status === "closed") {
      Alert.alert("Saati aç", `${label} saati yeniden talebe açılsın mı?`, [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Aç",
          onPress: () =>
            slotMutation.mutate({
              publicId: selectedVenue.public_id,
              date: cell.date,
              hour: cell.hour,
              minute: cell.minute,
              status: "open",
            }),
        },
      ]);
      return;
    }

    // awaiting / booked: takımlar gösterilir, istenirse saat boşaltılır.
    const teams = [cell.home?.team_name, cell.away?.team_name].filter(Boolean).join(" – ");
    Alert.alert(
      SLOT_STATUS_LABELS[cell.status] ?? cell.status,
      `${label}\n${teams}${cell.pending_count ? `\nBekleyen talep: ${cell.pending_count}` : ""}`,
      [
        { text: "Kapat", style: "cancel" },
        {
          text: "Saati boşalt",
          style: "destructive",
          onPress: () =>
            releaseMutation.mutate({
              publicId: selectedVenue.public_id,
              date: cell.date,
              hour: cell.hour,
              minute: cell.minute,
            }),
        },
      ]
    );
  };

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }
  if (!auth.isManagement) {
    return <Redirect href="/yonetim" />;
  }

  /* Hafta gezinmesi: sunucunun izin verdiği hafta aralığında kal. */
  const currentWeek = board?.week_start;
  const weekOptions = board?.weeks ?? [];
  const canPrev = Boolean(currentWeek && weekOptions.length && currentWeek > weekOptions[0].start);
  const canNext = Boolean(
    currentWeek && weekOptions.length && currentWeek < weekOptions[weekOptions.length - 1].start
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Saha Yönetimi" subtitle="Maç talepleri ve saha programı" />

      {/* Sekme seçici */}
      <View style={styles.tabs}>
        {(
          [
            { key: "requests", label: "Talepler" },
            { key: "venues", label: "Sahalar" },
          ] as { key: Tab; label: string }[]
        ).map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={({ pressed }) => [
              styles.tabBtn,
              tab === item.key && styles.tabBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "requests" ? (
        <>
          {/* Talep durum filtresi */}
          <View style={styles.chips}>
            {REQUEST_FILTERS.map((status) => (
              <Pressable
                key={status ?? "all"}
                onPress={() => setRequestFilter(status)}
                style={({ pressed }) => [
                  styles.chip,
                  requestFilter === status && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, requestFilter === status && styles.chipTextActive]}>
                  {status === null ? "Tümü" : REQUEST_STATUS_LABELS[status]}
                </Text>
              </Pressable>
            ))}
          </View>

          {requestsQuery.isLoading ? (
            <Loading />
          ) : requestsQuery.isError ? (
            <ErrorState error={requestsQuery.error} onRetry={requestsQuery.refetch} />
          ) : (requestsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Talep yok"
              body="Bu filtrede maç alma talebi bulunmuyor."
            />
          ) : (
            <FlatList
              data={requestsQuery.data?.items ?? []}
              keyExtractor={(item) => item.public_id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.team_name}
                    </Text>
                    <View style={[styles.tag, { backgroundColor: requestColor(item.status) + "1F" }]}>
                      <Text style={[styles.tagText, { color: requestColor(item.status) }]}>
                        {REQUEST_STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>
                    {item.venue_name} · {formatDateShort(item.created_at)}
                  </Text>
                  {item.note ? <Text style={styles.cardNote}>“{item.note}”</Text> : null}

                  {/* İstenen saatler */}
                  <View style={styles.slotChips}>
                    {item.slots.map((slot) => (
                      <View
                        key={`${slot.date}-${slot.hour}-${slot.minute}`}
                        style={[
                          styles.slotChip,
                          slot.status === "approved" && styles.slotChipApproved,
                          slot.status === "rejected" && styles.slotChipRejected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.slotChipText,
                            slot.status === "approved" && { color: colors.green },
                            slot.status === "rejected" && { color: colors.muted },
                          ]}
                        >
                          {slot.label}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {item.admin_note ? (
                    <Text style={styles.adminNoteText}>Yönetici notu: {item.admin_note}</Text>
                  ) : null}

                  {item.status === "pending" ? (
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => {
                          setAdminNote("");
                          setReview({ request: item, decision: "reject" });
                        }}
                        style={({ pressed }) => [styles.btn, styles.rejectBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.rejectText}>Reddet</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setAdminNote("");
                          setReview({ request: item, decision: "approve" });
                        }}
                        style={({ pressed }) => [styles.btn, styles.approveBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.approveText}>Onayla</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              )}
            />
          )}
        </>
      ) : selectedVenue ? (
        /* ---------- Saha programı (haftalık tablo) ---------- */
        <View style={styles.flex}>
          <View style={styles.boardHead}>
            <Pressable
              onPress={() => {
                setSelectedVenue(null);
                setWeekStart(undefined);
              }}
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={22} color={colors.line} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.boardTitle} numberOfLines={1}>
                {selectedVenue.name}
              </Text>
              <Text style={styles.boardMeta} numberOfLines={1}>
                {selectedVenue.open_label} – {selectedVenue.close_label} · {selectedVenue.slot_minutes} dk
              </Text>
            </View>
          </View>

          {/* Hafta gezinmesi */}
          <View style={styles.weekNav}>
            <Pressable
              disabled={!canPrev}
              onPress={() => currentWeek && setWeekStart(addDaysISO(currentWeek, -7))}
              style={({ pressed }) => [styles.weekBtn, (!canPrev || pressed) && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={15} color={colors.line} />
              <Text style={styles.weekBtnText}>önceki</Text>
            </Pressable>
            <Text style={styles.weekLabel}>
              {currentWeek
                ? weekOptions.find((week) => week.start === currentWeek)?.label ?? currentWeek
                : "…"}
            </Text>
            <Pressable
              disabled={!canNext}
              onPress={() => currentWeek && setWeekStart(addDaysISO(currentWeek, 7))}
              style={({ pressed }) => [styles.weekBtn, (!canNext || pressed) && styles.pressed]}
            >
              <Text style={styles.weekBtnText}>sonraki</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.line} />
            </Pressable>
          </View>

          {/* Renk açıklaması */}
          <View style={styles.legend}>
            <View style={[styles.legendDot, { borderColor: colors.green }]} />
            <Text style={styles.legendText}>Açık</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.faint, borderColor: colors.faint }]} />
            <Text style={styles.legendText}>Kapalı</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.yellow, borderColor: colors.yellow }]} />
            <Text style={styles.legendText}>Rakip bekliyor</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.turf, borderColor: colors.turf }]} />
            <Text style={styles.legendText}>Maç alındı</Text>
          </View>

          {boardQuery.isLoading ? (
            <Loading />
          ) : boardQuery.isError ? (
            <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
          ) : cellsByDay.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Program yok"
              body="Bu hafta için sahada açık gün bulunmuyor."
            />
          ) : (
            <ScrollView contentContainerStyle={styles.boardList}>
              {cellsByDay.map(({ day, cells }) => (
                <View key={day.date} style={styles.dayCard}>
                  <View style={styles.dayHead}>
                    <Text style={styles.dayTitle}>
                      {day.label} · {day.date_label}
                    </Text>
                    {day.is_today ? (
                      <View style={styles.todayTag}>
                        <Text style={styles.todayText}>Bugün</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.slotWrap}>
                    {cells.map((cell) => {
                      const booked = cell.status === "booked";
                      const awaiting = cell.status === "awaiting";
                      const closed = cell.status === "closed";
                      return (
                        <Pressable
                          key={`${cell.date}-${cell.hour}-${cell.minute}`}
                          disabled={cell.is_past || !cell.is_bookable}
                          onPress={() => onCellPress(cell)}
                          style={({ pressed }) => [
                            styles.slotCell,
                            booked && styles.slotBooked,
                            awaiting && styles.slotAwaiting,
                            closed && styles.slotClosed,
                            (cell.is_past || !cell.is_bookable) && styles.slotDisabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.slotCellText,
                              booked && { color: colors.surface },
                              awaiting && { color: colors.line },
                              closed && { color: colors.muted },
                            ]}
                          >
                            {cell.label}
                          </Text>
                          {cell.pending_count > 0 ? (
                            <View style={styles.pendingBadge}>
                              <Text style={styles.pendingText}>{cell.pending_count}</Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : venuesQuery.isLoading ? (
        <Loading />
      ) : venuesQuery.isError ? (
        <ErrorState error={venuesQuery.error} onRetry={venuesQuery.refetch} />
      ) : (venuesQuery.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon="location-outline"
          title="Saha yok"
          body="Henüz tanımlı bir saha bulunmuyor. Sahalar web panelinden eklenir."
        />
      ) : (
        <FlatList
          data={venuesQuery.data?.items ?? []}
          keyExtractor={(item) => item.public_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setWeekStart(undefined);
                setSelectedVenue(item);
              }}
              style={({ pressed }) => [styles.card, styles.venueRow, pressed && styles.pressed]}
            >
              <View style={styles.venueIcon}>
                <Ionicons name="location-outline" size={20} color={colors.turf} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {[item.city, item.location].filter(Boolean).join(" · ") || "Konum belirtilmemiş"}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.open_label} – {item.close_label} · {item.slot_minutes} dk dilim
                </Text>
              </View>
              {item.status === "passive" ? (
                <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
                  <Text style={[styles.tagText, { color: colors.muted }]}>Pasif</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          )}
        />
      )}

      {/* Onay / ret penceresi: isteğe bağlı yönetici notu */}
      <Modal
        visible={review !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReview(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setReview(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {review ? (
              <>
                <Text style={styles.sheetTitle}>
                  {review.decision === "approve" ? "Talebi onayla" : "Talebi reddet"}
                </Text>
                <Text style={styles.sheetMeta}>
                  {review.request.team_name} · {review.request.venue_name}
                </Text>
                <TextInput
                  value={adminNote}
                  onChangeText={setAdminNote}
                  placeholder="Yönetici notu (isteğe bağlı)…"
                  placeholderTextColor={colors.muted}
                  style={styles.noteInput}
                  multiline
                />
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => setReview(null)}
                    style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.cancelText}>Vazgeç</Text>
                  </Pressable>
                  <Pressable
                    disabled={reviewMutation.isPending}
                    onPress={() =>
                      reviewMutation.mutate({
                        publicId: review.request.public_id,
                        decision: review.decision,
                        adminNote: adminNote.trim() || undefined,
                      })
                    }
                    style={({ pressed }) => [
                      styles.btn,
                      review.decision === "approve" ? styles.approveBtn : styles.rejectBtn,
                      (pressed || reviewMutation.isPending) && styles.pressed,
                    ]}
                  >
                    <Text style={review.decision === "approve" ? styles.approveText : styles.rejectText}>
                      {reviewMutation.isPending
                        ? "Gönderiliyor…"
                        : review.decision === "approve"
                          ? "Onayla"
                          : "Reddet"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  flex: {
    flex: 1,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  tabBtnActive: {
    backgroundColor: colors.turf,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.surface,
    fontWeight: "800",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.surface,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: colors.line,
  },
  cardMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },
  cardNote: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.line,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
  slotChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  slotChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  slotChipApproved: {
    borderColor: colors.green,
    backgroundColor: colors.green + "14",
  },
  slotChipRejected: {
    opacity: 0.55,
  },
  slotChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.line,
  },
  adminNoteText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
  },
  approveBtn: {
    backgroundColor: colors.green,
  },
  approveText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  rejectBtn: {
    backgroundColor: colors.red + "1F",
  },
  rejectText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.red,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceRaised,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.line,
  },
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "800",
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  venueIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  boardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  boardTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  boardMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 1,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  weekBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  weekBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.line,
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.line,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1.5,
    marginLeft: spacing.xs,
  },
  legendText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
  },
  boardList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dayTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.line,
  },
  todayTag: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  todayText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.turf,
  },
  slotWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
  },
  slotCell: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.green,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slotBooked: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  slotAwaiting: {
    backgroundColor: colors.yellow + "33",
    borderColor: colors.yellow,
  },
  slotClosed: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.faint,
  },
  slotDisabled: {
    opacity: 0.35,
  },
  slotCellText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.green,
  },
  pendingBadge: {
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  pendingText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  sheetMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  noteInput: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.sm,
    padding: spacing.sm,
    ...type.small,
    color: colors.line,
    textAlignVertical: "top",
  },
  pressed: {
    opacity: 0.6,
  },
});
