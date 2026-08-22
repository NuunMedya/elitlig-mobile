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
 *   open      → boş saat, seçilebilir (yeşil)
 *   awaiting  → bir takım almış, rakip bekleniyor — SEÇİLEBİLİR (sarı)
 *   booked    → maç alınmış (mor)
 *   closed    → yönetici kapatmış (gri)
 *
 * "AWAITING" HÜCRESİ SEÇİLEBİLİR: amatör ligde saatlerin çoğunu bir takım açar,
 * ikinci takım rakip olarak katılır — talebin onaylanması seni o maçın rakibi
 * yapar. Bu ekranın önceki sürümü yalnız `open` hücreleri seçilebilir
 * kılıyordu ve akışın en çok kullanılan yolu mobilde kapalıydı.
 *
 * HÜCRE İÇİNDE AÇIKLAMA: renk tek başına anlam taşımaz. Her hücre durumunu
 * tek satırla söyler ("Yıldızspor · rakip bekleniyor", "Talebiniz bekliyor",
 * "3 takım istedi"); kullanıcı lejanta bakmak zorunda kalmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import type { SlotStatus } from "@/lib/api/admin";
import {
  cancelMatchRequest,
  createMatchRequest,
  getMyMatchRequests,
  getVenueBoard,
  getVenues,
  MATCH_REQUEST_STATUS_LABELS,
  type MyMatchRequest,
  type TeamBoardCell,
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

/**
 * Hücrenin TAKIM tarafındaki görünümü — web'deki `cellView` ile birebir.
 *
 * BURADAKİ ASIL KURAL: `awaiting` (bir takım saati almış, rakip bekliyor)
 * hücreleri SEÇİLEBİLİR. Mobil sürüm bunu kaçırıyordu — yalnız `open`
 * hücreler seçilebiliyordu — ve bu, "Maç Al" akışının en sık kullanılan yolunu
 * kapatıyordu: amatör ligde saatlerin çoğunu bir takım açar, ikinci takım
 * rakip olarak katılır. Yönetici talebi onayladığında takım o maçın rakibi
 * olur.
 *
 * Dönen `hint` boş olabilir; hücrede ikinci satır yalnız doluysa çizilir.
 */
interface CellView {
  selectable: boolean;
  /** Hücrenin altındaki tek satırlık açıklama. */
  hint: string;
  /** Kenarlık rengi — durum rengini EZEBİLİR (kendi maçın/talebin gibi). */
  tone: string;
  /** Kendi takımını ilgilendiren hücre: dolgu ile ayrışır. */
  mine: boolean;
}

function cellView(cell: TeamBoardCell, selected: boolean, teamId: number | null): CellView {
  const sides = [cell.home, cell.away].filter(Boolean) as NonNullable<TeamBoardCell["home"]>[];
  const names = sides.map((side) => side.team_name).join(" – ");

  // Geçmiş gün ya da rezervasyon penceresi dışı: yalnız bilgi.
  if (cell.is_past || !cell.is_bookable) {
    return { selectable: false, hint: names, tone: colors.textDisabled, mine: false };
  }

  const mineSide =
    teamId != null ? sides.find((side) => Number(side.team_id) === Number(teamId)) : undefined;
  const rivalSide = mineSide ? sides.find((side) => side !== mineSide) : undefined;

  // Yöneticinin kapattığı saat takım için de doludur.
  if (cell.status === "closed") {
    return { selectable: false, hint: "Dolu", tone: colors.textTertiary, mine: false };
  }

  if (cell.status === "booked") {
    return mineSide
      ? {
          selectable: false,
          hint: `Maçınız${rivalSide ? ` · ${rivalSide.team_name}` : ""}`,
          tone: colors.brandAccent,
          mine: true,
        }
      : { selectable: false, hint: names ? `Dolu · ${names}` : "Dolu", tone: colors.brandAccent, mine: false };
  }

  if (cell.status === "awaiting") {
    if (mineSide) {
      return {
        selectable: false,
        hint: "Saat sizin · rakip bekleniyor",
        tone: colors.brandAccent,
        mine: true,
      };
    }
    if (cell.my_request) {
      return { selectable: false, hint: "Talebiniz bekliyor", tone: colors.info, mine: true };
    }
    if (selected) {
      // Seçili durum MERCANDIR: mavi bu üründe yalnız veri rengidir.
      return { selectable: true, hint: "Rakibi olacaksınız", tone: colors.brand, mine: false };
    }
    return {
      selectable: true,
      hint: `${sides[0]?.team_name ?? "Bir takım"} · rakip bekleniyor`,
      tone: colors.warn,
      mine: false,
    };
  }

  // status === "open"
  if (cell.my_request) {
    return { selectable: false, hint: "Talebiniz bekliyor", tone: colors.info, mine: true };
  }
  if (selected) {
    return { selectable: true, hint: "Seçildi", tone: colors.brand, mine: false };
  }
  return {
    selectable: true,
    hint: cell.pending_count > 0 ? `${cell.pending_count} takım istedi` : "",
    tone: colors.win,
    mine: false,
  };
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

  /* Derin bağlantı: MATCH_REQUEST bildirimi `?tab=taleplerim&request=<id>` ile
     buraya düşer. Sekme başlangıç değerini parametreden alır; `request`
     ilgili kartı vurgular ki kullanıcı hangi talep için geldiğini görsün. */
  const params = useLocalSearchParams<{ tab?: string; request?: string }>();
  const highlightId = Array.isArray(params.request) ? params.request[0] : params.request;

  const [tab, setTab] = useState<Tab>(() => {
    const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    return raw === "taleplerim" ? "taleplerim" : "pano";
  });
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

  /** Panonun döndürdüğü kendi takım kimliği — "bu saat benim mi" kararı bunda. */
  const myTeamId = boardQuery.data?.teamId ?? null;

  const toggleCell = useCallback(
    (cell: TeamBoardCell) => {
      // Seçilebilirlik kararı tek yerden gelir (bkz. cellView): `open` VE
      // `awaiting` hücreler seçilebilir; kendi saatin ya da bekleyen talebin
      // olan hücre seçilemez — bu yüzden takım kimliği şart.
      if (!cellView(cell, false, myTeamId).selectable) return;
      haptics.select();
      setSelected((prev) => {
        const next = new Set(prev);
        const key = cellKey(cell);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [myTeamId],
  );

  /** Hücreler güne göre gruplanır; pano gün satırları hâlinde çizilir. */
  const days = useMemo(() => {
    const cells = boardQuery.data?.cells ?? [];
    const map = new Map<string, TeamBoardCell[]>();
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
                      ["open", "Boş"],
                      ["awaiting", "Rakip bekleniyor · seçilebilir"],
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
                        {day.cells.map((cell) => (
                          <SlotCell
                            key={cellKey(cell)}
                            cell={cell}
                            selected={selected.has(cellKey(cell))}
                            teamId={myTeamId}
                            onToggle={toggleCell}
                          />
                        ))}
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
                      Birden fazla saat seçebilirsin; yönetici uygun olanı onaylar. Onaylanan
                      saat takımına maç olarak yazılır ve bildirim gelir. Rakip bekleyen bir
                      saati seçtiysen o maçın rakibi olursun.
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
                  highlighted={request.public_id === highlightId}
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

/* ═══════════════════════════ PANO HÜCRESİ ═══════════════════════════ */

/**
 * Saha panosunun tek hücresi: saat + tek satırlık durum açıklaması.
 *
 * NEDEN AÇIKLAMA SATIRI VAR: eski hücre yalnız saati ve bir kenarlık rengini
 * gösteriyordu. "Sarı ne demekti?" sorusunun yanıtı lejantta kalıyordu ve
 * kullanıcı en kritik ayrımı — "bu saatte bir takım rakip bekliyor, tıklarsam
 * rakibi olurum" — hiç göremiyordu. Renk sinyali tek başına anlam taşımaz
 * (§1.0/4); açıklama satırı o anlamı hücrenin içine koyar.
 */
const SlotCell = React.memo(function SlotCell({
  cell,
  selected,
  teamId,
  onToggle,
}: {
  cell: TeamBoardCell;
  selected: boolean;
  teamId: number | null;
  onToggle: (cell: TeamBoardCell) => void;
}) {
  const view = cellView(cell, selected, teamId);
  const handlePress = useCallback(() => onToggle(cell), [cell, onToggle]);

  return (
    <Touchable
      feedback={view.selectable ? "chip" : "none"}
      onPress={view.selectable ? handlePress : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !view.selectable }}
      accessibilityLabel={`${cell.label}${view.hint ? `, ${view.hint}` : ""}`}
      style={[
        styles.slot,
        { borderColor: view.tone },
        !view.selectable && styles.slotDisabled,
        view.mine && styles.slotMine,
        selected && styles.slotSelected,
      ]}
    >
      <Text
        style={[styles.slotText, selected && styles.slotTextSelected]}
        allowFontScaling={false}
      >
        {cell.label}
      </Text>
      {view.hint ? (
        <Text
          style={[styles.slotHint, selected && styles.slotHintSelected]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {view.hint}
        </Text>
      ) : null}
    </Touchable>
  );
});

/* ═══════════════════════════ TALEP KARTI ═══════════════════════════ */

function RequestCard({
  request,
  highlighted,
  onWithdraw,
  withdrawing,
}: {
  request: MyMatchRequest;
  /** Bildirimden gelinen talep: kart mor çerçeveyle işaretlenir. */
  highlighted?: boolean;
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
    <Card padding="md" style={[styles.requestCard, highlighted ? styles.requestCardActive : null]}>
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
  /* Hücre artık iki satırlı (saat + açıklama); genişlik açıklamayı taşıyacak
     kadar büyüdü ama satıra hâlâ iki hücre sığıyor. */
  slot: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    minWidth: 96,
    maxWidth: 168,
    gap: 1,
    backgroundColor: colors.surface2,
  },
  slotDisabled: { opacity: 0.5 },
  /** Kendi takımını ilgilendiren hücre: sönük değil, hafif dolgulu. */
  slotMine: { opacity: 1, backgroundColor: colors.surface3 },
  slotSelected: { backgroundColor: colors.brand, borderColor: colors.brand, opacity: 1 },
  slotText: { ...type.label, color: colors.textPrimary },
  slotTextSelected: { color: colors.textOnBrand },
  slotHint: { ...type.micro, color: colors.textTertiary, letterSpacing: 0 },
  slotHintSelected: { color: colors.textOnBrand },

  submitCard: { gap: space.sm },
  submitTitle: { ...type.h3, color: colors.textPrimary },
  submitHint: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
  submitActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm },

  requestCard: { gap: space.sm },
  /** Bildirimden gelinen kart: "aradığın bu" demek için mor çerçeve. */
  requestCardActive: { borderColor: colors.brandBorder, borderWidth: 1 },
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
