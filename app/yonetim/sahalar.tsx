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
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
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
  IconTile,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  toneColors,
  useHeaderScroll,
  useRefresh,
  useToast,
  withAlpha,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
import { FormSheet, SelectField, confirmAction, type FieldDef, type FormValues, type Option } from "@/components/admin";
import { InfoPill, StatusTiles, toneColor, upperTR } from "@/components/admin/matches/opsKit";
import { LinearGradient } from "expo-linear-gradient";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { getTeamsForCity } from "@/lib/api/admin/matches";
import { ApiError } from "@/lib/http";
import { useScope } from "@/providers/ScopeProvider";
import {
  createVenue,
  deleteVenue,
  getAdminBoard,
  getAdminRequests,
  getAdminVenues,
  releaseSlot,
  REQUEST_STATUS_LABELS,
  reviewMatchRequest,
  setSlotStatus,
  setSlotTeams,
  updateVenue,
  SLOT_STATUS_LABELS,
  type AdminBoardCell,
  type AdminMatchRequest,
  type AdminVenue,
  type RequestStatus,
  type SlotStatus,
  type VenueGridDay,
  type VenueInput,
} from "@/lib/api/admin";
import { formatDateShort, mediaUrl, timeAgo } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

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

const PERMS = ["venues.view", "venues.manage"];

const WEEKDAY_OPTIONS: Option<number>[] = [
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 7, label: "Pazar" },
];

const HHMM = /^([01]?\d|2[0-4]):([0-5]\d)$/;

