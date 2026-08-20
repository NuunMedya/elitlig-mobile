/**
 * SAHA YÖNETİMİ — iki segment, tek ekran.
 *
 *   TALEPLER : takımların maç alma talepleri. Not yazarak onaylanır/reddedilir;
 *              talebin istediği saatler kendi durum renkleriyle görünür.
 *   SAHALAR  : saha listesi → seçilen sahanın HAFTALIK SLOT PANOSU. Gün satırı,
 *              saat çipleri, hafta gezinmesi.
 *
 * NEDEN PANO GÜN SATIRI + SAAT ÇİPİ: web panelindeki 7×N'lik ızgara telefonda
 * ya okunmaz kadar küçülüyor ya da yatay kaydırma gerektiriyor. Gün satırı
 * (dikey) + saat çipi (sarmalayan yatay) aynı bilgiyi tek eksende, başparmakla
 * dokunulabilir boyutta verir.
 *
 * RENK YALNIZ DURUM TAŞIR: açık (yeşil) · kapalı (nötr) · rakip bekleniyor
 * (uyarı) · maç alındı (marka). Eşleme `toneColors` sözlüğünden gelir, ekran
 * kendi renk tablosunu yazmaz. Renk tek başına anlam taşımasın diye panonun
 * üstünde açıklama şeridi ve çipin altında adet rozeti bulunur.
 *
 * GERİ ALINAMAYAN EYLEM ONAYLI: dolu bir saati boşaltmak fikstür maçını da
 * geri alır — Alert ile doğrulanır. Saati kapatma/açma tek dokunuşla yapılır
 * ama alt sayfadan geçer, yanlışlıkla tetiklenmez.
 *
 * VERİ MANTIĞI KORUNDU: talep listesi durum süzgeciyle sunucudan gelir; pano
 * `weekStart` ile sayfalanır ve sunucunun izin verdiği hafta aralığının dışına
 * çıkılmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  errorMessage,
  toneColors,
  useHeaderScroll,
  useRefresh,
  useToast,
  withAlpha,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
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
  type SlotStatus,
  type VenueGridDay,
} from "@/lib/api/admin";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER VE YARDIMCILAR ═══════════════════════ */

type VenueTab = "talepler" | "sahalar";

const TAB_ITEMS: SegmentedItem<VenueTab>[] = [
  { key: "talepler", label: "Talepler" },
  { key: "sahalar", label: "Sahalar" },
];

const REQUEST_FILTERS: RequestStatus[] = ["pending", "approved", "rejected", "cancelled"];

/** Talep durumu → ton. */
const REQUEST_TONE: Record<RequestStatus, Tone> = {
  pending: "warn",
  approved: "win",
  rejected: "danger",
  cancelled: "neutral",
};

/** Hücre durumu → ton. Panonun tüm rengi bu tablodan çıkar. */
const SLOT_TONE: Record<SlotStatus, Tone> = {
  open: "win",
  closed: "neutral",
  awaiting: "warn",
  booked: "brand",
};

/** Panonun üstündeki açıklama şeridi — sunucudaki durum adlarıyla birebir. */
const LEGEND: SlotStatus[] = ["open", "closed", "awaiting", "booked"];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTab(raw: string | string[] | undefined): VenueTab {
  return firstParam(raw) === "sahalar" ? "sahalar" : "talepler";
}

function resolveRequestStatus(raw: unknown): RequestStatus | null {
  const key = typeof raw === "string" ? raw.trim() : "";
  return (REQUEST_FILTERS as string[]).includes(key) ? (key as RequestStatus) : null;
}

/** "2026-08-17" + gün → ISO tarih (hafta gezinmesi için). */
const addDaysISO = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const cellKey = (cell: { date: string; hour: number; minute: number }) =>
  `${cell.date}-${cell.hour}-${cell.minute}`;

/* ══════════════════════════════════ EKRAN ═════════════════════════════════ */

