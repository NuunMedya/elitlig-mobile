/**
 * FixturesPane — güne göre öbeklenmiş maç listesi (Lig merkezinin "Fikstür" bölmesi).
 *
 * İKİ PENCERE: YAKLAŞAN (bugünden ileri, eskiden yeniye) ve SONUÇLAR
 * (bugünden geri, yeniden eskiye). Tek uzun liste sezonun ilk gününden
 * açılıyordu ve kullanıcı bugüne ulaşmak için aylarca kaydırmak zorundaydı.
 * Yaklaşan maç yoksa bölme kendiliğinden Sonuçlar'la açılır.
 *
 * İki pencerenin de sayısı segmentte yazılır: kullanıcı dokunmadan önce
 * diğer tarafta ne kadar maç olduğunu bilir.
 *
 * Gün başlıkları yapışkandır; "Bugün" ve "Yarın" gibi göreli adlar
 * `formatDayHeading` ile gelir.
 *
 * İKİNCİ TUR — KURGU:
 *   · SEZON ŞERİDİ: listenin tepesinde tek cam kart — oynanan / toplam maç,
 *     imza degradeli ilerleme çubuğu ve "Sıradaki maç günü". Kullanıcı
 *     segmente dokunmadan sezonun neresinde olduğunu bilir.
 *   · HAFTA BANDI: gün grupları ISO haftasına göre bantlanır; haftanın ilk
 *     gününün başlığının üstünde "46. HAFTA · 9–15 KAS" yazar.
 *   · GÜN BAŞLIĞI (`DayHeader`, yapışkan): solda takvim karosu (gün rakamı
 *     iri, ay kısaltması), ortada "Bugün" / hafta günü + tam tarih, sağda
 *     durum hapı: "Tamamlandı" (nane) · "2/4 oynandı" (canlı) · "Oynanacak"
 *     (uyarı). Oynanmış/oynanacak ayrımı satırlara inmeden okunur.
 *
 * YOĞUN SATIR: maçlar iri kart (≈146px, 44px amblem) değil, `MatchCard`ın
 * SATIR biçimidir (`variant="compact"`, ≈78px) ve bir günün maçları tek bir
 * grup kartında alt alta durur. Saha adı satırın alt şeridinde korunur —
 * amatör ligde "hangi halısaha" sorusu skor kadar önemlidir.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import {
  Badge,
  EmptyState,
  ErrorState,
  GradientBar,
  IconTile,
  MatchCard,
  type MatchCardPosition,
  SegmentedControl,
  SkeletonMatchRow,
  refreshControlProps,
  useRefresh,
} from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatches } from "@/lib/api/matches";
import { formatDayHeading, formatNumber } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { GROUP_RADIUS, ScopeMissing, paneStyles, useScopeKey, type PaneProps } from "./shared";

type FixtureWindow = "yaklasan" | "sonuclar";

interface DaySection {
  title: string;
  data: ApiMatch[];
  /** "2026-11-12" */
  dayKey: string;
  /** Haftanın ilk görünen günüyse hafta bandı: "46. hafta · 9–15 Kas". */
  weekLabel: string | null;
  played: number;
}

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** "2026-11-12" → yerel gün (saat dilimi kaymasız). */
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** ISO hafta numarası ve haftanın pazartesi–pazar aralığı. */
function isoWeek(key: string): { id: string; label: string } {
  const date = parseDayKey(key);
  const day = (date.getDay() + 6) % 7; // pazartesi = 0
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart.getTime()) / 86_400_000 / 7) + 1;
  const range =
    monday.getMonth() === sunday.getMonth()
      ? `${monday.getDate()}–${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]}`
      : `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]}`;
  return { id: `${thursday.getFullYear()}-${week}`, label: `${week}. hafta · ${range}` };
}

/* ══════════════════════════════════════════════════════════════════════════
   Gün başlığı — takvim karosu + başlık + durum hapı
   ══════════════════════════════════════════════════════════════════════════ */

