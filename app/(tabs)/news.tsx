import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
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

/**
 * Haber akışı — /api/news/feed
 *
 * Uç, editör haberlerini, tamamlanan transferleri ve disiplin kararlarını tek
 * listede birleştirip yayın tarihine göre sıralar; sabitlenen haberler başa
 * gelir. Yalnızca `kind === "news"` olanların detay sayfası vardır.
 */
export default function NewsScreen() {
  const scope = useScope();
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

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Haberler" />
      <ScopeBar />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          renderItem={({ item }) => <FeedCard item={item} />}
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
              body="Bu kapsamda henüz yayınlanmış bir haber bulunmuyor."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const KIND_META: Record<NewsItem["kind"], { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  news: { icon: "newspaper-outline", label: "Haber", color: colors.turf },
  transfer: { icon: "swap-horizontal-outline", label: "Transfer", color: "#5AA9E6" },
  penalty: { icon: "warning-outline", label: "Disiplin", color: colors.yellow },
};

function FeedCard({ item }: { item: NewsItem }) {
  const meta = KIND_META[item.kind] ?? KIND_META.news;
  const cover = mediaUrl(item.cover_image_url);
  const summary = item.summary?.trim() || stripHtml(item.content, 160);

  const body = (
    <View style={styles.card}>
      {cover ? <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" /> : null}

      <View style={styles.cardBody}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
            <Ionicons name={meta.icon} size={12} color={meta.color} />
            <Text style={[styles.badgeText, { color: meta.color }]}>
              {item.category_label || meta.label}
            </Text>
          </View>
          {item.pinned ? <Ionicons name="pin" size={13} color={colors.muted} /> : null}
          <Text style={styles.time}>{timeAgo(item.published_at)}</Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {summary ? (
          <Text style={styles.summary} numberOfLines={3}>
            {summary}
          </Text>
        ) : null}
      </View>
    </View>
  );

  // Transfer ve disiplin kayıtları üretilmiş duyurulardır; ayrı detayları yoktur.
  if (item.kind !== "news") return body;

  return (
    <Link href={`/haber/${item.id}`} asChild>
      <Pressable style={({ pressed }) => pressed && styles.pressed}>{body}</Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
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
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...type.caption,
    letterSpacing: 0.3,
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
});
