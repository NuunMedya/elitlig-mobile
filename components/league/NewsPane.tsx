/**
 * NewsPane — editör haberleri + üretilmiş duyurular (Lig merkezinin "Haber" bölmesi).
 *
 * ESKİ HÂL: her öğe aynı kart — kapak görseli 140px, rozet, başlık, özet.
 * Akışın %90'ı transfer duyurusu ve onların "kapağı" oyuncunun vesikalık
 * fotoğrafıydı: ekran, tam genişliğe gerilmiş bulanık portrelerden oluşan
 * bir duvara dönüyordu ve tek gerçek haber aralarında kayboluyordu.
 *
 * YENİ DÜZEN — İKİ AĞIRLIK:
 *   · MANŞET: en yeni editör haberi (kapaklı) tam genişlikte, 16:9 görsel +
 *     büyük başlık. Okunacak şey odur.
 *   · AKIŞ: kalan her şey tek bir kartta yoğun satırlar. Editör haberi sağda
 *     kare küçük görsel taşır; transfer/disiplin duyurusu solda oyuncunun
 *     yuvarlak fotoğrafını ve (varsa) yeni takımının armasını taşır — bir
 *     duyuru portre değil, "kim → nereye" bilgisidir.
 *
 * DOKUNMA: editör haberi detay sayfasına gider. Üretilmiş duyurunun detay
 * sayfası yoktur; sunucu `meta` alanında oyuncu kimliği gönderiyorsa satır
 * oyuncu sayfasını açar, göndermiyorsa satır basılamaz (uydurma bağlantı yok).
 * `meta` tip tanımında bulunmadığı için savunmacı okunur (bkz. haber/[id].tsx).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useRefresh,
} from "@/components/ui";
import { getNewsFeed } from "@/lib/api/news";
import { mediaUrl, timeAgo } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { NewsItem } from "@/lib/types";
import { colors, layout, radius, space, textScale, type, upperTR } from "@/theme";
import { GroupSeparator, groupRowStyle, groupStyles, paneStyles, useScopeKey, type PaneProps } from "./shared";

type NewsFilter = "all" | NewsItem["kind"];

const NEWS_FILTERS: { key: NewsFilter; label: string; icon?: "newspaper-outline" | "swap-horizontal" | "warning-outline" }[] = [
  { key: "all", label: "Tümü" },
  { key: "news", label: "Haberler", icon: "newspaper-outline" },
  { key: "transfer", label: "Transferler", icon: "swap-horizontal" },
  { key: "penalty", label: "Cezalar", icon: "warning-outline" },
];

const KIND_LABEL: Record<NewsItem["kind"], string> = {
  news: "Haber",
  transfer: "Transfer",
  penalty: "Disiplin",
};

/** Üretilmiş duyuruların taşıdığı ilişki bilgisi — tipte yok, savunmacı okunur. */
interface FeedMeta {
  player_id?: number | null;
  player_name?: string | null;
  team_id?: number | null;
  team_name?: string | null;
  team_logo?: string | null;
}