export default function AdminVenuesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string | string[]; durum?: string | string[] }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  /** Segment ve talep süzgeci ROTADA taşınır. */
  const tab = resolveTab(params.tab);
  const requestFilter = resolveRequestStatus(firstParam(params.durum));

  const canQuery = Boolean(auth.user) && auth.isManagement;

  /* ─────────────────────────── TALEPLER ─────────────────────────── */

  const [review, setReview] = useState<{
    request: AdminMatchRequest;
    decision: "approve" | "reject";
  } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["admin", "match-requests", "list", requestFilter],
    queryFn: () => getAdminRequests({ status: requestFilter ?? "all" }),
    enabled: canQuery && tab === "talepler",
    staleTime: 10_000,
    retry: false,
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { publicId: string; decision: "approve" | "reject"; adminNote?: string }) =>
      reviewMatchRequest(input.publicId, { decision: input.decision, adminNote: input.adminNote }),
    onSuccess: (result) => {
      setReview(null);
      setAdminNote("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "match-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "venue-board"] });
      toast.show({ message: result.message, tone: "success" });
    },
    // Hata alt sayfa AÇIKKEN düşer; Toast yerel Modal'ın altında kalacağı için
    // sebep Alert ile söylenir. Başarıda sayfa kapandığından Toast görünür.
    onError: (error) => Alert.alert("İşlem yapılamadı", errorMessage(error)),
  });

  const openReview = useCallback((request: AdminMatchRequest, decision: "approve" | "reject") => {
    setAdminNote("");
    setReview({ request, decision });
  }, []);

  const closeReview = useCallback(() => setReview(null), []);

  /* ──────────────────────────── SAHALAR ──────────────────────────── */

  const [venue, setVenue] = useState<AdminVenue | null>(null);
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const [cell, setCell] = useState<AdminBoardCell | null>(null);
  const [slotNote, setSlotNote] = useState("");

  const venuesQuery = useQuery({
    queryKey: ["admin", "venues"],
    queryFn: getAdminVenues,
    enabled: canQuery && tab === "sahalar",
    staleTime: 30_000,
    retry: false,
  });

  const boardQuery = useQuery({
    queryKey: ["admin", "venue-board", venue?.public_id ?? null, weekStart ?? null],
    // Tür daraltması sorgu içinde yapılır; `enabled` zaten sahasız çalıştırmaz.
    queryFn: () => {
      if (!venue) throw new Error("Saha seçilmedi.");
      return getAdminBoard(venue.public_id, weekStart);
    },
    enabled: canQuery && tab === "sahalar" && Boolean(venue),
    staleTime: 10_000,
    retry: false,
  });

  const board = boardQuery.data;

  const refreshBoard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "venue-board"] });
  }, [queryClient]);

  const slotMutation = useMutation({
    mutationFn: (input: {
      publicId: string;
      date: string;
      hour: number;
      minute: number;
      status: "open" | "closed";
      note?: string;
    }) => setSlotStatus(input.publicId, input),
    onSuccess: (result) => {
      setCell(null);
      setSlotNote("");
      refreshBoard();
      toast.show({ message: result.message, tone: "success" });
    },
    // Hata alt sayfa AÇIKKEN düşer; Toast yerel Modal'ın altında kalacağı için
    // sebep Alert ile söylenir. Başarıda sayfa kapandığından Toast görünür.
    onError: (error) => Alert.alert("İşlem yapılamadı", errorMessage(error)),
  });

  const releaseMutation = useMutation({
    mutationFn: (input: { publicId: string; date: string; hour: number; minute: number }) =>
      releaseSlot(input.publicId, { date: input.date, hour: input.hour, minute: input.minute }),
    onSuccess: (result) => {
      setCell(null);
      refreshBoard();
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      toast.show({ message: result.message, tone: "success" });
    },
    // Hata alt sayfa AÇIKKEN düşer; Toast yerel Modal'ın altında kalacağı için
    // sebep Alert ile söylenir. Başarıda sayfa kapandığından Toast görünür.
    onError: (error) => Alert.alert("İşlem yapılamadı", errorMessage(error)),
  });

  /** Hücreler gün gün gruplanır: dikey gün listesi, yatay saat çipleri. */
  const days = useMemo(() => {
    if (!board) return [];
    const map = new Map<string, AdminBoardCell[]>();
    board.cells.forEach((item) => {
      const group = map.get(item.date);
      if (group) group.push(item);
      else map.set(item.date, [item]);
    });
    return board.venue.grid.days.map((day) => ({ day, cells: map.get(day.date) ?? [] }));
  }, [board]);

  /* Hafta gezinmesi: sunucunun izin verdiği hafta aralığında kal. */
  const currentWeek = board?.week_start;
  const weekOptions = useMemo(() => board?.weeks ?? [], [board]);
  const canPrev = Boolean(currentWeek && weekOptions.length && currentWeek > weekOptions[0].start);
  const canNext = Boolean(
    currentWeek && weekOptions.length && currentWeek < weekOptions[weekOptions.length - 1].start,
  );
  const weekLabel = currentWeek
    ? (weekOptions.find((week) => week.start === currentWeek)?.label ?? currentWeek)
    : "…";

  const goPrevWeek = useCallback(() => {
    if (currentWeek) setWeekStart(addDaysISO(currentWeek, -7));
  }, [currentWeek]);

  const goNextWeek = useCallback(() => {
    if (currentWeek) setWeekStart(addDaysISO(currentWeek, 7));
  }, [currentWeek]);

  // Saha listesi ile pano ayrı listelerdir; geçişte başlık yeniden açılsın.
  const openVenue = useCallback(
    (item: AdminVenue) => {
      scrollY.setValue(0);
      setWeekStart(undefined);
      setVenue(item);
    },
    [scrollY],
  );

  const closeVenue = useCallback(() => {
    scrollY.setValue(0);
    setVenue(null);
    setWeekStart(undefined);
  }, [scrollY]);

  const openCell = useCallback((item: AdminBoardCell) => {
    setSlotNote(item.note ?? "");
    setCell(item);
  }, []);

  const closeCell = useCallback(() => setCell(null), []);

  const applySlotStatus = useCallback(
    (next: "open" | "closed") => {
      if (!venue || !cell) return;
      slotMutation.mutate({
        publicId: venue.public_id,
        date: cell.date,
        hour: cell.hour,
        minute: cell.minute,
        status: next,
        note: slotNote.trim() || undefined,
      });
    },
    [cell, slotMutation, slotNote, venue],
  );

  const confirmRelease = useCallback(() => {
    if (!venue || !cell) return;
    const teams = [cell.home?.team_name, cell.away?.team_name].filter(Boolean).join(" – ");
    Alert.alert(
      "Saati boşalt",
      `${formatDateShort(cell.date)} ${cell.label}${teams ? `\n${teams}` : ""}\n\nSaat tamamen boşaltılacak; bu saate açılmış fikstür maçı da geri alınır.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Boşalt",
          style: "destructive",
          onPress: () =>
            releaseMutation.mutate({
              publicId: venue.public_id,
              date: cell.date,
              hour: cell.hour,
              minute: cell.minute,
            }),
        },
      ],
    );
  }, [cell, releaseMutation, venue]);

  /* ──────────────────────────── GEZİNME ──────────────────────────── */

  const changeTab = useCallback(
    (next: VenueTab) => {
      scrollY.setValue(0);
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  const selectRequestFilter = useCallback(
    (next: RequestStatus | null) => {
      router.setParams({ durum: next ?? "" });
    },
    [router],
  );

  /** Hücredeki bekleyen talepleri Talepler segmentinde incelemeye geç. */
  const goToPendingRequests = useCallback(() => {
    setCell(null);
    router.setParams({ tab: "talepler", durum: "pending" });
  }, [router]);

  const requestRefresh = useRefresh(requestsQuery.refetch, {
    refreshing: requestsQuery.isRefetching,
  });
  const venueRefresh = useRefresh(venuesQuery.refetch, { refreshing: venuesQuery.isRefetching });
  const boardRefresh = useRefresh(boardQuery.refetch, { refreshing: boardQuery.isRefetching });

  /* ───────────────────────────── ÇİZİM ───────────────────────────── */

  const renderRequest = useCallback(
    ({ item }: { item: AdminMatchRequest }) => (
      <RequestCard request={item} onReview={openReview} busy={reviewMutation.isPending} />
    ),
    [openReview, reviewMutation.isPending],
  );

  const renderVenue = useCallback(
    ({ item, index }: { item: AdminVenue; index: number }) => {
      const total = venuesQuery.data?.items.length ?? 0;
      const position =
        total <= 1 ? "single" : index === 0 ? "first" : index === total - 1 ? "last" : "middle";
      return <VenueRow venue={item} position={position} onPress={openVenue} />;
    },
    [openVenue, venuesQuery.data?.items.length],
  );

  const renderDay = useCallback(
    ({ item }: { item: { day: VenueGridDay; cells: AdminBoardCell[] } }) => (
      <DayRow day={item.day} cells={item.cells} onPressCell={openCell} />
    ),
    [openCell],
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }
  if (!auth.isManagement) {
    return <Redirect href="/yonetim" />;
  }

  const requests = requestsQuery.data?.items ?? [];
  const venues = venuesQuery.data?.items ?? [];
  const pendingCount = requests.filter((item) => item.status === "pending").length;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Saha Yönetimi"
        subtitle={venue && tab === "sahalar" ? venue.name : "Maç talepleri ve saha programı"}
        back
        scrollY={scrollY}
        bottom={
          <View style={styles.controls}>
            <View style={styles.segmentWrap}>
              <SegmentedControl<VenueTab> items={TAB_ITEMS} value={tab} onChange={changeTab} />
            </View>

            {tab === "talepler" ? (
              <ChipGroup>
                <Chip
                  label="Tümü"
                  selected={requestFilter === null}
                  onPress={() => selectRequestFilter(null)}
                />
                {REQUEST_FILTERS.map((item) => (
                  <Chip
                    key={item}
                    label={REQUEST_STATUS_LABELS[item]}
                    tone={REQUEST_TONE[item]}
                    count={item === "pending" && pendingCount > 0 ? pendingCount : undefined}
                    selected={requestFilter === item}
                    onPress={() => selectRequestFilter(requestFilter === item ? null : item)}
                  />
                ))}
              </ChipGroup>
            ) : null}
          </View>
        }
      />

      {/* ───────────────────────── TALEPLER ───────────────────────── */}
      {tab === "talepler" ? (
        requestsQuery.isLoading ? (
          <View style={styles.skeleton}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
        ) : requestsQuery.isError && requests.length === 0 ? (
          <ErrorState error={requestsQuery.error} onRetry={requestsQuery.refetch} />
        ) : (
          <FlatList
            {...scrollProps}
            data={requests}
            keyExtractor={requestKey}
            renderItem={renderRequest}
            contentContainerStyle={styles.list}
            refreshControl={requestRefresh.control}
            initialNumToRender={8}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                icon="calendar-outline"
                title="Talep yok"
                body="Bu durumda maç alma talebi bulunmuyor."
                action={
                  requestFilter
                    ? { label: "Tümünü göster", onPress: () => selectRequestFilter(null) }
                    : undefined
                }
              />
            }
          />
        )
      ) : /* ───────────────────────── SAHALAR ───────────────────────── */
      venue ? (
        <View style={styles.flex}>
          {/* Saha başlığı + hafta gezinmesi */}
          <View style={styles.boardHead}>
            <Touchable
              feedback="icon"
              haptic="light"
              onPress={closeVenue}
              accessibilityRole="button"
              accessibilityLabel="Saha listesine dön"
              style={styles.boardBack}
            >
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
              <Text style={styles.boardBackText} {...textScale.dense}>
                Sahalar
              </Text>
            </Touchable>
            <Text style={styles.boardMeta} numberOfLines={1} {...textScale.dense}>
              {venue.open_label} – {venue.close_label} · {venue.slot_minutes} dk
            </Text>
          </View>

          <View style={styles.weekNav}>
            <Touchable
              feedback="icon"
              haptic="selection"
              onPress={goPrevWeek}
              disabled={!canPrev}
              accessibilityRole="button"
              accessibilityLabel="Önceki hafta"
              accessibilityState={{ disabled: !canPrev }}
              style={[styles.weekButton, canPrev ? null : styles.weekButtonDisabled]}
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={canPrev ? colors.textPrimary : colors.textDisabled}
              />
            </Touchable>

            <Text style={styles.weekLabel} numberOfLines={1} {...textScale.dense}>
              {weekLabel}
            </Text>

            <Touchable
              feedback="icon"
              haptic="selection"
              onPress={goNextWeek}
              disabled={!canNext}
              accessibilityRole="button"
              accessibilityLabel="Sonraki hafta"
              accessibilityState={{ disabled: !canNext }}
              style={[styles.weekButton, canNext ? null : styles.weekButtonDisabled]}
            >
              <Ionicons
                name="chevron-forward"
                size={16}
                color={canNext ? colors.textPrimary : colors.textDisabled}
              />
            </Touchable>
          </View>

          {/* Renk açıklaması — renk tek başına anlam taşımasın diye. */}
          <View style={styles.legend}>
            {LEGEND.map((item) => {
              const tone = toneColors(SLOT_TONE[item]);
              return (
                <View key={item} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: tone.dim, borderColor: withAlpha(tone.fg, 0.6) },
                    ]}
                  />
                  <Text style={styles.legendText} {...textScale.badge}>
                    {SLOT_STATUS_LABELS[item]}
                  </Text>
                </View>
              );
            })}
          </View>

          {boardQuery.isLoading ? (
            <View style={styles.skeleton}>
              <SkeletonCard lines={4} />
              <SkeletonCard lines={4} />
            </View>
          ) : boardQuery.isError && !board ? (
            <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
          ) : (
            <FlatList
              {...scrollProps}
              data={days}
              keyExtractor={dayKey}
              renderItem={renderDay}
              contentContainerStyle={styles.list}
              refreshControl={boardRefresh.control}
              initialNumToRender={7}
              ListEmptyComponent={
                <EmptyState
                  icon="calendar-outline"
                  title="Program yok"
                  body="Bu hafta için sahada açık gün bulunmuyor."
                />
              }
            />
          )}
        </View>
      ) : venuesQuery.isLoading ? (
        <View style={styles.skeleton}>
          <SkeletonListRow count={5} />
        </View>
      ) : venuesQuery.isError && venues.length === 0 ? (
        <ErrorState error={venuesQuery.error} onRetry={venuesQuery.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={venues}
          keyExtractor={venueKey}
          renderItem={renderVenue}
          contentContainerStyle={styles.list}
          refreshControl={venueRefresh.control}
          initialNumToRender={10}
          ListEmptyComponent={
            <EmptyState
              icon="location-outline"
              title="Saha yok"
              body="Henüz tanımlı bir saha bulunmuyor. Sahalar web panelinden eklenir."
            />
          }
        />
      )}

      {/* Onay / ret alt sayfası */}
      <BottomSheet
        visible={review !== null}
        onClose={closeReview}
        title={review?.decision === "approve" ? "Talebi onayla" : "Talebi reddet"}
        snap="content"
      >
        {review ? (
          <View style={styles.sheet}>
            <Text style={styles.sheetMeta} {...textScale.dense}>
              {review.request.team_name} · {review.request.venue_name}
            </Text>
            <View style={styles.slotWrap}>
              {review.request.slots.map((slot) => (
                <View key={cellKey(slot)} style={styles.slotStatic}>
                  <Text style={styles.slotStaticText} {...textScale.badge}>
                    {formatDateShort(slot.date)} {slot.label}
                  </Text>
                </View>
              ))}
            </View>

            <Input
              label="Yönetici notu (isteğe bağlı)"
              value={adminNote}
              onChangeText={setAdminNote}
              placeholder={
                review.decision === "approve"
                  ? "Takıma iletilecek not…"
                  : "Ret gerekçesi takıma iletilir…"
              }
              multiline
            />

            <Text style={styles.sheetNote} {...textScale.long}>
              {review.decision === "approve"
                ? "Onayladığınızda talep edilen saatler bu takıma yazılır ve saha panosunda görünür."
                : "Reddedilen talep takımın panelinde gerekçesiyle birlikte görünür."}
            </Text>

            <View style={styles.sheetActions}>
              <Button
                label="Vazgeç"
                variant="ghost"
                onPress={closeReview}
                style={styles.sheetButton}
              />
              <Button
                label={review.decision === "approve" ? "Onayla" : "Reddet"}
                variant={review.decision === "approve" ? "primary" : "danger"}
                icon={review.decision === "approve" ? "checkmark" : "close"}
                loading={reviewMutation.isPending}
                haptic="medium"
                onPress={() =>
                  reviewMutation.mutate({
                    publicId: review.request.public_id,
                    decision: review.decision,
                    adminNote: adminNote.trim() || undefined,
                  })
                }
                style={styles.sheetButton}
              />
            </View>
          </View>
        ) : null}
      </BottomSheet>

      {/* Hücre alt sayfası: saat detayı ve eylemleri */}
      <BottomSheet
        visible={cell !== null}
        onClose={closeCell}
        title={cell ? `${formatDateShort(cell.date)} · ${cell.label}` : undefined}
        snap="content"
      >
        {cell ? (
          <View style={styles.sheet}>
            <View style={styles.sheetMetaRow}>
              <Badge
                label={SLOT_STATUS_LABELS[cell.status] ?? cell.status}
                tone={SLOT_TONE[cell.status]}
                size="xs"
              />
              {cell.is_past ? <Badge label="Geçmiş" tone="neutral" size="xs" /> : null}
              {venue ? (
                <Text style={styles.sheetMeta} numberOfLines={1} {...textScale.dense}>
                  {venue.name}
                </Text>
              ) : null}
            </View>

            {cell.home || cell.away ? (
              <View style={styles.teamsRow}>
                <SlotTeam name={cell.home?.team_name} logo={cell.home?.team_logo} />
                <Text style={styles.teamsDash} {...textScale.dense}>
                  –
                </Text>
                <SlotTeam name={cell.away?.team_name} logo={cell.away?.team_logo} />
              </View>
            ) : null}

            {cell.requests.length > 0 ? (
              <View style={styles.pendingBox}>
                <Text style={styles.sheetLabel} {...textScale.dense}>
                  BEKLEYEN TALEPLER
                </Text>
                {cell.requests.map((item) => (
                  <View key={item.public_id} style={styles.pendingRow}>
                    <TeamLogo name={item.team_name} logo={mediaUrl(item.team_logo)} size={20} />
                    <Text style={styles.pendingName} numberOfLines={1} {...textScale.dense}>
                      {item.team_name}
                    </Text>
                    <Badge
                      label={REQUEST_STATUS_LABELS[item.status] ?? item.status}
                      tone={REQUEST_TONE[item.status] ?? "neutral"}
                      size="xs"
                    />
                  </View>
                ))}
                <Button
                  label="Talepleri incele"
                  variant="secondary"
                  size="sm"
                  icon="open-outline"
                  onPress={goToPendingRequests}
                  fullWidth
                />
              </View>
            ) : null}

            {cell.status === "open" || cell.status === "closed" ? (
              <>
                <Input
                  label="Saat notu (isteğe bağlı)"
                  value={slotNote}
                  onChangeText={setSlotNote}
                  placeholder="Bakım, turnuva, özel kullanım…"
                  size="sm"
                />
                <Button
                  label={cell.status === "open" ? "Saati talebe kapat" : "Saati talebe aç"}
                  variant={cell.status === "open" ? "danger" : "primary"}
                  icon={cell.status === "open" ? "lock-closed-outline" : "lock-open-outline"}
                  loading={slotMutation.isPending}
                  disabled={cell.is_past}
                  haptic="medium"
                  onPress={() => applySlotStatus(cell.status === "open" ? "closed" : "open")}
                  fullWidth
                />
              </>
            ) : (
              <Button
                label="Saati boşalt"
                variant="danger"
                icon="trash-outline"
                loading={releaseMutation.isPending}
                haptic="medium"
                onPress={confirmRelease}
                fullWidth
              />
            )}

            {cell.is_past ? (
              <Text style={styles.sheetNote} {...textScale.long}>
                Geçmiş saatler talebe kapatılamaz; yalnızca içeriği görüntülenir.
              </Text>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const requestKey = (item: AdminMatchRequest) => item.public_id;
const venueKey = (item: AdminVenue) => item.public_id;
const dayKey = (item: { day: VenueGridDay }) => item.day.date;

/* ═══════════════════════════════ ALT PARÇALAR ══════════════════════════════ */

/** Talep kartı — takım, saha, istenen saatler, notlar ve karar düğmeleri. */
const RequestCard = memo(function RequestCard({
  request,
  onReview,
  busy,
}: {
  request: AdminMatchRequest;
  onReview: (request: AdminMatchRequest, decision: "approve" | "reject") => void;
  busy: boolean;
}) {
  const approve = useCallback(() => onReview(request, "approve"), [onReview, request]);
  const reject = useCallback(() => onReview(request, "reject"), [onReview, request]);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <TeamLogo name={request.team_name} logo={mediaUrl(request.team_logo)} size={28} />
        <View style={styles.cardTitles}>
          <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
            {request.team_name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
            {request.venue_name} · {formatDateShort(request.created_at)}
          </Text>
        </View>
        <Badge
          label={REQUEST_STATUS_LABELS[request.status] ?? request.status}
          tone={REQUEST_TONE[request.status] ?? "neutral"}
          size="xs"
        />
      </View>

      {request.note ? (
        <Text style={styles.cardNote} numberOfLines={3} {...textScale.long}>
          “{request.note}”
        </Text>
      ) : null}

      {/* İstenen saatler — her saatin kendi kararı olabilir. */}
      <View style={styles.slotWrap}>
        {request.slots.map((slot) => {
          const tone = toneColors(
            slot.status === "approved" ? "win" : slot.status === "rejected" ? "danger" : "neutral",
          );
          return (
            <View
              key={cellKey(slot)}
              style={[
                styles.slotStatic,
                { backgroundColor: tone.dim, borderColor: withAlpha(tone.fg, 0.4) },
              ]}
            >
              <Text style={[styles.slotStaticText, { color: tone.fg }]} {...textScale.badge}>
                {formatDateShort(slot.date)} {slot.label}
              </Text>
            </View>
          );
        })}
      </View>

      {request.admin_note ? (
        <Text style={styles.cardAdminNote} {...textScale.long}>
          Yönetici notu: {request.admin_note}
        </Text>
      ) : null}

      {request.status === "pending" ? (
        <View style={styles.cardActions}>
          <Button
            label="Reddet"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={reject}
            style={styles.cardButton}
          />
          <Button
            label="Onayla"
            size="sm"
            icon="checkmark"
            disabled={busy}
            onPress={approve}
            style={styles.cardButton}
          />
        </View>
      ) : null}
    </View>
  );
});

/** Saha listesi satırı. */
const VenueRow = memo(function VenueRow({
  venue,
  position,
  onPress,
}: {
  venue: AdminVenue;
  position: "single" | "first" | "middle" | "last";
  onPress: (venue: AdminVenue) => void;
}) {
  const handlePress = useCallback(() => onPress(venue), [onPress, venue]);
  const leading = useMemo(() => ({ icon: "location" as const }), []);

  return (
    <ListRow
      leading={leading}
      title={venue.name}
      subtitle={[venue.city, venue.location].filter(Boolean).join(" · ") || "Konum belirtilmemiş"}
      value={`${venue.open_label}–${venue.close_label}`}
      badge={
        venue.status === "passive" ? <Badge label="Pasif" tone="neutral" size="xs" /> : undefined
      }
      position={position}
      onPress={handlePress}
    />
  );
});

/** Pano gün satırı — başlık + sarmalayan saat çipleri. */
const DayRow = memo(function DayRow({
  day,
  cells,
  onPressCell,
}: {
  day: VenueGridDay;
  cells: AdminBoardCell[];
  onPressCell: (cell: AdminBoardCell) => void;
}) {
  return (
    <View style={styles.dayCard}>
      <View style={styles.dayHead}>
        <Text style={styles.dayTitle} numberOfLines={1} {...textScale.dense}>
          {day.label}
        </Text>
        <Text style={styles.dayDate} numberOfLines={1} {...textScale.dense}>
          {day.date_label}
        </Text>
        {day.is_today ? <Badge label="Bugün" tone="brand" size="xs" /> : null}
      </View>

      {cells.length === 0 ? (
        <Text style={styles.dayEmpty} {...textScale.dense}>
          Bu gün sahada dilim yok.
        </Text>
      ) : (
        <View style={styles.slotWrap}>
          {cells.map((item) => (
            <SlotCell key={cellKey(item)} cell={item} onPress={onPressCell} />
          ))}
        </View>
      )}
    </View>
  );
});

/** Tek saat çipi. Renk durumdan, adet rozeti bekleyen talepten gelir. */
const SlotCell = memo(function SlotCell({
  cell,
  onPress,
}: {
  cell: AdminBoardCell;
  onPress: (cell: AdminBoardCell) => void;
}) {
  const handlePress = useCallback(() => onPress(cell), [cell, onPress]);
  const tone = toneColors(SLOT_TONE[cell.status]);
  const muted = cell.is_past || !cell.is_bookable;

  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${cell.label}, ${SLOT_STATUS_LABELS[cell.status] ?? cell.status}${
        cell.pending_count > 0 ? `, ${cell.pending_count} bekleyen talep` : ""
      }`}
      style={[
        styles.slotCell,
        { backgroundColor: tone.dim, borderColor: withAlpha(tone.fg, 0.45) },
        muted ? styles.slotCellMuted : null,
      ]}
    >
      <Text
        style={[styles.slotCellText, { color: muted ? colors.textDisabled : tone.fg }]}
        {...textScale.badge}
      >
        {cell.label}
      </Text>
      {cell.pending_count > 0 ? (
        <Badge label={cell.pending_count} tone="warn" variant="solid" size="xs" />
      ) : null}
    </Touchable>
  );
});

