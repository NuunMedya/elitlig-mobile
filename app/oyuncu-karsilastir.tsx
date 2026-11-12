/**
 * OYUNCU KARŞILAŞTIR — `/oyuncu-karsilastir?a=<oyuncuId>&b=<oyuncuId>`
 *
 * NE: kullanıcı iki oyuncu seçer, rakamları yan yana görür. Takım
 * karşılaştırmasının (`app/h2h.tsx`) oyuncu karşılığıdır; aynı dil kullanılır:
 * her metrik tek bir `StatBar` — sol taraf (A) daima `accent`, sağ taraf (B)
 * daima `slate`. Seçim kartındaki küçük renk noktası hangi oyuncunun hangi
 * renk olduğunu bir kez söyler.
 *
 * ROTA PARAMETRELERİ: `a` ve `b` oyuncu kimlikleridir ve ön seçim yapar —
 * oyuncu sayfası ileride buraya `?a=<id>` ile bağlanabilir. Seçim değiştikçe
 * parametreler de güncellenir, ekranın adresi paylaşılabilir kalır.
 *
 * VERİ KAYNAKLARI (hepsi oyuncu sayfasının da kullandığı herkese açık uçlar):
 *   GET /api/players/:id               kimlik + kariyer toplamları (`total_*`)
 *   GET /takimlar/:id                  takım adı ve amblemi
 *   GET /api/players/:id/market-value  piyasa değeri (ETL)
 *   GET /api/oyuncu-listesi            seçili kapsamın sıralaması — hem seçici
 *                                      listesi hem "Bu kapsamda" kartı
 *
 * İKİ KAYNAK, İKİ KART: oyuncu kaydının toplamları kariyer boyudur; sıralama
 * listesi yalnız seçili şehir/lig/sezonu sayar (asist de yalnız orada var).
 * İki farklı sayı aynı etiketle yan yana durmasın diye ikisi ayrı kartta ve
 * kendi başlığıyla çizilir — oyuncu sayfasındaki kuralın aynısı. Bir oyuncu
 * kapsam listesinde yoksa "Bu kapsamda" kartı hiç çizilmez; alan uydurulmaz.
 *
 * İKİNCİ TUR — DÜELLO DÜZENİ: iki yuva koyu bir sahnede (gradientInk +
 * aurora) karşı karşıya durur; fotoğraflar taraf renginde degrade halkalı
 * (A camgöbeği, B mor), ortada "VS" ve kazanılan metrik skoru (5 – 2).
 * Her metrik `DuelBar`: değerler uçlarda, başlık ortada, KAZANAN taraf kendi
 * renginde dolu hapta ve tam renkli çubukta; kaybeden sönük. Kart sayıları
 * gibi "az olan iyi" metrikler ters sayılır. Her kartın başlığında kartın
 * kendi skoru durur.
 *
 * SEÇİCİ NEDEN SIRALAMA LİSTESİ: `app/ara.tsx` oyuncu aramasını aynı uçla
 * yapıyor (sunucu kapsamsız tam oyuncu listesi vermiyor). Aynı önbellek
 * anahtarı kullanıldığı için arama ekranından gelen kullanıcıda istek atılmaz.
 * Yazmaya başlamadan önce liste boş değildir: kapsamın en değerli oyuncuları
 * görünür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Aurora,
  Avatar,
  BottomSheet,
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  Reveal,
  ScreenHeader,
  SkeletonCard,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type IconTileTone,
} from "@/components/ui";
import { DUEL_A, DUEL_B, DuelBar, DuelScore, HaloFrame, duelWinner } from "@/components/teampage/ProfileKit";
import { getPlayer, getPlayerRankings } from "@/lib/api/players";
import { positionLabel } from "@/lib/api/team";
import { getTeam } from "@/lib/api/teams";
import { get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* Sahne gradyanı yatay, sağdan sola (yüzey gradyanı kuralı). */
const INK_START = { x: 1, y: 0.5 };
const INK_END = { x: 0, y: 0.5 };
import type { ApiPlayer, PlayerRankRow } from "@/lib/types";

/* ══════════════════════════════════════════════════════════════════════════
   Uç ve yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/players/:id/market-value — yalnız kullandığımız alan tiplenir.
 * Önbellek anahtarı oyuncu sayfasındakiyle AYNIDIR; iki ekran tek istek atar.
 */
