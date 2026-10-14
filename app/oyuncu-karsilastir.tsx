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
import {
  Avatar,
  BottomSheet,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SkeletonCard,
  StatBar,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { getPlayer, getPlayerRankings } from "@/lib/api/players";
import { positionLabel } from "@/lib/api/team";
import { getTeam } from "@/lib/api/teams";
import { get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
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
    queryKey: queryKeys.playerRankings(scopeKey, "mostValuable"),
    queryFn: () => getPlayerRankings(scopeKey, "mostValuable"),
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
        {/* ————— Seçim: iki yuva, her biri seçiciyi açar ————— */}
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
          <Touchable
            feedback="icon"
            haptic="selection"
            onPress={swap}
            disabled={!ids.a && !ids.b}
            style={styles.swap}
            accessibilityRole="button"
            accessibilityLabel="Tarafları değiştir"
          >
            <Ionicons name="swap-horizontal" size={16} color={colors.textTertiary} />
          </Touchable>
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
            <CareerCard
              playerA={playerA}
              playerB={playerB}
              marketA={marketOf(playerA, sideA.marketQuery.data)}
              marketB={marketOf(playerB, sideB.marketQuery.data)}
              currency={sideA.marketQuery.data?.currency ?? sideB.marketQuery.data?.currency ?? "ETL"}
            />
            {rowA && rowB ? <ScopeCard rowA={rowA} rowB={rowB} /> : null}
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
      <View style={[styles.sideDot, side === "a" ? styles.sideDotA : styles.sideDotB]} />
      {filled ? (
        <>
          <Avatar name={name} image={image} size={layout.crestXl} />
          <Text style={styles.slotName} numberOfLines={2} {...textScale.dense}>
            {name}
          </Text>
          {teamName ? (
            <View style={styles.slotTeam}>
              <TeamLogo name={teamName} logo={teamLogo} size={14} />
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
          <Text style={styles.slotChange} {...textScale.badge}>
            {upperTR("Değiştir")}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.slotEmptyIcon}>
            <Ionicons name={loading ? "hourglass-outline" : "add"} size={20} color={colors.textTertiary} />
          </View>
          <Text style={styles.slotMeta} {...textScale.dense}>
            {loading ? "Yükleniyor" : "Oyuncu seç"}
          </Text>
        </>
      )}
    </Touchable>
  );
});

/** Kariyer kartı — oyuncu kaydının `total_*` toplamları ve piyasa değeri. */
const CareerCard = memo(function CareerCard({
  playerA,
  playerB,
  marketA,
  marketB,
  currency,
}: {
  playerA: ApiPlayer | null;
  playerB: ApiPlayer | null;
  marketA: number | null;
  marketB: number | null;
  currency: string;
}) {
  const a = careerOf(playerA);
  const b = careerOf(playerB);

  /* Büyük sayılar bar başlığına sığsın: milyon ya da bin birimine indirilir. */
  const showMarket = marketA != null || marketB != null;
  const marketMax = Math.max(marketA ?? 0, marketB ?? 0);
  const marketDiv = marketMax >= 1_000_000 ? 1_000_000 : marketMax >= 1_000 ? 1_000 : 1;
  const marketUnit = marketDiv === 1_000_000 ? " M" : marketDiv === 1_000 ? " B" : "";

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} {...textScale.badge}>
        {upperTR("Kariyer")}
      </Text>
      <StatBar label="Maç" home={a.matches} away={b.matches} />
      <StatBar label="Gol" home={a.goals} away={b.goals} />
      <StatBar label="Maç başı gol" home={ratio(a.goals, a.matches)} away={ratio(b.goals, b.matches)} />
      <StatBar label="Ort. puan" home={ratio(a.points, a.matches)} away={ratio(b.points, b.matches)} />
      <StatBar label="Galibiyet" home={a.wins} away={b.wins} />
      {a.decided > 0 || b.decided > 0 ? (
        <StatBar
          label="Galibiyet oranı"
          home={a.decided > 0 ? Math.round((a.wins / a.decided) * 100) : 0}
          away={b.decided > 0 ? Math.round((b.wins / b.decided) * 100) : 0}
          unit="%"
        />
      ) : null}
      <StatBar label="Sarı kart" home={a.yellow} away={b.yellow} />
      <StatBar label="Kırmızı kart" home={a.red} away={b.red} />
      {showMarket ? (
        <StatBar
          label={`Piyasa değeri (${currency})`}
          home={round1((marketA ?? 0) / marketDiv)}
          away={round1((marketB ?? 0) / marketDiv)}
          unit={marketUnit}
          tone={marketA == null || marketB == null ? "neutral" : "sides"}
        />
      ) : null}
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

/** Kapsam kartı — sıralama listesinin satırları (asist yalnız burada var). */
const ScopeCard = memo(function ScopeCard({ rowA, rowB }: { rowA: PlayerRankRow; rowB: PlayerRankRow }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} {...textScale.badge}>
        {upperTR("Bu kapsamda")}
      </Text>
      <StatBar label="Maç" home={num(rowA.matches)} away={num(rowB.matches)} />
      <StatBar label="Gol" home={num(rowA.goals)} away={num(rowB.goals)} />
      <StatBar label="Asist" home={num(rowA.assists)} away={num(rowB.assists)} />
      <StatBar label="Maç başı gol" home={round1(num(rowA.goalsPerMatch))} away={round1(num(rowB.goalsPerMatch))} />
      <StatBar label="Maç başı puan" home={round1(num(rowA.pointsPerMatch))} away={round1(num(rowB.pointsPerMatch))} />
      <StatBar label="Kart" home={num(rowA.cards)} away={num(rowB.cards)} />
    </View>
  );
});

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

  /* — Seçim yuvaları — */
  slots: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.sm,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.xl,
    minHeight: 150,
    justifyContent: "center",
  },
  sideDot: {
    position: "absolute",
    top: space.sm,
    left: space.sm,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  sideDotA: { backgroundColor: colors.accent },
  sideDotB: { backgroundColor: colors.slate },
  slotName: {
    ...type.h4,
    color: colors.textPrimary,
    textAlign: "center",
  },
  slotTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
  },
  slotMeta: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    flexShrink: 1,
  },
  slotChange: {
    ...type.overline,
    color: colors.textDisabled,
    marginTop: space.xxs,
  },
  slotEmptyIcon: {
    width: layout.crestXl,
    height: layout.crestXl,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  swap: {
    alignSelf: "center",
    padding: space.xs,
  },

  /* — Kartlar — */
  card: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
  },
  cardTitle: {
    ...type.overline,
    color: colors.textTertiary,
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