function metaOf(item: NewsItem): FeedMeta | null {
  const raw = (item as NewsItem & { meta?: unknown }).meta;
  return raw && typeof raw === "object" ? (raw as FeedMeta) : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Manşet
   ══════════════════════════════════════════════════════════════════════════ */

const FeaturedCard = React.memo(function FeaturedCard({
  item,
  onOpen,
}: {
  item: NewsItem;
  onOpen: (id: string) => void;
}) {
  const cover = mediaUrl(item.cover_image_url);
  const open = useCallback(() => onOpen(item.id), [item.id, onOpen]);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={open}
      style={[groupStyles.card, styles.featured]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {cover ? (
        <View style={styles.featuredCover}>
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
      ) : null}
      <View style={styles.featuredBody}>
        <Text style={styles.kicker} {...textScale.badge}>
          {upperTR(item.category_label || "Manşet")}
          <Text style={styles.kickerTime}>{`  ·  ${timeAgo(item.published_at)}`}</Text>
        </Text>
        <Text style={styles.featuredTitle} numberOfLines={3} {...textScale.dense}>
          {item.title}
        </Text>
        {item.summary ? (
          <Text style={styles.featuredSummary} numberOfLines={2} {...textScale.long}>
            {item.summary.trim()}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Akış satırı
   ══════════════════════════════════════════════════════════════════════════ */

const FeedRow = React.memo(function FeedRow({
  item,
  style,
  onOpenNews,
  onOpenPlayer,
}: {
  item: NewsItem;
  style: object;
  onOpenNews: (id: string) => void;
  onOpenPlayer: (id: number) => void;
}) {
  const meta = metaOf(item);
  const cover = mediaUrl(item.cover_image_url);
  const editorial = item.kind === "news";
  const playerId = meta?.player_id ?? null;

  const handlePress = useCallback(() => {
    if (editorial) onOpenNews(item.id);
    else if (playerId) onOpenPlayer(playerId);
  }, [editorial, item.id, onOpenNews, onOpenPlayer, playerId]);
  const pressable = editorial || Boolean(playerId);

  const content = (
    <>
      {!editorial ? (
        <Avatar
          name={meta?.player_name ?? item.title}
          image={cover}
          size={44}
          badge={
            meta?.team_name ? (
              <TeamLogo name={meta.team_name} logo={meta.team_logo ?? null} size={18} />
            ) : undefined
          }
        />
      ) : null}
      <View style={styles.rowBody}>
        <View style={styles.rowKicker}>
          {item.kind === "penalty" ? (
            <Ionicons name="warning" size={11} color={colors.danger} />
          ) : item.kind === "transfer" ? (
            <Ionicons name="swap-horizontal" size={11} color={colors.accentText} />
          ) : null}
          <Text
            style={[
              styles.rowKind,
              item.kind === "penalty" ? styles.rowKindPenalty : null,
              item.kind === "transfer" ? styles.rowKindTransfer : null,
            ]}
            {...textScale.badge}
          >
            {upperTR(KIND_LABEL[item.kind])}
          </Text>
          <Text style={styles.rowTime} numberOfLines={1} {...textScale.badge}>
            {timeAgo(item.published_at)}
          </Text>
        </View>
        <Text style={styles.rowTitle} numberOfLines={2} {...textScale.dense}>
          {item.title}
        </Text>
        {!editorial && item.summary ? (
          <Text style={styles.rowSummary} numberOfLines={1} {...textScale.dense}>
            {item.summary.trim()}
          </Text>
        ) : null}
      </View>
      {editorial && cover ? (
        <View style={styles.thumb}>
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
      ) : null}
    </>
  );

  if (!pressable) return <View style={[styles.row, style]}>{content}</View>;
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={[styles.row, style]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {content}
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Bölme
   ══════════════════════════════════════════════════════════════════════════ */

export function NewsPane({ scrollProps }: PaneProps) {
  const scopeKey = useScopeKey();
  const router = useRouter();
  const [filter, setFilter] = useState<NewsFilter>("all");

  // Haberler kapsam seçilmeden de gösterilebilir: kapsamsız istek "tümü" demektir.
  const query = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    staleTime: 2 * 60_000,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const all = useMemo(() => query.data?.items ?? [], [query.data]);
  const counts = useMemo(() => {
    const out: Record<NewsFilter, number> = { all: all.length, news: 0, transfer: 0, penalty: 0 };
    for (const item of all) out[item.kind] += 1;
    return out;
  }, [all]);

  const { featured, feed } = useMemo(() => {
    const visible = filter === "all" ? all : all.filter((item) => item.kind === filter);
    // Manşet: kapaklı en yeni editör haberi (sabitlenmiş olan önce).
    const candidates = visible.filter((item) => item.kind === "news" && item.cover_image_url);
    const top = candidates.find((item) => item.pinned) ?? candidates[0] ?? null;
    return { featured: top, feed: top ? visible.filter((item) => item !== top) : visible };
  }, [all, filter]);

  const openNews = useCallback(
    (id: string) => router.push({ pathname: "/haber/[id]", params: { id } }),
    [router],
  );
  const openPlayer = useCallback((id: number) => router.push(`/oyuncu/${id}`), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: NewsItem; index: number }) => (
      <FeedRow
        item={item}
        style={groupRowStyle(index, feed.length, false)}
        onOpenNews={openNews}
        onOpenPlayer={openPlayer}
      />
    ),
    [feed.length, openNews, openPlayer],
  );

  if (query.isLoading) {
    return (
      <View style={paneStyles.skeleton}>
        <Skeleton height={36} width="70%" radius="pill" />
        <Skeleton height={190} radius="xl" />
        <SkeletonListRow count={5} />
      </View>
    );
  }
  if (query.isError && all.length === 0) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <FlatList
      {...scrollProps}
      data={feed}
      keyExtractor={newsKey}
      renderItem={renderItem}
      ItemSeparatorComponent={GroupSeparator}
      initialNumToRender={10}
      windowSize={8}
      contentContainerStyle={paneStyles.content}
      refreshControl={
        <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <ChipGroup style={styles.chips}>
            {NEWS_FILTERS.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                icon={item.icon}
                count={item.key === "all" ? undefined : counts[item.key]}
                selected={item.key === filter}
                size="sm"
                onPress={() => setFilter(item.key)}
              />
            ))}
          </ChipGroup>
          {query.isError ? <ErrorState error={query.error} variant="banner" /> : null}
          {featured ? <FeaturedCard item={featured} onOpen={openNews} /> : null}
        </View>
      }
      ListEmptyComponent={
        featured ? null : (
          <EmptyState
            icon="newspaper-outline"
            title={filter === "all" ? "Haber yok" : `${NEWS_FILTERS.find((f) => f.key === filter)?.label ?? ""} yok`}
            body="Bu kapsamda yayımlanmış içerik bulunmuyor."
            action={filter !== "all" ? { label: "Tümünü göster", onPress: () => setFilter("all") } : undefined}
            variant="inline"
          />
        )
      }
    />
  );
}

const newsKey = (item: NewsItem) => `${item.kind}-${item.id}`;

const THUMB = 72;

const styles = StyleSheet.create({
  header: {
    gap: space.md,
    paddingBottom: space.md,
  },
  chips: {
    marginHorizontal: -layout.screenPadding,
  },
  /* — Manşet — */
  featured: {
    overflow: "hidden",
  },
  featuredCover: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface3,
  },
  featuredBody: {
    padding: space.lg,
    gap: space.s,
  },
  kicker: {
    ...type.overline,
    color: colors.brandAccent,
  },
  kickerTime: {
    color: colors.textTertiary,
  },
  featuredTitle: {
    ...type.h1,
    color: colors.textPrimary,
  },
  featuredSummary: {
    ...type.body,
    color: colors.textSecondary,
  },
  /* — Akış satırı — */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 76,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  rowKicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  rowKind: {
    ...type.overline,
    color: colors.brandAccent,
  },
  rowKindTransfer: {
    color: colors.accentText,
  },
  rowKindPenalty: {
    color: colors.danger,
  },
  rowTime: {
    ...type.caption,
    color: colors.textTertiary,
    marginLeft: space.xs,
    flexShrink: 1,
  },
  rowTitle: {
    ...type.h4,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  rowSummary: {
    ...type.caption,
    color: colors.textTertiary,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
});
