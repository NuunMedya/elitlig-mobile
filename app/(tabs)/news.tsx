import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getNewsFeed } from "@/lib/api/news";
import { mediaUrl, stripHtml, timeAgo } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { NewsItem } from "@/lib/types";

type Filter = "all" | NewsItem["kind"];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "news", label: "Haberler" },
  { key: "transfer", label: "Transferler" },
  { key: "penalty", label: "Cezalar" },
];

/**
 * Haber akışı — sitedeki "Duyurular & Haberler" bölümünün mobil karşılığı.
 *
 * İki görsel katman vardır: editör haberleri (kind=news) kapaklı büyük
 * kartlarla, üretilmiş duyurular (transfer, disiplin) sitedeki gibi renkli
 * rozetli kompakt satırlarla gösterilir. Üstteki çiplerle türe göre süzülür.
 */
export default function NewsScreen() {
  const scope = useScope();
  const [filter, setFilter] = useState<Filter>("all");
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    // Haberler kapsam seçilmeden de gösterilebilir: kapsamsız istek "tümü" demektir.
    staleTime: 2 * 60_000,
  });

  const items = query.data?.items ?? [];
  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.kind === filter)),
    [items, filter]
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Haberler" />
      <ScopeBar />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersWrap}
      >
        {FILTERS.map((item) => {
          const active = item.key === filter;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={({ pressed }) => [
                styles.filterChip,
                active && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          renderItem={({ item, index }) =>
            item.kind === "news"
              ? (index === 0 && filter === "all")
                ? <HeroCard item={item} />
                : <NewsCard item={item} />
              : <AnnouncementRow item={item} />
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={query.refetch}
              tintColor={colors.turf}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="newspaper-outline"
              title="Haber yok"
              body="Bu kapsamda bu türde yayınlanmış bir içerik bulunmuyor."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** İlk haber — tam genişlik hero; gradient başlık. */
function HeroCard({ item }: { item: NewsItem }) {
  const router = useRouter();
  const cover = mediaUrl(item.cover_image_url);
  const mins  = Math.max(1, Math.ceil(stripHtml(item.content, 99999).split(" ").length / 200));

  return (
    <Pressable
      onPress={() => router.push(`/haber/${item.id}`)}
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
    >
      {cover ? (
        <Image source={{ uri: cover }} style={styles.heroCover} resizeMode="cover" />
      ) : (
        <View style={[styles.heroCover, styles.heroCoverFallback]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.82)"]}
        style={styles.heroGrad}
      >
        <View style={styles.heroMeta}>
          <View style={[styles.pill, styles.pillNews]}>
            <Text style={styles.pillText}>
              {(item.category_label || "HABER").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
          {item.pinned ? (
            <View style={[styles.pill, styles.pillBreaking]}>
              <Text style={styles.pillText}>SON DAKİKA</Text>
            </View>
          ) : null}
          <Text style={styles.heroTime}>{timeAgo(item.published_at)}</Text>
          <Text style={styles.heroReadTime}>{mins} dk okuma</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={3}>{item.title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Editör haberi — kapaklı büyük kart; detay sayfası vardır. */
function NewsCard({ item }: { item: NewsItem }) {
  const router = useRouter();
  const cover = mediaUrl(item.cover_image_url);
  const summary = item.summary?.trim() || stripHtml(item.content, 160);
  const mins = Math.max(1, Math.ceil(stripHtml(item.content, 99999).split(" ").length / 200));

  return (
    <Pressable
      onPress={() => router.push(`/haber/${item.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {cover ? <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" /> : null}
      <View style={styles.cardBody}>
        <View style={styles.badgeRow}>
          <View style={[styles.pill, styles.pillNews]}>
            <Text style={styles.pillText}>
              {(item.category_label || "HABER").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
          {item.pinned ? (
            <View style={[styles.pill, styles.pillBreaking]}>
              <Text style={styles.pillText}>SON DAKİKA</Text>
            </View>
          ) : null}
          <Text style={styles.time}>{timeAgo(item.published_at)}</Text>
          <Text style={styles.readTime}>{mins} dk</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {summary ? <Text style={styles.summary} numberOfLines={2}>{summary}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Üretilmiş duyuru — renkli sol şerit + ikon + başlık + zaman. */
function AnnouncementRow({ item }: { item: NewsItem }) {
  const penalty  = item.kind === "penalty";
  const accent   = penalty ? "#B4232A" : colors.turf;
  const icon     = penalty ? "shield-outline" : "swap-horizontal-outline";

  return (
    <View style={[styles.row, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
      <Ionicons name={icon as any} size={16} color={accent} />
      <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
      <View style={styles.rowRight}>
        <View style={[styles.pill, penalty ? styles.pillPenalty : styles.pillTransfer]}>
          <Text style={styles.pillText}>{penalty ? "CEZA" : "TRANSFER"}</Text>
        </View>
        <Text style={styles.rowTime}>{timeAgo(item.published_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  filtersWrap: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filters: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  filterChipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  filterText: {
    ...type.caption,
    color: colors.muted,
  },
  filterTextActive: {
    color: colors.surface,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  hero: {
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.sm,
    height: 240,
  },
  heroCover: {
    ...StyleSheet.absoluteFillObject,
  },
  heroCoverFallback: {
    backgroundColor: colors.turfDim,
  },
  heroGrad: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: spacing.md,
    gap: spacing.sm,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  heroTime: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    marginLeft: "auto",
  },
  heroReadTime: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#FFFFFF",
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  pillBreaking: {
    backgroundColor: colors.live,
  },
  readTime: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginLeft: "auto",
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    width: "100%",
    height: 160,
    backgroundColor: colors.surfaceRaised,
  },
  cardBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  pillNews: {
    backgroundColor: colors.turf,
  },
  pillTransfer: {
    backgroundColor: "#2F3A56",
  },
  pillPenalty: {
    backgroundColor: "#B4232A",
  },
  pillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#FFFFFF",
  },
  time: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginLeft: "auto",
  },
  title: {
    ...type.subtitle,
    color: colors.line,
    lineHeight: 22,
  },
  summary: {
    ...type.small,
    color: colors.muted,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  rowTitle: {
    ...type.small,
    color: colors.line,
    fontWeight: "600",
    flex: 1,
  },
  rowTime: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
});
