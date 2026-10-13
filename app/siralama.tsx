/**
 * REKOR TABLOSU — beş oyunun haftalık ve tüm zamanlar sıralaması.
 *
 * NE: oyun seçicisi (çip şeridi) + iki filtre segmenti (dönem, kapsam) +
 * podyum (ilk üç) + yoğun liste (`ListRow`). Kullanıcının kendi satırı hem
 * listede vurgulanır hem de listenin dışında kalıyorsa üstte sabit bir kartla
 * gösterilir — "ben neredeyim" sorusu kaydırmadan yanıtlanır.
 *
 * NEDEN ÇİP + SEGMENT: beş oyun bir segmente sığmaz (segment 2–4 seçenek
 * içindir), o yüzden oyun seçimi kaydırılabilir çip şerididir ve başlığın
 * altında sabit durur. Dönem ve kapsam ise ikişer seçenek olduğu için
 * `SegmentedControl`dür.
 *
 * PAYLAŞIM KARTI KORUNDU: aynı içerik (marka, oyun + dönem satırı, ilk beş,
 * alt bilgi) ve iki boy (hikâye 9:16 / gönderi 3:4). Değişen yalnız kabuk:
 * elle yazılmış modal + sabit hex yerine `BottomSheet`, `SegmentedControl`,
 * `Button` ve tema tokenları.
 *
 * ESKİ KAPILAR KAPATILDI: `components/ScreenHeader` → `components/ui`
 * `ScreenHeader`, `components/States` → `components/ui`, `constants/theme` →
 * `@/theme`, ham `Pressable` → `Touchable`/`Chip`/`ListRow`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  GradientFill,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type SegmentedItem,
} from "@/components/ui";
import { getArenaLeaderboard, getMyArenaRank, type ArenaEntry, type ArenaGame } from "@/lib/api/arena";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  elevate,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ═════════════════════════ SABİTLER (saf veri) ═════════════════════════ */

interface GameMeta {
  key: ArenaGame;
  label: string;
  /** İkonlar `(tabs)/oyunlar.tsx` ile birebir aynı — oyun kimliği sabit kalsın. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Skor birimi: "24 seri", "180 puan". */
  unit: string;
  /** Oyunun ekranı — boş tablodan tek dokunuşla oynamaya geçilir. */
  route: string;
}

const GAMES: GameMeta[] = [
  { key: "seri", label: "Arena", icon: "flame", unit: "seri", route: "/arena" },
  { key: "sektir", label: "Top Sektir", icon: "football", unit: "sekme", route: "/sektir" },
  { key: "penalti", label: "Penaltı", icon: "golf", unit: "gol", route: "/penalti" },
  { key: "kimbu", label: "Kim Bu?", icon: "search", unit: "puan", route: "/kimbu" },
  { key: "slalom", label: "Slalom", icon: "flag", unit: "koni", route: "/slalom" },
  { key: "gunun", label: "Günün Testi", icon: "bulb", unit: "puan", route: "/gunun" },
];

type Period = "weekly" | "alltime";
type ScopeMode = "city" | "turkey";

const PERIOD_ITEMS: SegmentedItem<Period>[] = [
  { key: "weekly", label: "Haftalık" },
  { key: "alltime", label: "Tümü" },
];

/**
 * Podyum basamağı renkleri — altın, gümüş, bronz. Podyum sahnede (grafit)
 * durduğu için tokenlar koyu zeminde okunanlardan seçildi.
 */
const PODIUM_TONES = [colors.yellowCard, colors.onDarkMuted, colors.zoneRelegationPlayoff] as const;
/** Basamak yükseklikleri: 1 · 2 · 3. */
const PLINTH_HEIGHT = [58, 40, 28] as const;

/* — Paylaşım kartı — */
type ShareFormat = "story" | "post";