interface MarketValue {
  currentValue: number;
  currency: string;
}

const getMarketValue = (playerId: number) =>
  get<MarketValue>(`/api/players/${playerId}/market-value`);

const marketValueKey = (id: number) => ["players", "market-value", id] as const;

type Side = "a" | "b";

/** En az bu kadar harf yazılmadan süzme başlamaz (ara ekranıyla aynı). */
const MIN_QUERY = 2;
/** Arama yokken seçicide gösterilen ilk oyuncu sayısı. */
const TOP_COUNT = 30;

/** expo-router aynı anahtarı dizi olarak da verebilir; ilkini al. */
function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseId(value: string | string[] | undefined): number | null {
  const id = Number(firstParam(value));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Türkçe arama katlaması — "Unye" yazan "Ünye"yi bulsun (bkz. app/ara.tsx). */
function fold(value: string): string {
  return value
    .replace(/[İIı]/g, "i")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Sıralama ucu toplamları DİZE döndürür ("41", "1.95"); güvenli sayı. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Tek ondalığa yuvarla — StatBar tam sayıyı ondalıksız, kalanı virgülle yazar. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? round1(part / whole) : 0;
}

/** Piyasa değeri: oyuncu sayfasının ucu, yoksa oyuncu kaydındaki alan. */
function marketOf(player: ApiPlayer | null | undefined, market: MarketValue | undefined): number | null {
  if (market && Number.isFinite(Number(market.currentValue))) return Number(market.currentValue);
  const raw = player?.market_value ?? player?.value;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Kıyas kartının tek satırı. */
interface Metric {
  key: string;
  label: string;
  a: number;
  b: number;
  unit?: string;
  lowerIsBetter?: boolean;
  neutral?: boolean;
}

/** Kartın skoru: her taraf kaç metriği kazandı (nötr satırlar sayılmaz). */
function tally(metrics: Metric[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const m of metrics) {
    if (m.neutral) continue;
    const w = duelWinner(m.a, m.b, m.lowerIsBetter);
    if (w === "a") a += 1;
    else if (w === "b") b += 1;
  }
  return { a, b };
}

function careerMetrics(
  playerA: ApiPlayer | null,
  playerB: ApiPlayer | null,
  marketA: number | null,
  marketB: number | null,
  currency: string,
): Metric[] {
  const a = careerOf(playerA);
  const b = careerOf(playerB);
  const list: Metric[] = [
    { key: "m", label: "Maç", a: a.matches, b: b.matches },
    { key: "g", label: "Gol", a: a.goals, b: b.goals },
    { key: "gpm", label: "Maç başı gol", a: ratio(a.goals, a.matches), b: ratio(b.goals, b.matches) },
    { key: "pts", label: "Ort. puan", a: ratio(a.points, a.matches), b: ratio(b.points, b.matches) },
    { key: "w", label: "Galibiyet", a: a.wins, b: b.wins },
  ];
  if (a.decided > 0 || b.decided > 0) {
    list.push({
      key: "wr",
      label: "Galibiyet oranı",
      a: a.decided > 0 ? Math.round((a.wins / a.decided) * 100) : 0,
      b: b.decided > 0 ? Math.round((b.wins / b.decided) * 100) : 0,
      unit: "%",
    });
  }
  list.push({ key: "y", label: "Sarı kart", a: a.yellow, b: b.yellow, lowerIsBetter: true });
  list.push({ key: "r", label: "Kırmızı kart", a: a.red, b: b.red, lowerIsBetter: true });
  if (marketA != null || marketB != null) {
    /* Büyük sayılar bar başlığına sığsın: milyon ya da bin birimine indirilir. */
    const max = Math.max(marketA ?? 0, marketB ?? 0);
    const div = max >= 1_000_000 ? 1_000_000 : max >= 1_000 ? 1_000 : 1;
    list.push({
      key: "mv",
      label: `Piyasa değeri (${currency})`,
      a: round1((marketA ?? 0) / div),
      b: round1((marketB ?? 0) / div),
      unit: div === 1_000_000 ? " M" : div === 1_000 ? " B" : "",
      neutral: marketA == null || marketB == null,
    });
  }
  return list;
}

function scopeMetrics(rowA: PlayerRankRow, rowB: PlayerRankRow): Metric[] {
  return [
    { key: "m", label: "Maç", a: num(rowA.matches), b: num(rowB.matches) },
    { key: "g", label: "Gol", a: num(rowA.goals), b: num(rowB.goals) },
    { key: "as", label: "Asist", a: num(rowA.assists), b: num(rowB.assists) },
    { key: "gpm", label: "Maç başı gol", a: round1(num(rowA.goalsPerMatch)), b: round1(num(rowB.goalsPerMatch)) },
    { key: "ppm", label: "Maç başı puan", a: round1(num(rowA.pointsPerMatch)), b: round1(num(rowB.pointsPerMatch)) },
    { key: "c", label: "Kart", a: num(rowA.cards), b: num(rowB.cards), lowerIsBetter: true },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
   Tek tarafın verisi
   ══════════════════════════════════════════════════════════════════════════ */

function usePlayerSide(id: number | null) {
  const playerQuery = useQuery({
    queryKey: queryKeys.player(id ?? 0),
    queryFn: () => getPlayer(id as number),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
  const player = playerQuery.data ?? null;
  const teamId = Number(player?.team_id) || null;

  const teamQuery = useQuery({
    queryKey: queryKeys.team(teamId ?? 0),
    queryFn: () => getTeam(teamId as number),
    enabled: Boolean(teamId),
    staleTime: 10 * 60_000,
  });

  const marketQuery = useQuery({
    queryKey: marketValueKey(id ?? 0),
    queryFn: () => getMarketValue(id as number),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
    retry: false,
  });

  return { playerQuery, teamQuery, marketQuery, player };
}

/* ══════════════════════════════════════════════════════════════════════════
   EKRAN
   ══════════════════════════════════════════════════════════════════════════ */

export default function PlayerCompareScreen() {
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const router = useRouter();
  const scope = useScope();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [ids, setIds] = useState<Record<Side, number | null>>(() => ({
    a: parseId(params.a),
    b: parseId(params.b),
  }));
  const [picking, setPicking] = useState<Side | null>(null);

  const sideA = usePlayerSide(ids.a);
  const sideB = usePlayerSide(ids.b);

  const scopeKey = useMemo(
    () => ({
      cityId: scope.cityId ?? undefined,
      leagueId: scope.leagueId ?? undefined,
      seasonId: scope.seasonId ?? undefined,
    }),
    [scope.cityId, scope.leagueId, scope.seasonId],
  );

  /* Seçici listesi + "Bu kapsamda" kartı — ara ekranıyla aynı anahtar. */
  const rankingsQuery = useQuery({
    /* Lig sekmesiyle AYNI anahtar: uç her `sort` için aynı (≈1 MB) listeyi
       döndürür; ayrı anahtar aynı veriyi ikinci kez indiriyordu. */
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 60_000,
  });
  const rankings = rankingsQuery.data?.players;

  const rowA = useMemo(() => rankings?.find((row) => Number(row.id) === ids.a) ?? null, [ids.a, rankings]);
  const rowB = useMemo(() => rankings?.find((row) => Number(row.id) === ids.b) ?? null, [ids.b, rankings]);

  const pick = useCallback(
    (playerId: number) => {
      if (!picking) return;
      const next = { ...ids, [picking]: playerId };
      setIds(next);
      setPicking(null);
      router.setParams({ a: next.a ? String(next.a) : undefined, b: next.b ? String(next.b) : undefined });
    },
    [ids, picking, router],
  );
  const openPickerA = useCallback(() => setPicking("a"), []);
  const openPickerB = useCallback(() => setPicking("b"), []);
  const closePicker = useCallback(() => setPicking(null), []);
  const swap = useCallback(() => {
    const next = { a: ids.b, b: ids.a };
    setIds(next);
    router.setParams({ a: next.a ? String(next.a) : undefined, b: next.b ? String(next.b) : undefined });
  }, [ids, router]);
  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);

  const refresh = useRefresh(
    useCallback(async () => {
      await Promise.all([
        sideA.playerQuery.refetch(),
        sideB.playerQuery.refetch(),
        sideA.marketQuery.refetch(),
        sideB.marketQuery.refetch(),
        rankingsQuery.refetch(),
      ]);
    }, [rankingsQuery, sideA.marketQuery, sideA.playerQuery, sideB.marketQuery, sideB.playerQuery]),
    { refreshing: sideA.playerQuery.isRefetching || sideB.playerQuery.isRefetching },
  );

  const ready = Boolean(ids.a && ids.b);
  const loading = ready && (sideA.playerQuery.isLoading || sideB.playerQuery.isLoading);
  const failedQuery = [sideA.playerQuery, sideB.playerQuery].find((q) => q.isError && !q.data);

  const playerA = sideA.player;
  const playerB = sideB.player;
  const nameA = playerA?.player_name || rowA?.name || "Oyuncu A";
  const nameB = playerB?.player_name || rowB?.name || "Oyuncu B";

  const career = useMemo(
    () =>
      careerMetrics(
        playerA,
        playerB,
        marketOf(playerA, sideA.marketQuery.data),
        marketOf(playerB, sideB.marketQuery.data),
        sideA.marketQuery.data?.currency ?? sideB.marketQuery.data?.currency ?? "ETL",
      ),
    [playerA, playerB, sideA.marketQuery.data, sideB.marketQuery.data],
  );
  const scopeList = useMemo(() => (rowA && rowB ? scopeMetrics(rowA, rowB) : null), [rowA, rowB]);
  const totalTally = useMemo(() => tally([...career, ...(scopeList ?? [])]), [career, scopeList]);
  const showScore = ready && !loading && Boolean(playerA && playerB);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={ready && playerA && playerB ? `${nameA} – ${nameB}` : "Oyuncu karşılaştır"}
        overline="KARŞILAŞTIRMA"
        scrollY={scrollY}
        back
      />

      <ScrollView
        {...scrollProps}
        refreshControl={ready ? refresh.control : undefined}
        contentContainerStyle={styles.content}
      >
        {/* ————— Düello sahnesi: iki yuva + VS + skor ————— */}
        <View style={styles.stage}>
          <View style={styles.stageClip}>
            <LinearGradient colors={colors.gradientInk} start={INK_START} end={INK_END} style={StyleSheet.absoluteFill} />
            <Aurora variant="stage" style={StyleSheet.absoluteFill} />
          </View>
          <View style={styles.slots}>
            <PlayerSlot
              side="a"
              player={playerA}
              rankRow={rowA}
              teamName={sideA.teamQuery.data?.team_name ?? rowA?.teamName ?? null}
              teamLogo={sideA.teamQuery.data?.logo ?? null}
              loading={Boolean(ids.a) && sideA.playerQuery.isLoading}
              onPick={openPickerA}
              onOpen={openPlayer}
            />
            <View style={styles.center}>
              {showScore ? (
                <DuelScore a={totalTally.a} b={totalTally.b} onDark caption="metrik" />
              ) : (
                <View style={styles.vs}>
                  <Text style={styles.vsText} {...textScale.badge}>
                    VS
                  </Text>
                </View>
              )}
              <Touchable
                feedback="icon"
                haptic="selection"
                onPress={swap}
                disabled={!ids.a && !ids.b}
                style={styles.swap}
                accessibilityRole="button"
                accessibilityLabel="Tarafları değiştir"
              >
                <Ionicons name="swap-horizontal" size={16} color={colors.onDark} />
              </Touchable>
            </View>
            <PlayerSlot
              side="b"
              player={playerB}
              rankRow={rowB}
              teamName={sideB.teamQuery.data?.team_name ?? rowB?.teamName ?? null}
              teamLogo={sideB.teamQuery.data?.logo ?? null}
              loading={Boolean(ids.b) && sideB.playerQuery.isLoading}
              onPick={openPickerB}
              onOpen={openPlayer}
            />
          </View>
          {showScore ? (
            <Text style={styles.verdict} numberOfLines={2} {...textScale.dense}>
              {totalTally.a === totalTally.b
                ? "Denk bir kıyas — metriklerin yarısı ikisine de gidiyor."
                : `${totalTally.a > totalTally.b ? nameA : nameB} ${Math.max(totalTally.a, totalTally.b)} metrikte önde.`}
            </Text>
          ) : null}
        </View>

        {!ready ? (
          <EmptyState
            variant="inline"
            icon="people-outline"
            title="İki oyuncu seç"
            body="Rakamlarını yan yana görmek için iki oyuncu seç. Yuvaya dokunarak değiştirebilirsin."
            action={{ label: ids.a ? "İkinci oyuncuyu seç" : "Oyuncu seç", onPress: ids.a ? openPickerB : openPickerA }}
            secondaryAction={!ids.a && !ids.b ? { label: "İkinci oyuncuyu seç", onPress: openPickerB } : undefined}
          />
        ) : loading ? (
          <View style={styles.loading}>
            <SkeletonCard lines={6} />
            <SkeletonCard lines={3} />
          </View>
        ) : failedQuery ? (
          <ErrorState variant="inline" error={failedQuery.error} onRetry={failedQuery.refetch} />
        ) : (
          <>
            <Reveal index={0}>
              <CompareCard title="Kariyer" icon="briefcase" tone="violet" metrics={career} nameA={nameA} nameB={nameB} />
            </Reveal>
            {scopeList ? (
              <Reveal index={1}>
                <CompareCard title="Bu kapsamda" icon="podium" tone="cyan" metrics={scopeList} nameA={nameA} nameB={nameB} />
              </Reveal>
            ) : null}
            <Text style={styles.footnote} {...textScale.dense}>
              Kariyer rakamları yayınlanmış ve puanlanmış maçlardan, kapsam rakamları seçili
              şehir · lig · sezondan sayılır.
            </Text>
          </>
        )}
      </ScrollView>

      <PlayerPicker
        visible={picking != null}
        onClose={closePicker}
        title={picking === "b" ? "İkinci oyuncu" : "Birinci oyuncu"}
        players={rankings}
        loading={rankingsQuery.isLoading}
        error={rankingsQuery.isError && !rankingsQuery.data ? rankingsQuery.error : null}
        onRetry={rankingsQuery.refetch}
        scopeReady={scope.ready}
        excludeId={picking === "a" ? ids.b : picking === "b" ? ids.a : null}
        onPick={pick}
      />
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Parçalar
   ══════════════════════════════════════════════════════════════════════════ */

/** Seçim yuvası: avatar, ad, takım, mevki. Boşsa "Oyuncu seç" kapısı. */
const PlayerSlot = memo(function PlayerSlot({
  side,
  player,
  rankRow,
  teamName,
  teamLogo,
  loading,
  onPick,
  onOpen,
}: {
  side: Side;
  player: ApiPlayer | null;
  rankRow: PlayerRankRow | null;
  teamName: string | null;
  teamLogo: string | null;
  loading: boolean;
  onPick: () => void;
  onOpen: (playerId: number) => void;
}) {
  const name = player?.player_name || rankRow?.name || "";
  const image = player?.player_img ?? rankRow?.image ?? null;
  const position = positionLabel(player?.player_position);
  const playerId = player?.id ?? rankRow?.id ?? null;
  const open = useCallback(() => {
    if (playerId) onOpen(playerId);
  }, [onOpen, playerId]);
  const filled = Boolean(name);

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPick}
      onLongPress={filled ? open : undefined}
      style={styles.slot}
      accessibilityRole="button"
      accessibilityLabel={filled ? `${name}, oyuncuyu değiştir` : "Oyuncu seç"}
      accessibilityHint={filled ? "Uzun bas: oyuncu sayfası" : undefined}
    >
      {filled ? (
        <>
          <HaloFrame
            size={64}
            ring={side === "a" ? [DUEL_A, colors.gradientSignature[1]] : [DUEL_B, colors.gradientSignature[0]]}
            thickness={3}
            gap={3}
          >
            <Avatar name={name} image={image} size={64} />
          </HaloFrame>
          <Text style={styles.slotName} numberOfLines={2} {...textScale.dense}>
            {name}
          </Text>
          {teamName ? (
            <View style={styles.slotTeam}>
              <TeamLogo name={teamName} logo={teamLogo} size={14} plain onDark />
              <Text style={styles.slotMeta} numberOfLines={1} {...textScale.dense}>
                {teamName}
              </Text>
            </View>
          ) : null}
          {position ? (
            <Text style={styles.slotMeta} numberOfLines={1} {...textScale.dense}>
              {position}
            </Text>
          ) : null}
          <View style={styles.slotChange}>
            <Ionicons name="repeat" size={10} color={colors.onDarkMuted} />
            <Text style={styles.slotChangeText} {...textScale.badge}>
              {upperTR("Değiştir")}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.slotEmptyIcon}>
            <Ionicons name={loading ? "hourglass-outline" : "add"} size={24} color={colors.onDark} />
          </View>
          <Text style={styles.slotMeta} {...textScale.dense}>
            {loading ? "Yükleniyor" : "Oyuncu seç"}
          </Text>
        </>
      )}
    </Touchable>
  );
});

/** Kıyas kartı — başlık, kartın kendi skoru, taraf lejantı ve düello satırları. */
const CompareCard = memo(function CompareCard({
  title,
  icon,
  tone,
  metrics,
  nameA,
  nameB,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  metrics: Metric[];
  nameA: string;
  nameB: string;
}) {
  const score = tally(metrics);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <IconTile icon={icon} tone={tone} size={32} glow={false} />
        <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        <View style={styles.cardScore}>
          <Text style={[styles.cardScoreNum, score.a > score.b ? styles.cardScoreA : null]} {...textScale.badge}>
            {score.a}
          </Text>
          <Text style={styles.cardScoreDash} {...textScale.badge}>
            –
          </Text>
          <Text style={[styles.cardScoreNum, score.b > score.a ? styles.cardScoreB : null]} {...textScale.badge}>
            {score.b}
          </Text>
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: DUEL_A }]} />
          <Text style={styles.legendText} numberOfLines={1} {...textScale.dense}>
            {nameA}
          </Text>
        </View>
        <View style={[styles.legendItem, styles.legendRight]}>
          <Text style={[styles.legendText, styles.legendTextRight]} numberOfLines={1} {...textScale.dense}>
            {nameB}
          </Text>
          <View style={[styles.legendDot, { backgroundColor: DUEL_B }]} />
        </View>
      </View>
      {metrics.map((m) => (
        <DuelBar key={m.key} label={m.label} a={m.a} b={m.b} unit={m.unit} lowerIsBetter={m.lowerIsBetter} neutral={m.neutral} />
      ))}
    </View>
  );
});

