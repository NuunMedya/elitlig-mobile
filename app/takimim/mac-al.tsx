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
 * GÖNDERİM ÇUBUĞU: seçim yapıldığı anda altta sabit bir çubuk belirir
 * ("3 saat seçildi · Talebi gönder"). Eskiden gönderim kartı panonun EN
 * ALTINDAydı; yedi günlük panoda saat seçen başkan kartı görmek için tüm
 * haftayı kaydırmak zorundaydı ve seçimin sayıldığını hiç görmüyordu. Not ve
 * seçilen saatlerin özeti alt sayfada onaylanır.
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  MetricGrid,
  MetricTile,
  Odometer,
  Reveal,
  toneColors,
  type IconTileTone,
  ScreenHeader,
  SkeletonCard,
  Tabs,
  Touchable,
  useRefresh,
  useToast,
  type TabItem,
  type Tone,
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
import { useTeamAccess } from "@/components/club/team/useTeamAccess";
import { colors, elevate, hairline, haptics, layout, radius, space, textScale, type, upperTR } from "@/theme";

type Tab = "pano" | "taleplerim";

const TABS: TabItem<Tab>[] = [
  { key: "pano", label: "Saha panosu" },
  { key: "taleplerim", label: "Taleplerim" },
];

/** Talep durumu → rozet tonu. */
const REQUEST_TONE: Record<string, Tone> = {
  pending: "warn",
  approved: "win",
  rejected: "danger",
  cancelled: "neutral",
};

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
  const access = useTeamAccess();
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const insets = useSafeAreaInsets();

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
      setConfirmOpen(false);
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

  // Takım yetkisi panel/me'den de okunur (oturum alanı girişten sonra tazelenmez).
  const canManageTeam =
    access.canManage ||
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
      <ScreenHeader
        title="Maç Al"
        subtitle="Saha talebi gönder"
        back
        tabs={<Tabs items={TABS} value={tab} onChange={setTab} sticky />}
      />

      <ScrollView
        contentContainerStyle={[styles.content, tab === "pano" && selected.size > 0 ? styles.contentWithBar : null]}
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
                  days.map((day, dayIndex) => (
                    <Reveal key={day.date} index={dayIndex} limit={7}>
                    <Card padding="md" style={styles.dayCard}>
                      <View style={styles.dayHead}>
                        <IconTile icon="calendar" tone="violet" size={28} glow={false} />
                        <Text style={styles.dayTitle}>{dayLabel(day.date)}</Text>
                        <Text style={styles.dayCount} {...textScale.badge}>
                          {`${day.cells.filter((cell) => cell.status === "open" || cell.status === "awaiting").length} boş saat`}
                        </Text>
                      </View>
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
                    </Reveal>
                  ))
                )}

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
              <>
                {/* ÖZET: bekleyen · onaylanan · toplam talep. */}
                <MetricGrid columns={3}>
                  <MetricTile label="Bekleyen" value={String(requestsQuery.data.items.filter((r) => r.status === "pending").length)} hint="yanıt bekliyor" tone="warn" />
                  <MetricTile label="Onaylı" value={String(requestsQuery.data.items.filter((r) => r.status === "approved").length)} hint="maça döndü" tone="win" />
                  <MetricTile label="Toplam" value={String(requestsQuery.data.items.length)} hint="tüm talepler" tone="brand" />
                </MetricGrid>
                {requestsQuery.data.items.map((request, index) => (
                  <Reveal key={request.public_id} index={index} limit={8}>
                    <RequestCard
                      request={request}
                      highlighted={request.public_id === highlightId}
                      onWithdraw={() => withdraw.mutate(request.public_id)}
                      withdrawing={withdraw.isPending}
                    />
                  </Reveal>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* SABİT GÖNDERİM ÇUBUĞU — seçim varken her an görünür. */}
      {tab === "pano" && selected.size > 0 ? (
        <View style={[styles.bar, { paddingBottom: space.md + insets.bottom }]}>
          <View style={styles.barTexts}>
            <View style={styles.barCount}>
              <Odometer value={selected.size} style={styles.barNumber} />
              <Text style={styles.barTitle} {...textScale.dense}>
                saat seçildi
              </Text>
            </View>
            <Touchable feedback="none" onPress={() => setSelected(new Set())} accessibilityRole="button" accessibilityLabel="Seçimi temizle">
              <Text style={styles.barClear} {...textScale.dense}>
                Seçimi temizle
              </Text>
            </Touchable>
          </View>
          <Button label="Devam et" icon="arrow-forward" iconPosition="right" onPress={() => setConfirmOpen(true)} />
        </View>
      ) : null}

      <BottomSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Talebi gönder"
        snap="content"
        footer={
          <Button
            label={`${selected.size} saat için talep gönder`}
            icon="paper-plane"
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={selected.size === 0}
            fullWidth
          />
        }
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetLabel} {...textScale.badge}>
            {venuesQuery.data?.items.find((venue) => venue.public_id === activeVenue)?.name ?? "Saha"}
          </Text>
          <View style={styles.slotWrap}>
            {[...selected].sort().map((key) => {
              const slot = parseCellKey(key);
              return (
                <View key={key} style={styles.requestSlot}>
                  <Text style={styles.requestSlotText} allowFontScaling={false}>
                    {dayLabel(slot.date)} · {String(slot.hour).padStart(2, "0")}:{String(slot.minute).padStart(2, "0")}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.submitHint} {...textScale.long}>
            Yönetici seçtiğin saatlerden uygun olanı onaylar; onaylanan saat takımına maç olarak
            yazılır ve bildirim gelir. Rakip bekleyen bir saat seçtiysen o maçın rakibi olursun.
          </Text>
          <Input
            label="Not (isteğe bağlı)"
            value={note}
            onChangeText={setNote}
            placeholder="Örn. rakip bulundu, hakem talebi"
            multiline
          />
        </View>
      </BottomSheet>
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
      {selected ? <LinearGradient colors={colors.gradientBrand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.slotTop}>
        <View style={[styles.slotDot, { backgroundColor: selected ? colors.textOnBrand : view.tone }]} />
        <Text
          style={[styles.slotText, selected && styles.slotTextSelected]}
          allowFontScaling={false}
        >
          {cell.label}
        </Text>
        {selected ? <Ionicons name="checkmark-circle" size={14} color={colors.textOnBrand} style={styles.slotCheck} /> : null}
      </View>
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

const REQUEST_TILE: Record<string, IconTileTone> = { pending: "gold", approved: "mint", rejected: "red", cancelled: "neutral" };

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
  const tone = REQUEST_TONE[request.status] ?? "neutral";
  return (
    <Card padding="md" style={[styles.requestCard, highlighted ? styles.requestCardActive : null]}>
      {/* Sol kenar: durum şeridi (bekliyor sarı · onay yeşil · ret kırmızı). */}
      <View style={[styles.requestStrip, { backgroundColor: toneColors(tone).fg }]} />
      <View style={styles.requestHead}>
        <IconTile icon="location" tone={REQUEST_TILE[request.status] ?? "neutral"} size={36} glow={false} />
        <View style={styles.requestTitles}>
          <Text style={styles.requestVenue} numberOfLines={1}>
            {request.venue_name}
          </Text>
          {request.venue_location ? (
            <Text style={styles.requestMeta} numberOfLines={1}>
              {request.venue_location}
            </Text>
          ) : null}
        </View>
        <Badge label={MATCH_REQUEST_STATUS_LABELS[request.status] ?? request.status} tone={tone} size="xs" />
      </View>

      <View style={styles.slotWrap}>
        {(request.slots ?? []).map((slot, index) => (
          <View key={`${slot.date}-${slot.hour}-${slot.minute}-${index}`} style={styles.requestSlot}>
            <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.requestSlotText} allowFontScaling={false}>
              {dayLabel(slot.date)}
            </Text>
            <Text style={styles.requestSlotTime} allowFontScaling={false}>
              {slot.label ?? `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`}
            </Text>
          </View>
        ))}
      </View>

      {request.note || request.admin_note ? (
        <View style={styles.requestNotes}>
          {request.note ? (
            <View style={styles.requestNoteRow}>
              <Text style={styles.requestNoteLabel} {...textScale.badge}>
                {upperTR("Notun")}
              </Text>
              <Text style={styles.requestNote} {...textScale.long}>
                {request.note}
              </Text>
            </View>
          ) : null}
          {request.admin_note ? (
            <View style={styles.requestNoteRow}>
              <Text style={styles.requestNoteLabel} {...textScale.badge}>
                {upperTR("Yönetici")}
              </Text>
              <Text style={styles.requestNote} {...textScale.long}>
                {request.admin_note}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {request.status === "pending" ? (
        <Button label="Talebi geri çek" variant="ghost" size="sm" icon="arrow-undo-outline" onPress={onWithdraw} loading={withdrawing} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
    paddingBottom: space.giant,
  },
  contentWithBar: { paddingBottom: 120 },
  bar: {
    ...elevate(2),
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: colors.surface1,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  barTexts: { flex: 1, gap: 2 },
  barCount: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  barNumber: { ...type.scoreMd, color: colors.brandAccent },
  barTitle: { ...type.h4, color: colors.textPrimary, marginBottom: space.xxs },
  barClear: { ...type.caption, color: colors.brandAccent },
  sheetBody: { gap: space.md, paddingBottom: space.md },
  sheetLabel: { ...type.overline, color: colors.textTertiary },

  venueRow: { gap: space.sm, paddingVertical: space.xs },

  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  weekLabel: { ...type.label, color: colors.textPrimary, flex: 1, textAlign: "center" },

  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.caption, color: colors.textSecondary },

  dayCard: { gap: space.md },
  dayHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dayTitle: { ...type.h3, color: colors.textPrimary, flex: 1 },
  dayCount: { ...type.numSmStrong, color: colors.textTertiary },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  /* Hücre iki satırlı (saat + açıklama) ve İKİ EŞİT SÜTUNDA durur: içerik
     genişliğine göre boyutlanan hücreler (96–168px) her günü farklı bir
     yap-boza çeviriyor, aynı saat günden güne başka yerde duruyordu. */
  slot: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    flexBasis: "46%",
    flexGrow: 1,
    gap: 1,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  slotTop: { flexDirection: "row", alignItems: "center", gap: space.s },
  slotDot: { width: 6, height: 6, borderRadius: radius.pill },
  slotCheck: { marginLeft: "auto" },
  slotDisabled: { opacity: 0.5 },
  /** Kendi takımını ilgilendiren hücre: sönük değil, hafif dolgulu. */
  slotMine: { opacity: 1, backgroundColor: colors.surface3 },
  slotSelected: { backgroundColor: colors.brand, borderColor: colors.brand, opacity: 1 },
  slotText: { ...type.scoreXs, color: colors.textPrimary },
  slotTextSelected: { color: colors.textOnBrand },
  slotHint: { ...type.micro, color: colors.textTertiary, letterSpacing: 0 },
  slotHintSelected: { color: colors.textOnBrand },

  submitHint: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },

  requestCard: { gap: space.md, overflow: "hidden" },
  requestStrip: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  requestTitles: { flex: 1, gap: space.xxs },
  requestSlotTime: { ...type.numSmStrong, color: colors.textPrimary },
  requestNotes: { gap: space.s, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  requestNoteRow: { gap: space.xxs },
  requestNoteLabel: { ...type.overline, color: colors.textTertiary },
  /** Bildirimden gelinen kart: "aradığın bu" demek için mor çerçeve. */
  requestCardActive: { borderColor: colors.brandBorder, borderWidth: 1 },
  requestHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  requestVenue: { ...type.h3, color: colors.textPrimary },
  requestMeta: { ...type.caption, color: colors.textTertiary },
  requestSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    height: 28,
  },
  requestSlotText: { ...type.caption, color: colors.textSecondary },
  requestNote: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
});