const SHARE_WIDTH = 272;
const SHARE_FORMATS: Record<ShareFormat, { label: string; height: number }> = {
  story: { label: "Hikâye 9:16", height: Math.round((SHARE_WIDTH * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((SHARE_WIDTH * 4) / 3) },
};

const SHARE_ITEMS: SegmentedItem<ShareFormat>[] = [
  { key: "story", label: SHARE_FORMATS.story.label },
  { key: "post", label: SHARE_FORMATS.post.label },
];

/* ═════════════════════════ SAF YARDIMCILAR ═════════════════════════ */

/** 1240 → "1.240" (binlik ayracı Türkçe nokta). */
function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function readNumber(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) return null;
  const value = Number((source as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : null;
}

/**
 * `getMyArenaRank` dönüşü `Record<string, unknown>`: sunucu alanı kimi zaman
 * kökte (`rank`), kimi zaman `entry` nesnesinde veriyor. İkisine de bakılır ve
 * hiçbir yerde `any` kullanılmaz.
 */
function readMyField(data: unknown, key: "rank" | "score" | "best"): number | null {
  const root = readNumber(data, key);
  if (root != null) return root;
  if (typeof data === "object" && data !== null) {
    return readNumber((data as Record<string, unknown>).entry, key);
  }
  return null;
}

/* ═════════════════════════ PODYUM ═════════════════════════ */

/**
 * Podyum basamağı.
 * NEDEN İLKEL PROP: satır memo'lu; `ArenaEntry` nesnesi her sorgu dönüşünde
 * yeni referans alır, ilkel değerlerde ise yalnız gerçekten değişen basamak
 * yeniden çizilir.
 */
const PodiumStep = React.memo(function PodiumStep({
  place,
  name,
  teamName,
  score,
  unit,
  mine,
}: {
  /** 1, 2 veya 3. */
  place: number;
  name: string;
  teamName: string | null;
  score: number;
  unit: string;
  mine: boolean;
}) {
  const tone = PODIUM_TONES[place - 1] ?? colors.onDarkMuted;
  const first = place === 1;

  return (
    <View style={styles.step}>
      <Avatar name={name} size={first ? 56 : 44} ring={mine ? "brand" : "none"} />

      <Text style={styles.stepName} numberOfLines={1} {...textScale.dense}>
        {mine ? "Sen" : name}
      </Text>
      <Text style={styles.stepTeam} numberOfLines={1} {...textScale.dense}>
        {teamName ?? " "}
      </Text>

      {/* Rakam kahramandır: skor Archivo ile basamağın üstünde. */}
      <View style={styles.stepScoreRow}>
        <Text style={[styles.stepScore, first ? styles.stepScoreFirst : null]} {...textScale.dense}>
          {formatCount(score)}
        </Text>
        <Text style={styles.stepUnit} {...textScale.badge}>
          {unit}
        </Text>
      </View>

      {/* BASAMAK — yükseklik sırayı söyler; üst kenardaki renkli çizgi
          madalya rengidir (altın · gümüş · bronz). Rakam beyaz, sahnede
          her temada okunur. */}
      <View style={[styles.plinth, PLINTH_HEIGHT[place - 1] != null ? { height: PLINTH_HEIGHT[place - 1] } : null]}>
        <View style={[styles.plinthTop, { backgroundColor: tone }]} />
        <Text style={styles.plinthPlace} {...textScale.badge}>
          {place}
        </Text>
      </View>
    </View>
  );
});

/**
 * Boş basamak — ilk üçün hepsi dolmadığında podyum yine podyum gibi okunsun
 * diye basamak çizilir, üstü boş kalır ("kimse yok" değil "yer boş" der).
 */
const EmptyStep = React.memo(function EmptyStep({ place }: { place: 2 | 3 }) {
  return (
    <View style={styles.step}>
      <View style={styles.emptySeat}>
        <Ionicons name="person-outline" size={18} color={colors.onDarkMuted} />
      </View>
      <Text style={styles.stepTeam} numberOfLines={1} {...textScale.dense}>
        Yer boş
      </Text>
      <View style={[styles.plinth, styles.plinthEmpty, { height: PLINTH_HEIGHT[place - 1] }]}>
        <Text style={[styles.plinthPlace, styles.plinthPlaceEmpty]} {...textScale.badge}>
          {place}
        </Text>
      </View>
    </View>
  );
});

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function ArenaLeaderboardScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const initial = GAMES.find((g) => g.key === params.game)?.key ?? "seri";

  const [game, setGame] = useState<ArenaGame>(initial);
  const [period, setPeriod] = useState<Period>("weekly");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("city");
  const [shareOpen, setShareOpen] = useState(false);

  const scope = useScope();
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const cityId = scopeMode === "city" && scope.cityId ? Number(scope.cityId) : undefined;
  const meta = GAMES.find((item) => item.key === game) ?? GAMES[0];

  const boardQuery = useQuery({
    queryKey: ["arena", "board", game, period, cityId ?? "tr"],
    queryFn: () => getArenaLeaderboard(game, { cityId, period }),
    staleTime: 30_000,
  });

  const meQuery = useQuery({
    queryKey: ["arena", "me", game, cityId ?? "tr"],
    queryFn: () => getMyArenaRank(game, cityId),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  const entries = useMemo(() => boardQuery.data?.entries ?? [], [boardQuery.data]);
  const myRank = readMyField(meQuery.data, "rank");
  const myScore = readMyField(meQuery.data, "score") ?? readMyField(meQuery.data, "best");
  const myId = auth.user ? Number(auth.user.id) : null;

  /** İlk üç podyuma çıkar; kalanlar yoğun listede kalır. */
  const podium = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);

  /** Kendi satırım listede görünüyor mu — görünmüyorsa üstte sabit kart. */
  const meInList = useMemo(
    () => (myId == null ? false : entries.some((entry) => Number(entry.userId) === myId)),
    [entries, myId]
  );

  const scopeItems = useMemo<SegmentedItem<ScopeMode>[]>(
    () => [
      { key: "city", label: scope.cityLabel || "Şehrim" },
      { key: "turkey", label: "Türkiye" },
    ],
    [scope.cityLabel]
  );

  const refresh = useRefresh(boardQuery.refetch, { refreshing: boardQuery.isRefetching });
  const refreshControl = useMemo(
    () => <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />,
    [refresh.refreshing, refresh.onRefresh]
  );

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  const headerActions = useMemo(
    () => [
      {
        icon: "share-social-outline" as keyof typeof Ionicons.glyphMap,
        onPress: openShare,
        accessibilityLabel: "Tabloyu paylaş",
      },
    ],
    [openShare]
  );

  /** Oyun çipleri — başlığın altında sabit şerit. */
  const gameStrip = useMemo(
    () => (
      <ChipGroup style={styles.chipStrip}>
        {GAMES.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            icon={item.icon}
            selected={item.key === game}
            onPress={() => setGame(item.key)}
          />
        ))}
      </ChipGroup>
    ),
    [game]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ArenaEntry; index: number }) => {
      const mine = myId != null && Number(item.userId) === myId;
      return (
        <ListRow
          leading={
            <Text style={styles.rowRank} {...textScale.dense}>
              {item.rank}
            </Text>
          }
          title={mine ? `${item.name} (sen)` : item.name}
          subtitle={item.teamName ?? undefined}
          highlighted={mine}
          position={
            rest.length === 1 ? "single" : index === 0 ? "first" : index === rest.length - 1 ? "last" : "middle"
          }
          trailing={
            <View style={styles.rowScore}>
              <Text style={styles.rowScoreValue} {...textScale.dense}>
                {formatCount(item.score)}
              </Text>
              <Text style={styles.rowScoreMeta} numberOfLines={1} {...textScale.badge}>
                {formatDateShort(item.date)}
              </Text>
            </View>
          }
        />
      );
    },
    [myId, rest.length]
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {boardQuery.isError ? <ErrorState error={boardQuery.error} variant="banner" /> : null}

      {/* İki süzgeç tek satırda: ikisi de iki seçenekli, alt alta iki bant
          ekranın ilk üçte birini podyumdan önce yiyordu. */}
      <View style={styles.filters}>
        <View style={styles.flex}>
          <SegmentedControl items={PERIOD_ITEMS} value={period} onChange={setPeriod} size="sm" />
        </View>
        <View style={styles.flex}>
          <SegmentedControl items={scopeItems} value={scopeMode} onChange={setScopeMode} size="sm" />
        </View>
      </View>

      {/* Kendi sıran listede yoksa üstte sabit kart olarak gösterilir. */}
      {auth.user && !meInList && (myRank != null || myScore != null) ? (
        <View style={styles.meCard}>
          <View style={styles.meBadge}>
            <Text style={styles.meBadgeText} {...textScale.badge}>
              {myRank != null ? `#${myRank}` : "—"}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.meTitle} numberOfLines={1} {...textScale.dense}>
              Senin sıran
            </Text>
            <Text style={styles.meMeta} numberOfLines={1} {...textScale.badge}>
              {myScore != null
                ? `${formatCount(myScore)} ${meta.unit} · ${period === "weekly" ? "bu hafta" : "tüm zamanlar"}`
                : "Bu listede henüz skorun yok"}
            </Text>
          </View>
          <Badge label={meta.label} tone="brand" size="xs" />
        </View>
      ) : null}

      {podium.length > 0 ? (
        <>
          <View style={styles.podium}>
            <GradientFill tone="ink" radius="xxl" />
            <Text style={styles.podiumOverline} {...textScale.badge}>
              {upperTR(`${meta.label} · ${period === "weekly" ? "bu hafta" : "tüm zamanlar"}`)}
            </Text>
            <View style={styles.podiumRow}>
            {/* 2 · 1 · 3 sırası: birinci ortada ve en yüksek basamakta. */}
            {podium[1] ? (
              <PodiumStep
                place={2}
                name={podium[1].name}
                teamName={podium[1].teamName ?? null}
                score={podium[1].score}
                unit={meta.unit}
                mine={myId != null && Number(podium[1].userId) === myId}
              />
            ) : (
              <EmptyStep place={2} />
            )}

            <PodiumStep
              place={1}
              name={podium[0].name}
              teamName={podium[0].teamName ?? null}
              score={podium[0].score}
              unit={meta.unit}
              mine={myId != null && Number(podium[0].userId) === myId}
            />

            {podium[2] ? (
              <PodiumStep
                place={3}
                name={podium[2].name}
                teamName={podium[2].teamName ?? null}
                score={podium[2].score}
                unit={meta.unit}
                mine={myId != null && Number(podium[2].userId) === myId}
              />
            ) : (
              <EmptyStep place={3} />
            )}
            </View>
          </View>

          {rest.length > 0 ? (
            <SectionHeader title="Sıralama" meta={`${formatCount(entries.length)} oyuncu`} />
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Rekor Tablosu"
        subtitle="Oyunlarda kim önde?"
        back
        scrollY={scrollY}
        actions={headerActions}
        bottom={gameStrip}
      />

      {boardQuery.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow count={8} />
        </View>
      ) : boardQuery.isError && entries.length === 0 ? (
        <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={rest}
          keyExtractor={(item) => `${item.userId}-${item.rank}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            entries.length === 0 ? (
              <EmptyState
                icon="trophy-outline"
                title="Henüz skor yok"
                body={
                  auth.user
                    ? "İlk rekoru gönderen sen ol — oyna, skorun otomatik sıralamaya yazılsın."
                    : "Oyna ve giriş yap; skorun otomatik sıralamaya yazılsın."
                }
                variant="inline"
                action={{ label: `${meta.label} oyna`, onPress: () => router.push(meta.route as never) }}
              />
            ) : null
          }
        />
      )}

      <ShareSheet
        visible={shareOpen}
        onClose={closeShare}
        gameLabel={meta.label}
        unit={meta.unit}
        period={period}
        scopeLabel={scopeMode === "city" ? scope.cityLabel || "Şehrim" : "Türkiye"}
        entries={entries}
      />
    </SafeAreaView>
  );
}

/* ═════════════════════════ PAYLAŞIM KARTI ═════════════════════════ */

function ShareSheet({
  visible,
  onClose,
  gameLabel,
  unit,
  period,
  scopeLabel,
  entries,
}: {
  visible: boolean;
  onClose: () => void;
  gameLabel: string;
  unit: string;
  period: Period;
  scopeLabel: string;
  entries: ArenaEntry[];
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const top = useMemo(() => entries.slice(0, 5), [entries]);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch {
      // Görsel üretilemezse panel açık kalır; kullanıcı tekrar deneyebilir.
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Tabloyu paylaş" snap="full">
      <SegmentedControl items={SHARE_ITEMS} value={format} onChange={setFormat} />

      <View style={styles.shareWrap}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={[styles.shareCard, { height: SHARE_FORMATS[format].height }]}>
            {/* Düz dolgu — gradient yalnız okunabilirlik scrim'i için. */}
            <View style={styles.shareStrip} />

            <View style={styles.shareBody}>
              <View style={styles.shareTop}>
                <Text style={styles.shareBrand} {...textScale.badge}>
                  elitlig
                </Text>
                <Text style={styles.shareKicker} {...textScale.badge}>
                  {upperTR("Rekor Tablosu")}
                </Text>
              </View>

              <Text style={styles.shareTitle} numberOfLines={1} {...textScale.badge}>
                {upperTR(`${gameLabel} · ${period === "weekly" ? "haftalık" : "tüm zamanlar"}`)}
              </Text>
              <Text style={styles.shareScopeLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(scopeLabel)}
              </Text>

              <View style={styles.shareList}>
                {top.map((entry, index) => (
                  <View
                    key={`${entry.userId}-${entry.rank}`}
                    style={[styles.shareRow, index > 0 ? styles.shareRowBorder : null]}
                  >
                    <Text style={styles.shareRank} {...textScale.badge}>
                      {index + 1}
                    </Text>
                    <Text style={styles.shareName} numberOfLines={1} {...textScale.badge}>
                      {entry.name}
                    </Text>
                    <View style={styles.shareValueBox}>
                      <Text style={styles.shareValue} {...textScale.badge}>
                        {formatCount(entry.score)}
                      </Text>
                      <Text style={styles.shareUnit} {...textScale.badge}>
                        {upperTR(unit)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.flex} />

              <Text style={styles.shareFooter} {...textScale.badge}>
                {upperTR("elitlig.com")}
              </Text>
            </View>
          </View>
        </ViewShot>
      </View>

      <Button
        label={busy ? "Hazırlanıyor" : "Paylaş"}
        icon="share-social"
        onPress={share}
        loading={busy}
        fullWidth
      />
      <Text style={styles.shareHint} {...textScale.dense}>
        İndirmek için: Paylaş → Görüntüyü Kaydet
      </Text>
    </BottomSheet>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  chipStrip: {
    paddingBottom: space.sm,
  },
  loading: {
    padding: layout.screenPadding,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  listHeader: {
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  filters: {
    flexDirection: "row",
    gap: space.sm,
  },

  /* — Kendi sıran (liste dışındaysa) — */
  meCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.lg,
    borderColor: colors.brandBorder,
    paddingHorizontal: space.m,
    paddingVertical: space.m,
    backgroundColor: colors.surface1,
    ...elevate(1),
    borderWidth: 1,
  },
  meBadge: {
    minWidth: 52,
    /* `type.tableNumStrong` 10 → 13px oldu (satır yüksekliği 18); 32px'lik
       kutu sırayı kenarlara yaslıyordu. */
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    backgroundColor: colors.brandDim,
  },
  meBadgeText: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
  },
  meTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  meMeta: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  /* — Podyum: ekranın tek sahnesi — */
  podium: {
    borderRadius: radius.xxl,
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
    paddingTop: space.lg,
    paddingHorizontal: space.md,
    ...elevate(2),
  },
  podiumOverline: {
    ...type.overline,
    color: colors.brandOnDark,
    textAlign: "center",
    marginBottom: space.md,
  },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  step: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  stepName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
    marginTop: space.s,
  },
  stepTeam: {
    ...type.caption,
    color: colors.onDarkMuted,
    textAlign: "center",
  },
  stepScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginTop: space.xs,
    marginBottom: space.s,
  },
  stepScore: {
    ...type.metricSm,
    color: colors.onDark,
  },
  stepScoreFirst: {
    ...type.scoreMd,
  },
  stepUnit: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  plinth: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.inkTileBorder,
    overflow: "hidden",
  },
  plinthTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  plinthEmpty: {
    marginTop: space.s,
  },
  plinthPlaceEmpty: {
    color: colors.onDarkMuted,
  },
  emptySeat: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.inkPillBorder,
  },
  plinthPlace: {
    ...type.metricSm,
    color: colors.onDark,
  },

  /* — Liste satırı — */
  rowRank: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
    minWidth: 24,
    textAlign: "center",
  },
  rowScore: {
    alignItems: "flex-end",
    gap: space.xxs,
  },
  rowScoreValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  rowScoreMeta: {
    ...type.micro,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  /* — Paylaşım kartı — */
  shareWrap: {
    alignItems: "center",
    paddingVertical: space.md,
  },
  shareCard: {
    width: SHARE_WIDTH,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  shareStrip: {
    backgroundColor: colors.brand,
    height: 6,
  },
  shareBody: {
    flex: 1,
    padding: space.md,
    gap: space.xs,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    ...type.label,
    color: colors.brand,
  },
  shareKicker: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareTitle: {
    ...type.micro,
    color: colors.brandAccent,
    marginTop: space.sm,
  },
  shareScopeLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareList: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.sm,
    marginTop: space.sm,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.s,
  },
  shareRowBorder: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  shareRank: {
    ...type.tableNumStrong,
    color: colors.textTertiary,
    width: 16,
    textAlign: "center",
  },
  shareName: {
    ...type.caption,
    fontFamily: fonts.bold,
    letterSpacing: 0,
    color: colors.textPrimary,
    flex: 1,
  },
  shareValueBox: {
    alignItems: "flex-end",
  },
  shareValue: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
  },
  shareUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareFooter: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: "center",
  },
  shareHint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