/** Hücre alt sayfasındaki takım kutusu. */
const SlotTeam = memo(function SlotTeam({
  name,
  logo,
}: {
  name?: string | null;
  logo?: string | null;
}) {
  return (
    <View style={styles.slotTeam}>
      <TeamLogo name={name ?? "?"} logo={mediaUrl(logo)} size={28} />
      <Text style={styles.slotTeamName} numberOfLines={1} {...textScale.dense}>
        {name || "Rakip bekleniyor"}
      </Text>
    </View>
  );
});

/* ═════════════════════════════════ STİLLER ═════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  controls: {
    gap: space.sm,
    paddingBottom: space.sm,
  },
  segmentWrap: {
    paddingHorizontal: layout.screenPadding,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    gap: space.sm,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.giant,
    gap: space.sm,
    flexGrow: 1,
  },

  /* Talep kartı */
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  cardTitles: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  cardMeta: {
    ...type.caption,
    color: colors.textSecondary,
  },
  cardNote: {
    ...type.bodySm,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  cardAdminNote: {
    ...type.caption,
    color: colors.textTertiary,
  },
  cardActions: {
    flexDirection: "row",
    gap: space.sm,
  },
  cardButton: {
    flex: 1,
  },

  /* Saat çipleri */
  slotWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  slotStatic: {
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  slotStaticText: {
    ...type.micro,
    color: colors.textSecondary,
  },
  slotCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minWidth: 62,
    height: 34,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.sm,
  },
  slotCellMuted: {
    opacity: 0.45,
  },
  slotCellText: {
    ...type.caption,
  },

  /* Pano */
  boardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  boardBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  boardBackText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  boardMeta: {
    ...type.caption,
    color: colors.textTertiary,
    marginLeft: "auto",
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: layout.screenPadding,
    padding: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  weekButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
  },
  weekButtonDisabled: {
    opacity: 0.4,
  },
  weekLabel: {
    ...type.label,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radius.xs,
    borderWidth: hairline,
  },
  legendText: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* Gün kartı */
  dayCard: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  dayTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  dayDate: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  dayEmpty: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* Alt sayfalar */
  sheet: {
    gap: space.md,
    paddingBottom: space.sm,
  },
  sheetMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  sheetMeta: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  sheetLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  sheetNote: {
    ...type.caption,
    color: colors.textTertiary,
  },
  sheetActions: {
    flexDirection: "row",
    gap: space.sm,
  },
  sheetButton: {
    flex: 1,
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  teamsDash: {
    ...type.label,
    color: colors.textTertiary,
  },
  slotTeam: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
  },
  slotTeamName: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
  },
  pendingBox: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  pendingName: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
});