function careerOf(player: ApiPlayer | null) {
  const wins = num(player?.wins);
  return {
    matches: num(player?.total_matches),
    goals: num(player?.total_goals),
    points: num(player?.total_points),
    wins,
    decided: wins + num(player?.draws) + num(player?.losses),
    yellow: num(player?.total_yellow_cards),
    red: num(player?.total_red_cards),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   SEÇİCİ — arama kutulu alt sayfa
   ══════════════════════════════════════════════════════════════════════════ */

function PlayerPicker({
  visible,
  onClose,
  title,
  players,
  loading,
  error,
  onRetry,
  scopeReady,
  excludeId,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  players: PlayerRankRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  scopeReady: boolean;
  excludeId: number | null;
  onPick: (playerId: number) => void;
}) {
  const [term, setTerm] = useState("");
  const needle = fold(term.trim());
  const searching = needle.length >= MIN_QUERY;

  const list = useMemo(() => {
    const pool = (players ?? []).filter((row) => Number(row.id) !== excludeId);
    if (!searching) return pool.slice(0, TOP_COUNT);
    return pool
      .filter((row) => fold(row.name ?? "").includes(needle) || fold(row.teamName ?? "").includes(needle))
      .slice(0, 50);
  }, [excludeId, needle, players, searching]);

  const close = useCallback(() => {
    setTerm("");
    onClose();
  }, [onClose]);
  const choose = useCallback(
    (playerId: number) => {
      setTerm("");
      onPick(playerId);
    },
    [onPick],
  );

  const renderItem = useCallback(
    ({ item }: { item: PlayerRankRow }) => <PickerRow row={item} onPick={choose} />,
    [choose],
  );

  return (
    <BottomSheet visible={visible} onClose={close} title={title} snap="full" scrollable={false}>
      <View style={styles.pickerBody}>
        <Input
          variant="search"
          size="sm"
          value={term}
          onChangeText={setTerm}
          placeholder="Oyuncu ya da takım adı yaz"
          autoCorrect={false}
          returnKeyType="search"
        />
        {!searching && list.length > 0 ? (
          <Text style={styles.pickerLabel} {...textScale.badge}>
            {upperTR("Kapsamın en değerlileri")}
          </Text>
        ) : null}
        {!scopeReady ? (
          <EmptyState variant="inline" compact icon="location-outline" title="Kapsam seçilmedi" body="Oyuncu listesi seçili şehir ve ligden gelir." />
        ) : loading ? (
          <SkeletonCard lines={5} />
        ) : error ? (
          <ErrorState variant="inline" error={error} onRetry={onRetry} />
        ) : (
          <FlatList
            data={list}
            renderItem={renderItem}
            keyExtractor={pickerKey}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={PickerSeparator}
            initialNumToRender={14}
            style={styles.pickerList}
            ListEmptyComponent={
              <EmptyState
                variant="inline"
                compact
                icon="search-outline"
                title="Oyuncu bulunamadı"
                body="Bu kapsamda eşleşen oyuncu yok."
              />
            }
          />
        )}
      </View>
    </BottomSheet>
  );
}

const pickerKey = (row: PlayerRankRow) => String(row.id);
const PickerSeparator = () => <View style={styles.pickerSeparator} />;

const PickerRow = memo(function PickerRow({
  row,
  onPick,
}: {
  row: PlayerRankRow;
  onPick: (playerId: number) => void;
}) {
  const press = useCallback(() => onPick(Number(row.id)), [onPick, row.id]);
  const meta = [row.teamName, `${num(row.matches)} maç · ${num(row.goals)} gol`].filter(Boolean).join(" · ");
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={press}
      style={styles.pickerRow}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${meta}`}
    >
      <Avatar name={row.name} image={row.image ?? null} size={layout.crestLg} />
      <View style={styles.pickerRowBody}>
        <Text style={styles.pickerName} numberOfLines={1} {...textScale.dense}>
          {row.name}
        </Text>
        <Text style={styles.pickerMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      </View>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.giant,
    gap: space.md,
  },
  loading: {
    gap: space.md,
  },

  /* — Düello sahnesi — */
  stage: {
    borderRadius: radius.xxl,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    gap: space.md,
  },
  stageClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xxl,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  slots: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  slot: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.xl,
    minHeight: 160,
    justifyContent: "center",
  },
  slotName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
    marginTop: space.xs,
  },
  slotTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
  },
  slotMeta: {
    ...type.caption,
    color: colors.onDarkMuted,
    textAlign: "center",
    flexShrink: 1,
  },
  slotChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    marginTop: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
  },
  slotChangeText: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  slotEmptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.inkPillBorder,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
  },
  center: {
    width: 84,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  vs: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  vsText: {
    ...type.scoreSm,
    color: colors.onDark,
  },
  swap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  verdict: {
    ...type.labelSm,
    color: colors.onDark,
    textAlign: "center",
    paddingHorizontal: space.lg,
  },

  /* — Kartlar — */
  card: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.xs,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.xs,
  },
  cardTitle: {
    ...type.h2,
    color: colors.textPrimary,
    flex: 1,
  },
  cardScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  cardScoreNum: {
    ...type.scoreXs,
    color: colors.textSecondary,
  },
  cardScoreA: {
    color: colors.accentText,
  },
  cardScoreB: {
    color: colors.brandAccent,
  },
  cardScoreDash: {
    ...type.scoreXs,
    color: colors.textTertiary,
  },
  legend: {
    flexDirection: "row",
    gap: space.md,
    paddingBottom: space.xs,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
    marginBottom: space.xs,
  },
  legendItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minWidth: 0,
  },
  legendRight: {
    justifyContent: "flex-end",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  legendText: {
    ...type.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  legendTextRight: {
    textAlign: "right",
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: space.xxs,
  },

  /* — Seçici — */
  pickerBody: {
    flex: 1,
    gap: space.sm,
  },
  pickerLabel: {
    ...type.overline,
    color: colors.textTertiary,
    paddingHorizontal: space.xxs,
  },
  pickerList: {
    flex: 1,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 52,
    paddingVertical: space.s,
  },
  pickerRowBody: {
    flex: 1,
    minWidth: 0,
  },
  pickerName: {
    ...type.label,
    color: colors.textPrimary,
  },
  pickerMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  pickerSeparator: {
    height: hairline,
    backgroundColor: colors.separator,
    marginLeft: layout.crestLg + space.m,
  },
});