/** Doğrulama hatasında sunucunun alan alan gerekçesi (fieldErrors) tek cümleye iner. */
function venueErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = (error.detail as { fieldErrors?: Record<string, string> } | null)?.fieldErrors;
    const lines = fields ? Object.values(fields).filter(Boolean) : [];
    if (lines.length) return lines.join(" ");
  }
  return errorText(error);
}

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

  const scope = useScope();
  const allowed = auth.isManagement && hasAnyPermission(auth.user, PERMS);
  /** Yazma eylemleri (onay, saat, saha) sunucuda venues.manage ister. */
  const canManage = hasAnyPermission(auth.user, ["venues.manage"]);
  const canQuery = Boolean(auth.user) && allowed;

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
    onError: (error) => Alert.alert("İşlem yapılamadı", errorText(error)),
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
    onError: (error) => Alert.alert("İşlem yapılamadı", errorText(error)),
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
    onError: (error) => Alert.alert("İşlem yapılamadı", errorText(error)),
  });

  /* ── Saate takım yaz: tek takım = rakip bekliyor, iki takım = maç alındı ── */
  const [homeId, setHomeId] = useState<number | null>(null);
  const [awayId, setAwayId] = useState<number | null>(null);
  useEffect(() => {
    setHomeId(cell?.home?.team_id ?? null);
    setAwayId(cell?.away?.team_id ?? null);
  }, [cell]);

  const teamsQuery = useQuery({
    queryKey: ["admin", "matches", "teams", venue?.city || "all"],
    queryFn: () => getTeamsForCity(venue?.city || null),
    enabled: canQuery && canManage && cell !== null,
    staleTime: 5 * 60_000,
  });
  const teamOptions = useMemo<Option<number>[]>(
    () => (teamsQuery.data ?? []).map((t) => ({ value: Number(t.id), label: t.team_name, hint: t.current_league ?? null })),
    [teamsQuery.data],
  );

  const teamsMutation = useMutation({
    mutationFn: (input: { publicId: string; date: string; hour: number; minute: number; homeTeamId: number | null; awayTeamId: number | null }) =>
      setSlotTeams(input.publicId, {
        date: input.date,
        hour: input.hour,
        minute: input.minute,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        // Fikstür maçı seçili kapsamın lig ve sezonuna açılır; kapsam yoksa
        // hücredeki kayıtlı lig/sezon korunur (sunucu kuralı).
        ...(scope.ready ? { leagueId: scope.leagueId, seasonId: scope.seasonId } : {}),
      }),
    onSuccess: (result) => {
      setCell(null);
      refreshBoard();
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "match-requests"] });
      toast.show({ message: result.message, tone: result.fixture_pending ? "warn" : "success" });
    },
    onError: (error) => Alert.alert("Takımlar yazılamadı", errorText(error)),
  });

  const teamsDirty = cell !== null && (homeId !== (cell.home?.team_id ?? null) || awayId !== (cell.away?.team_id ?? null));
  const sameTeams = Boolean(homeId && homeId === awayId);

  const saveTeams = useCallback(() => {
    if (!venue || !cell || sameTeams) return;
    teamsMutation.mutate({ publicId: venue.public_id, date: cell.date, hour: cell.hour, minute: cell.minute, homeTeamId: homeId, awayTeamId: awayId });
  }, [awayId, cell, homeId, sameTeams, teamsMutation, venue]);

  /* ── Saha ekle / düzenle / sil ── */
  const [venueForm, setVenueForm] = useState<{ venue: AdminVenue | null } | null>(null);

  const venueFields = useMemo<FieldDef[]>(
    () => [
      { key: "name", label: "Saha adı", kind: "text", required: true, maxLength: 160, icon: "location-outline" },
      {
        key: "city_id",
        label: "İl",
        kind: "select",
        required: true,
        options: scope.cities.map((c) => ({ value: c.id, label: c.label })),
        hint: "Saha yalnız bu ilin takımlarına görünür.",
      },
      { key: "location", label: "Adres / konum", kind: "text", maxLength: 255 },
      { key: "description", label: "Açıklama", kind: "multiline", maxLength: 500 },
      { key: "open_hour", label: "Açılış saati", kind: "text", required: true, placeholder: "18:00", hint: "SS:DD — dakika 00, 15, 30 ya da 45" },
      { key: "close_hour", label: "Kapanış saati", kind: "text", required: true, placeholder: "24:00" },
      {
        key: "slot_minutes",
        label: "Maç dilimi",
        kind: "segment",
        options: [
          { value: "60", label: "60 dk" },
          { value: "30", label: "30 dk" },
          { value: "15", label: "15 dk" },
        ],
      },
      { key: "active_days", label: "Açık günler", kind: "multiselect", options: WEEKDAY_OPTIONS, required: true },
      { key: "active", label: "Aktif", kind: "toggle", hint: "Pasif saha takımlara görünmez; programı korunur." },
    ],
    [scope.cities],
  );

  const venueInitial = useMemo<FormValues>(() => {
    const v = venueForm?.venue;
    return v
      ? {
          name: v.name,
          city_id: v.city_id,
          location: v.location,
          description: v.description,
          open_hour: v.open_label,
          close_hour: v.close_label,
          slot_minutes: String(v.slot_minutes || 60),
          active_days: v.active_days ?? [],
          active: v.status !== "passive",
        }
      : { city_id: scope.cityId, open_hour: "18:00", close_hour: "24:00", slot_minutes: "60", active_days: [1, 2, 3, 4, 5, 6, 7], active: true };
  }, [scope.cityId, venueForm]);

  const submitVenue = useCallback(
    async (values: FormValues) => {
      const open = String(values.open_hour ?? "").trim();
      const close = String(values.close_hour ?? "").trim();
      if (!HHMM.test(open) || !HHMM.test(close)) throw new Error("Açılış ve kapanış saatini SS:DD biçiminde yaz (ör. 18:00, 23:30).");
      const days = Array.isArray(values.active_days) ? (values.active_days as number[]).map(Number) : [];
      if (!days.length) throw new Error("Sahanın açık olduğu en az bir gün seç.");
      const body: VenueInput = {
        name: String(values.name ?? "").trim(),
        city_id: values.city_id ? Number(values.city_id) : null,
        location: String(values.location ?? "").trim(),
        description: String(values.description ?? "").trim(),
        open_hour: open,
        close_hour: close,
        slot_minutes: Number(values.slot_minutes) || 60,
        active_days: days,
        status: values.active === false ? "passive" : "active",
      };
      try {
        const editing = venueForm?.venue;
        const result = editing ? await updateVenue(editing.public_id, body) : await createVenue(body);
        if (editing && venue?.public_id === editing.public_id) setVenue(result.item);
        void queryClient.invalidateQueries({ queryKey: ["admin", "venues"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "venue-board"] });
        toast.show({ message: result.message, tone: "success" });
      } catch (error) {
        throw new Error(venueErrorText(error));
      }
    },
    [queryClient, toast, venue?.public_id, venueForm],
  );

  const removeVenueMutation = useMutation({
    mutationFn: (publicId: string) => deleteVenue(publicId),
    onSuccess: (result) => {
      setVenueForm(null);
      setVenue(null);
      setWeekStart(undefined);
      void queryClient.invalidateQueries({ queryKey: ["admin", "venues"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "match-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      toast.show({ message: result.message, tone: "success" });
    },
    onError: (error) => Alert.alert("Saha silinemedi", errorText(error)),
  });

  const askRemoveVenue = useCallback(async () => {
    const target = venueForm?.venue;
    if (!target) return;
    const ok = await confirmAction({
      title: "Sahayı sil",
      message: `${target.name}\n\nSaha, haftalık programı ve bu sahaya gelen talepler çöp kutusuna taşınır; bu sahadan açılmış fikstür maçları geri alınır.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) removeVenueMutation.mutate(target.public_id);
  }, [removeVenueMutation, venueForm]);

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
      <RequestCard request={item} onReview={openReview} busy={reviewMutation.isPending || !canManage} />
    ),
    [canManage, openReview, reviewMutation.isPending],
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

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }
  if (!auth.isManagement) {
    return <Redirect href="/yonetim" />;
  }
  if (!allowed) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Saha Yönetimi" back />
        <EmptyState
          icon="lock-closed-outline"
          title="Bu bölüme yetkin yok"
          body="Saha ve maç planlama için gereken yetki hesabında tanımlı değil. Yetki için yöneticinle görüş."
          action={{ label: "Yönetim paneline dön", onPress: () => router.replace("/yonetim") }}
        />
      </SafeAreaView>
    );
  }

  const headerActions =
    tab === "sahalar" && canManage
      ? venue
        ? [{ icon: "create-outline" as const, accessibilityLabel: "Sahayı düzenle", onPress: () => setVenueForm({ venue }) }]
        : [{ icon: "add-circle-outline" as const, accessibilityLabel: "Yeni saha", onPress: () => setVenueForm({ venue: null }) }]
      : undefined;

  const requests = requestsQuery.data?.items ?? [];
  const venues = venuesQuery.data?.items ?? [];
  const pendingCount = requests.filter((item) => item.status === "pending").length;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Saha Yönetimi"
        subtitle={venue && tab === "sahalar" ? venue.name : "Maç talepleri ve saha programı"}
        back
        actions={headerActions}
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
            ListHeaderComponent={
              requestFilter === null && requests.length > 0 ? (
                /* Özet: tüm talepler yüklüyken durum sayaçları (dokununca süzgeç). */
                <StatusTiles<RequestStatus>
                  items={(["pending", "approved", "rejected"] as RequestStatus[]).map((key) => ({
                    key,
                    label: REQUEST_STATUS_LABELS[key],
                    value: requests.filter((item) => item.status === key).length,
                    tone: REQUEST_TONE[key],
                    icon: key === "pending" ? "hourglass-outline" : key === "approved" ? "checkmark-circle-outline" : "close-circle-outline",
                  }))}
                  value={null}
                  onChange={(key) => selectRequestFilter(key)}
                  style={styles.summaryTiles}
                />
              ) : null
            }
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

          {boardQuery.isLoading ? (
            <View style={styles.skeleton}>
              <SkeletonCard lines={4} />
              <SkeletonCard lines={4} />
            </View>
          ) : boardQuery.isError && !board ? (
            <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
          ) : days.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Program yok" body="Bu hafta için sahada açık gün bulunmuyor." />
          ) : (
            <ScrollView
              {...scrollProps}
              contentContainerStyle={styles.boardScroll}
              refreshControl={boardRefresh.control}
            >
              {/* Haftanın özeti: durum sayaçları — renk tek başına anlam taşımasın diye etiketli. */}
              <StatusTiles<SlotStatus>
                items={LEGEND.map((key) => ({
                  key,
                  label: key === "awaiting" ? "Rakip" : key === "booked" ? "Dolu" : SLOT_STATUS_LABELS[key],
                  value: days.reduce((sum, d) => sum + d.cells.filter((c) => c.status === key).length, 0),
                  tone: SLOT_TONE[key],
                }))}
              />
              <WeekGrid days={days} onPressCell={openCell} />
              <View style={styles.legend}>
                {LEGEND.map((item) => {
                  const tone = toneColors(SLOT_TONE[item]);
                  return (
                    <View key={item} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: tone.dim, borderColor: withAlpha(tone.fg, 0.6) }]} />
                      <Text style={styles.legendText} {...textScale.badge}>
                        {SLOT_STATUS_LABELS[item]}
                      </Text>
                    </View>
                  );
                })}
                <View style={styles.legendItem}>
                  <View style={styles.legendPending} />
                  <Text style={styles.legendText} {...textScale.badge}>
                    Bekleyen talep
                  </Text>
                </View>
              </View>
            </ScrollView>
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
          contentContainerStyle={[styles.list, styles.listGrouped]}
          refreshControl={venueRefresh.control}
          initialNumToRender={10}
          ListHeaderComponent={
            venues.length ? (
              <StatusTiles
                items={[
                  { key: "active", label: "Aktif saha", value: venues.filter((v) => v.status !== "passive").length, tone: "win" as Tone, icon: "location-outline" as const },
                  { key: "passive", label: "Pasif", value: venues.filter((v) => v.status === "passive").length, tone: "neutral" as Tone, icon: "pause-circle-outline" as const },
                  { key: "days", label: "Açık gün", value: venues.reduce((sum, v) => sum + (v.status === "passive" ? 0 : v.active_days.length), 0), tone: "info" as Tone, icon: "calendar-outline" as const },
                ]}
                style={styles.summaryTilesGap}
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="location-outline"
              title="Saha yok"
              body={canManage ? "Henüz tanımlı bir saha yok. İlk sahayı ekleyip haftalık programını aç." : "Henüz tanımlı bir saha bulunmuyor."}
              action={canManage ? { label: "Saha ekle", onPress: () => setVenueForm({ venue: null }) } : undefined}
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

            {canManage && !cell.is_past && cell.status !== "closed" ? (
              <View style={styles.pendingBox}>
                <Text style={styles.sheetLabel} {...textScale.dense}>
                  TAKIM YAZ
                </Text>
                <SelectField<number>
                  label="Ev sahibi"
                  value={homeId}
                  valueLabel={cell.home?.team_id === homeId ? cell.home?.team_name ?? null : null}
                  options={teamOptions}
                  icon="shield-outline"
                  placeholder={teamsQuery.isLoading ? "Takımlar yükleniyor…" : "Takım seç"}
                  clearable
                  onChange={setHomeId}
                />
                <SelectField<number>
                  label="Deplasman"
                  value={awayId}
                  valueLabel={cell.away?.team_id === awayId ? cell.away?.team_name ?? null : null}
                  options={teamOptions}
                  icon="shield-outline"
                  placeholder="Rakip belli değilse boş bırak"
                  clearable
                  error={sameTeams ? "Bir takım kendisiyle eşleşemez." : undefined}
                  onChange={setAwayId}
                />
                <Text style={styles.sheetNote} {...textScale.long}>
                  {scope.ready
                    ? `İki takım yazılırsa maç ${[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")} fikstürüne eklenir. Tek takım "rakip bekliyor" olur.`
                    : "Lig ve sezon seçili değil: iki takım yazılırsa saat dolar ama maç fikstüre eklenmez. Önce kapsam seç."}
                </Text>
                <Button
                  label={homeId || awayId ? "Takımları kaydet" : "Takımları kaldır"}
                  icon="save-outline"
                  loading={teamsMutation.isPending}
                  disabled={!teamsDirty || sameTeams}
                  haptic="medium"
                  onPress={saveTeams}
                  fullWidth
                />
              </View>
            ) : null}

            {!canManage ? (
              <Text style={styles.sheetNote} {...textScale.long}>
                Saat programını değiştirmek için saha yönetimi yetkisi gerekir; yalnız görüntülüyorsun.
              </Text>
            ) : cell.status === "open" || cell.status === "closed" ? (
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

      <FormSheet
        visible={venueForm !== null}
        onClose={() => setVenueForm(null)}
        title={venueForm?.venue ? "Sahayı düzenle" : "Yeni saha"}
        intro="Açılış – kapanış saati ve maç dilimi haftalık saat programını üretir. Program daralırsa boş saatlerin kaydı silinir; takım yazılmış saatler korunur."
        fields={venueFields}
        initial={venueInitial}
        onSubmit={submitVenue}
        secondary={venueForm?.venue ? { label: "Sahayı sil", onPress: () => void askRemoveVenue(), danger: true } : undefined}
      />
    </SafeAreaView>
  );
}

const requestKey = (item: AdminMatchRequest) => item.public_id;
const venueKey = (item: AdminVenue) => item.public_id;

/* ═══════════════════════════════ ALT PARÇALAR ══════════════════════════════ */

/** Talep kartı — solda durum şeridi; takım kimliği, saha hapı, istenen saatler
    bilet gibi (gün üstte, saat Archivo), alıntı notu ve karar düğmeleri. */
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
  const tone = REQUEST_TONE[request.status] ?? "neutral";

  return (
    <View style={styles.card}>
      <View style={[styles.cardRail, { backgroundColor: toneColor(tone) }]} />
      <View style={styles.cardTop}>
        <TeamLogo name={request.team_name} logo={mediaUrl(request.team_logo)} size={40} />
        <View style={styles.cardTitles}>
          <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
            {request.team_name}
          </Text>
          <View style={styles.cardMetaRow}>
            <InfoPill icon="location-outline" label={request.venue_name} />
            <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
              {timeAgo(request.created_at) || formatDateShort(request.created_at)}
            </Text>
          </View>
        </View>
        <Badge label={REQUEST_STATUS_LABELS[request.status] ?? request.status} tone={tone} size="xs" />
      </View>

      {/* İstenen saatler — her saatin kendi kararı olabilir. */}
      <View style={styles.slotWrap}>
        {request.slots.map((slot) => {
          const t = toneColors(slot.status === "approved" ? "win" : slot.status === "rejected" ? "danger" : "brand");
          return (
            <View key={cellKey(slot)} style={[styles.ticket, { borderColor: withAlpha(t.fg, 0.45), backgroundColor: t.dim }]}>
              <Text style={[styles.ticketDay, { color: t.fg }]} {...textScale.badge}>
                {upperTR(formatDateShort(slot.date))}
              </Text>
              <Text style={styles.ticketTime} {...textScale.badge}>
                {slot.label}
              </Text>
              {slot.status !== "pending" ? (
                <Ionicons name={slot.status === "approved" ? "checkmark-circle" : "close-circle"} size={12} color={t.fg} style={styles.ticketMark} />
              ) : null}
            </View>
          );
        })}
      </View>

      {request.note ? (
        <View style={styles.quote}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.cardNote} numberOfLines={3} {...textScale.long}>
            {request.note}
          </Text>
        </View>
      ) : null}

      {request.admin_note ? (
        <View style={styles.adminNote}>
          <Ionicons name="shield-checkmark-outline" size={13} color={colors.brandAccent} />
          <Text style={styles.cardAdminNote} {...textScale.long}>
            {request.admin_note}
          </Text>
        </View>
      ) : null}

      {request.status === "pending" ? (
        <View style={styles.cardActions}>
          <Button label="Reddet" variant="secondary" icon="close" size="md" disabled={busy} onPress={reject} style={styles.cardButton} />
          <Button label="Onayla" size="md" icon="checkmark" disabled={busy} onPress={approve} style={styles.cardButtonWide} haptic="light" />
        </View>
      ) : null}
    </View>
  );
});

const WEEK_INITIALS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"];

/** Saha satırı — konum ikonu, ad, il/semt, açık saat aralığı ve 7 günlük açık gün şeridi. */
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
  const passive = venue.status === "passive";
  const first = position === "single" || position === "first";
  const last = position === "single" || position === "last";
  return (
    <Touchable
      feedback="row"
      onPress={handlePress}
      style={[styles.venueRow, first ? styles.venueFirst : styles.venueDivider, last ? styles.venueLast : null]}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${venue.open_label}–${venue.close_label}${passive ? ", pasif" : ""}`}
    >
      <IconTile icon="location" tone={passive ? "neutral" : "mint"} size={40} glow={false} />
      <View style={styles.venueText}>
        <View style={styles.venueTitleRow}>
          <Text style={[styles.venueName, passive ? styles.venueNameOff : null]} numberOfLines={1} {...textScale.dense}>
            {venue.name}
          </Text>
          {passive ? <Badge label="Pasif" tone="neutral" size="xs" /> : null}
        </View>
        <Text style={styles.venueMeta} numberOfLines={1} {...textScale.dense}>
          {[venue.city, venue.location].filter(Boolean).join(" · ") || "Konum belirtilmemiş"} · {venue.slot_minutes} dk
        </Text>
        <View style={styles.venueDays}>
          {WEEK_INITIALS.map((label, i) => {
            const on = venue.active_days.includes(i + 1);
            return (
              <View key={label} style={[styles.venueDay, on ? styles.venueDayOn : null]}>
                <Text style={[styles.venueDayText, on ? styles.venueDayTextOn : null]} {...textScale.badge}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.venueHours}>
        <Text style={styles.venueHour} {...textScale.badge}>
          {venue.open_label}
        </Text>
        <Text style={styles.venueHourTo} {...textScale.badge}>
          {venue.close_label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
    </Touchable>
  );
});

/**
 * HAFTALIK TAKVİM IZGARASI — sütunlar gün, satırlar saat. Hücre rengi durumu
 * taşır (açık · kapalı · rakip bekliyor · dolu); dolu hücrede ev sahibinin baş
 * harfleri, bekleyen talepte köşede sarı nokta. Bugünün sütunu vurgulanır.
 */
const WeekGrid = memo(function WeekGrid({
  days,
  onPressCell,
}: {
  days: { day: VenueGridDay; cells: AdminBoardCell[] }[];
  onPressCell: (cell: AdminBoardCell) => void;
}) {
  const times = useMemo(() => {
    const set = new Map<string, number>();
    days.forEach((d) => d.cells.forEach((c) => set.set(c.label, c.hour * 60 + c.minute)));
    return [...set.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
  }, [days]);
  const lookup = useMemo(() => {
    const map = new Map<string, AdminBoardCell>();
    days.forEach((d) => d.cells.forEach((c) => map.set(`${d.day.date}|${c.label}`, c)));
    return map;
  }, [days]);

  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        <View style={styles.gridTimeCol} />
        {days.map(({ day }) => (
          <View key={day.date} style={[styles.gridHead, day.is_today ? styles.gridHeadToday : null]}>
            {day.is_today ? <LinearGradient colors={colors.gradientSignature} style={[StyleSheet.absoluteFill, styles.gridHeadFill]} /> : null}
            <Text style={[styles.gridHeadDay, day.is_today ? styles.gridHeadOn : null, day.is_past ? styles.gridPast : null]} {...textScale.badge}>
              {upperTR(day.label.slice(0, 3))}
            </Text>
            <Text style={[styles.gridHeadNum, day.is_today ? styles.gridHeadOn : null, day.is_past ? styles.gridPast : null]} {...textScale.badge}>
              {day.date.slice(8, 10).replace(/^0/, "")}
            </Text>
          </View>
        ))}
      </View>
      {times.map((time) => (
        <View key={time} style={styles.gridRow}>
          <View style={styles.gridTimeCol}>
            <Text style={styles.gridTime} {...textScale.badge}>
              {time}
            </Text>
          </View>
          {days.map(({ day }) => {
            const cell = lookup.get(`${day.date}|${time}`);
            if (!cell) return <View key={day.date} style={[styles.gridCell, styles.gridCellNone]} />;
            return <GridCell key={day.date} cell={cell} onPress={onPressCell} />;
          })}
        </View>
      ))}
    </View>
  );
});

const GridCell = memo(function GridCell({ cell, onPress }: { cell: AdminBoardCell; onPress: (cell: AdminBoardCell) => void }) {
  const handlePress = useCallback(() => onPress(cell), [cell, onPress]);
  const tone = toneColors(SLOT_TONE[cell.status]);
  const muted = cell.is_past || !cell.is_bookable;
  const filled = cell.status === "booked" || cell.status === "awaiting";
  const initials = cell.home?.team_name
    ? cell.home.team_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR")
    : "";
  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${cell.label}, ${SLOT_STATUS_LABELS[cell.status] ?? cell.status}${cell.home ? `, ${cell.home.team_name}` : ""}${
        cell.pending_count > 0 ? `, ${cell.pending_count} bekleyen talep` : ""
      }`}
      style={[
        styles.gridCell,
        { backgroundColor: filled ? withAlpha(tone.fg, 0.85) : tone.dim, borderColor: withAlpha(tone.fg, 0.4) },
        muted ? styles.slotCellMuted : null,
      ]}
    >
      {filled ? (
        <Text style={styles.gridInitials} numberOfLines={1} {...textScale.badge}>
          {initials || "•"}
        </Text>
      ) : cell.status === "closed" ? (
        <Ionicons name="lock-closed" size={10} color={tone.fg} />
      ) : null}
      {cell.pending_count > 0 ? <View style={styles.gridPending} /> : null}
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

  /* Saha listesi tek bir satır grubudur: kartlar arası boşluk grubu
     ortasından bölüyordu. */
  listGrouped: {
    gap: 0,
  },

  summaryTiles: { marginBottom: space.xs },
  summaryTilesGap: { marginBottom: space.md },
  boardScroll: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.giant,
    gap: space.md,
  },

  /* Talep kartı */
  card: {
    gap: space.md,
    padding: space.lg,
    paddingLeft: space.lg + space.xxs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  cardRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  cardTitles: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  cardMeta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  /* Takımın notu alıntıdır: ikon + ikincil mürekkep, cam zemin. */
  quote: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  cardNote: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  adminNote: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  cardAdminNote: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    gap: space.sm,
  },
  cardButton: {
    flex: 1,
  },
  cardButtonWide: { flex: 1.6 },
  ticket: {
    minWidth: 76,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: space.xxs,
  },
  ticketDay: { ...type.overline },
  ticketTime: { ...type.scoreXs, color: colors.textPrimary },
  ticketMark: { position: "absolute", right: space.s, top: space.s },

  /* Saha satırı */
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.rowPaddingH,
    paddingVertical: space.md,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.glassLine,
  },
  venueFirst: { borderTopWidth: hairline, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  venueDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  venueLast: { borderBottomWidth: hairline, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  venueText: { flex: 1, minWidth: 0, gap: space.xxs },
  venueTitleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  venueName: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  venueNameOff: { color: colors.textTertiary },
  venueMeta: { ...type.caption, color: colors.textTertiary },
  venueDays: { flexDirection: "row", gap: 3, marginTop: space.xxs },
  venueDay: { width: 20, height: 16, borderRadius: radius.xs, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  venueDayOn: { backgroundColor: colors.winDim },
  venueDayText: { ...type.nano, color: colors.textDisabled },
  venueDayTextOn: { color: colors.win },
  venueHours: { alignItems: "flex-end" },
  venueHour: { ...type.numSmStrong, color: colors.textPrimary },
  venueHourTo: { ...type.numSm, color: colors.textTertiary },

  /* Haftalık ızgara */
  grid: {
    padding: space.sm,
    gap: 4,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  gridRow: { flexDirection: "row", gap: 4, alignItems: "center" },
  gridTimeCol: { width: 38, alignItems: "flex-start" },
  gridTime: { ...type.numSm, color: colors.textTertiary },
  gridHead: { flex: 1, alignItems: "center", paddingVertical: space.xs, borderRadius: radius.sm, overflow: "hidden" },
  gridHeadToday: {},
  gridHeadFill: { borderRadius: radius.sm },
  gridHeadDay: { ...type.overline, color: colors.textTertiary },
  gridHeadNum: { ...type.numSmStrong, color: colors.textPrimary },
  gridHeadOn: { color: colors.onDark },
  gridPast: { opacity: 0.5 },
  gridCell: {
    flex: 1,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  gridCellNone: { backgroundColor: colors.surface2, borderColor: colors.separator },
  gridInitials: { ...type.nano, color: colors.onDark },
  gridPending: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warn,
    borderWidth: 1,
    borderColor: colors.surface1,
  },
  legendPending: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warn },

  /* Saat çipleri */
  slotWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  slotStatic: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    paddingHorizontal: space.m,
    paddingVertical: space.xs + 1,
  },
  slotStaticText: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
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
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  weekButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
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
    paddingHorizontal: space.xs,
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
    ...type.caption,
    color: colors.textSecondary,
  },

  /* Gün kartı */
  dayCard: {
    gap: space.md,
    padding: space.md + space.xxs,
    borderRadius: radius.xl,
    ...elevate(1),
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
    backgroundColor: colors.surface3,
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