const DayHeader = React.memo(function DayHeader({ section, today }: { section: DaySection; today: boolean }) {
  const date = parseDayKey(section.dayKey);
  const total = section.data.length;
  const done = section.played;
  const fullDate = date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  const title = section.title;
  return (
    <View style={styles.dayWrap}>
      {section.weekLabel ? (
        <View style={styles.weekBand}>
          <View style={styles.weekLine} />
          <Text style={styles.weekText} {...textScale.badge}>
            {upperTR(section.weekLabel)}
          </Text>
          <View style={styles.weekLine} />
        </View>
      ) : null}
      <View style={styles.day}>
        <View style={[styles.dayTile, today ? styles.dayTileToday : null]}>
          <Text style={[styles.dayNum, today ? styles.dayNumToday : null]} {...textScale.badge}>
            {date.getDate()}
          </Text>
          <Text style={[styles.dayMonth, today ? styles.dayMonthToday : null]} {...textScale.badge}>
            {upperTR(MONTHS_SHORT[date.getMonth()])}
          </Text>
        </View>
        <View style={styles.dayText}>
          <Text style={styles.dayTitle} numberOfLines={1} {...textScale.dense}>
            {title}
          </Text>
          <Text style={styles.dayMeta} numberOfLines={1} {...textScale.dense}>
            {title === fullDate ? `${total} maç` : `${fullDate} · ${total} maç`}
          </Text>
        </View>
        {done >= total ? (
          <Badge label="Tamamlandı" tone="win" size="xs" icon="checkmark" />
        ) : done > 0 ? (
          <Badge label={`${done}/${total} oynandı`} tone={today ? "live" : "accent"} size="xs" />
        ) : (
          <Badge label="Oynanacak" tone="warn" size="xs" icon="time-outline" />
        )}
      </View>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Sezon şeridi — oynanan / toplam + sıradaki maç günü
   ══════════════════════════════════════════════════════════════════════════ */

const SeasonStrip = React.memo(function SeasonStrip({
  played,
  total,
  nextLabel,
  nextCount,
}: {
  played: number;
  total: number;
  nextLabel: string | null;
  nextCount: number;
}) {
  const ratio = total > 0 ? played / total : 0;
  return (
    <View style={styles.strip}>
      <View style={styles.stripTop}>
        <IconTile icon="calendar" tone="signature" size={36} />
        <View style={styles.stripText}>
          <Text style={styles.stripOver} {...textScale.badge}>
            {upperTR("Sezon ilerlemesi")}
          </Text>
          <Text style={styles.stripValue} numberOfLines={1} {...textScale.dense}>
            {formatNumber(played)}
            <Text style={styles.stripOf}>{` / ${formatNumber(total)} maç oynandı`}</Text>
          </Text>
        </View>
        <Text style={styles.stripPct} {...textScale.dense}>
          {`%${Math.round(ratio * 100)}`}
        </Text>
      </View>
      <GradientBar value={ratio} height={6} />
      {nextLabel ? (
        <View style={styles.stripNext}>
          <View style={styles.nextDot} />
          <Text style={styles.stripNextText} numberOfLines={1} {...textScale.dense}>
            Sıradaki maç günü: <Text style={styles.stripNextStrong}>{nextLabel}</Text>
            {` · ${nextCount} maç`}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

/** Maç tarihi hem "2026-08-19" hem tam ISO gelebiliyor; gün anahtarı ilk 10 karakterdir. */
const dayKeyOf = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);

const MatchItem = React.memo(function MatchItem({
  match,
  homeLogo,
  awayLogo,
  position,
  favorite,
  onOpen,
  onToggleFavorite,
}: {
  match: ApiMatch;
  /** Gün grubundaki konum — köşe ve ayraç buna göre çizilir. */
  position: MatchCardPosition;
  homeLogo: string | null;
  awayLogo: string | null;
  favorite: boolean;
  onOpen: (id: number) => void;
  onToggleFavorite: (id: number) => void;
}) {
  const open = useCallback(() => onOpen(match.id), [match.id, onOpen]);
  const star = useCallback(() => onToggleFavorite(match.id), [match.id, onToggleFavorite]);
  return (
    <MatchCard
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      variant="compact"
      position={position}
      showVenue
      isFavorite={favorite}
      onToggleFavorite={star}
      onPress={open}
      style={POSITION_STYLE[position]}
    />
  );
});

export function FixturesPane({ scrollProps }: PaneProps) {
  const scope = useScope();
  const scopeKey = useScopeKey();
  const router = useRouter();
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorite();
  const teams = useTeamLogos();

  const query = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        limit: 1000,
      }),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const [fixtureWindow, setFixtureWindow] = useState<FixtureWindow | null>(null);
  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const buckets = useMemo(() => {
    const list = query.data ?? [];
    const map = new Map<string, ApiMatch[]>();
    for (const match of list) {
      const key = dayKeyOf(match);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(match);
      else map.set(key, [match]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }, [query.data]);

  const counts = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    for (const [key, data] of buckets) {
      if (key >= todayKey) upcoming += data.length;
      else past += data.length;
    }
    return { upcoming, past };
  }, [buckets, todayKey]);

  const activeWindow: FixtureWindow =
    fixtureWindow ?? (counts.upcoming > 0 ? "yaklasan" : "sonuclar");

  const sections = useMemo<DaySection[]>(() => {
    const picked =
      activeWindow === "yaklasan"
        ? buckets.filter(([key]) => key >= todayKey)
        : buckets.filter(([key]) => key < todayKey).reverse();
    let lastWeek = "";
    return picked.map(([key, data]) => {
      const week = isoWeek(key);
      const weekLabel = week.id !== lastWeek ? week.label : null;
      lastWeek = week.id;
      return {
        title: formatDayHeading(key),
        dayKey: key,
        weekLabel,
        played: data.filter((match) => matchState(match) === "finished").length,
        data: [...data].sort((a, b) => String(a.time).localeCompare(String(b.time))),
      };
    });
  }, [buckets, activeWindow, todayKey]);

  /* Sezon şeridi: oynanmış maç sayısı durumdan, sıradaki gün takvimden. */
  const progress = useMemo(() => {
    let played = 0;
    let total = 0;
    for (const [, data] of buckets) {
      total += data.length;
      for (const match of data) if (matchState(match) === "finished") played += 1;
    }
    const next = buckets.find(
      ([key, data]) => key >= todayKey && data.some((match) => matchState(match) !== "finished"),
    );
    return {
      played,
      total,
      nextLabel: next ? formatDayHeading(next[0]) : null,
      nextCount: next ? next[1].length : 0,
    };
  }, [buckets, todayKey]);

  const windowItems = useMemo(
    () => [
      { key: "yaklasan" as const, label: counts.upcoming ? `Yaklaşan · ${counts.upcoming}` : "Yaklaşan" },
      { key: "sonuclar" as const, label: counts.past ? `Sonuçlar · ${counts.past}` : "Sonuçlar" },
    ],
    [counts],
  );

  const openMatch = useCallback((id: number) => router.push(`/mac/${id}`), [router]);

  const renderItem = useCallback(
    ({ item, index, section }: { item: ApiMatch; index: number; section: DaySection }) => (
      <MatchItem
        match={item}
        homeLogo={teams.logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={teams.logoFor(item.away_team_id, item.second_team_name)}
        position={positionOf(index, section.data.length)}
        favorite={isFavoriteMatch(item.id)}
        onOpen={openMatch}
        onToggleFavorite={toggleFavoriteMatch}
      />
    ),
    [isFavoriteMatch, openMatch, toggleFavoriteMatch, teams],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: DaySection }) => (
      <DayHeader section={section} today={section.dayKey === todayKey} />
    ),
    [todayKey],
  );

  if (!scope.ready && !scope.loading) return <ScopeMissing />;
  if (query.isLoading || scope.loading) {
    return (
      <View style={paneStyles.skeleton}>
        <View style={styles.skeletonStrip} />
        <SkeletonMatchRow count={6} />
      </View>
    );
  }
  if (query.isError && sections.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <SectionList
      {...scrollProps}
      sections={sections}
      keyExtractor={matchKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      renderSectionFooter={renderSectionFooter}
      stickySectionHeadersEnabled
      initialNumToRender={14}
      maxToRenderPerBatch={14}
      windowSize={8}
      contentContainerStyle={[paneStyles.content, styles.content]}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {progress.total > 0 ? (
            <SeasonStrip
              played={progress.played}
              total={progress.total}
              nextLabel={progress.nextLabel}
              nextCount={progress.nextCount}
            />
          ) : null}
          <SegmentedControl
            items={windowItems}
            value={activeWindow}
            onChange={setFixtureWindow}
            size="sm"
          />
          {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          title={activeWindow === "yaklasan" ? "Yaklaşan maç yok" : "Henüz sonuç yok"}
          body={
            activeWindow === "yaklasan"
              ? "Bu sezonun fikstüründe oynanacak maç kalmadı."
              : "Bu sezonda oynanmış maç bulunmuyor."
          }
          action={
            activeWindow === "yaklasan" && counts.past > 0
              ? { label: "Sonuçlara bak", onPress: () => setFixtureWindow("sonuclar") }
              : activeWindow === "sonuclar" && counts.upcoming > 0
                ? { label: "Fikstüre bak", onPress: () => setFixtureWindow("yaklasan") }
                : undefined
          }
          variant="inline"
        />
      }
    />
  );
}

const matchKey = (item: ApiMatch) => String(item.id);

/** Satırın gün grubundaki konumu. */
function positionOf(index: number, total: number): MatchCardPosition {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Gün grupları arasında kısa nefes — bir sonraki yapışkan başlık hemen gelir. */
const renderSectionFooter = () => <View style={styles.sectionGap} />;

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xs,
  },
  header: {
    gap: space.md,
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  sectionGap: {
    height: space.md,
  },
  skeletonStrip: {
    height: 104,
    borderRadius: radius.xl,
    backgroundColor: colors.skeletonBase,
  },
  /* — Sezon şeridi — */
  strip: {
    gap: space.m,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stripTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
  },
  stripText: {
    flex: 1,
    minWidth: 0,
  },
  stripOver: {
    ...type.overline,
    color: colors.textTertiary,
  },
  stripValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  stripOf: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  stripPct: {
    ...type.scoreSm,
    color: colors.brandAccent,
  },
  stripNext: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  nextDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  stripNextText: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  stripNextStrong: {
    fontFamily: type.label.fontFamily,
    color: colors.textPrimary,
  },
  /* — Gün başlığı (yapışkan) — */
  dayWrap: {
    backgroundColor: colors.bg,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  weekBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  weekLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.border,
  },
  weekText: {
    ...type.overline,
    color: colors.brandAccent,
  },
  day: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
  },
  dayTile: {
    width: 42,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  dayTileToday: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  dayNum: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  dayNumToday: {
    color: colors.textOnBrand,
  },
  dayMonth: {
    ...type.overline,
    color: colors.textTertiary,
    marginTop: -2,
  },
  dayMonthToday: {
    color: colors.textOnBrand,
  },
  dayText: {
    flex: 1,
    minWidth: 0,
  },
  dayTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  dayMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  /* Grup köşesi diğer Lig kartlarıyla aynı; satırın kendi köşesini ezer. */
  first: {
    borderTopLeftRadius: GROUP_RADIUS,
    borderTopRightRadius: GROUP_RADIUS,
  },
  last: {
    borderBottomLeftRadius: GROUP_RADIUS,
    borderBottomRightRadius: GROUP_RADIUS,
  },
  single: {
    borderRadius: GROUP_RADIUS,
  },
});

const POSITION_STYLE: Record<MatchCardPosition, object | undefined> = {
  single: styles.single,
  first: styles.first,
  middle: undefined,
  last: styles.last,
};
