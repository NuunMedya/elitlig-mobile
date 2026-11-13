/**
 * NewsPane — editör haberleri + üretilmiş duyurular (Lig merkezinin "Haber" bölmesi).
 *
 * ESKİ HÂL: her öğe aynı kart — kapak görseli 140px, rozet, başlık, özet.
 * Akışın %90'ı transfer duyurusu ve onların "kapağı" oyuncunun vesikalık
 * fotoğrafıydı: ekran, tam genişliğe gerilmiş bulanık portrelerden oluşan
 * bir duvara dönüyordu ve tek gerçek haber aralarında kayboluyordu.
 *
 * YENİ DÜZEN — İKİ AĞIRLIK:
 *   · MANŞET: en yeni editör haberi (kapaklı) tam genişlikte, 2:1 görsel +
 *     15px başlık. Okunacak şey odur.
 *   · AKIŞ: kalan her şey tek bir kartta yoğun satırlar (12px başlık). Editör
 *     haberi sağda 48px kare görsel taşır; transfer/disiplin duyurusu solda
 *     oyuncunun 32px yuvarlak fotoğrafını ve (varsa) yeni takımının armasını
 *     taşır — bir duyuru portre değil, "kim → nereye" bilgisidir.
 *
 * İKİNCİ TUR:
 *   · MANŞET KAPAKLI SAHNE: kapak 16:10, altında koyu scrim degradesi;
 *     kategori rozeti, zaman, başlık (beyaz, h1) ve özet görselin ÜSTÜNDE.
 *     Scrim iki temada da koyudur, metin `onDark` — açık temada okunmayan
 *     siyah başlık sorunu bu yüzden doğmaz.
 *   · AKIŞ BAŞLIĞI: "Son gelişmeler · 16" — manşetle akış ayrışır.
 *   · SATIR: tür rozeti (`Badge` soft: haber mor, transfer camgöbeği, disiplin
 *     kırmızı) + zaman; başlık 13px yarı kalın, iki satır. Editör haberi
 *     solda 64px kare kapak; duyuru solda 40px oyuncu fotoğrafı + yeni
 *     takımın arması. Satırlar ilk açılışta sırayla gelir.
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
import { LinearGradient } from "expo-linear-gradient";
import { FlatList, Image, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Reveal,
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
import { GroupSeparator, groupRowStyle, paneStyles, useScopeKey, type PaneProps } from "./shared";

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

const KIND_TONE: Record<NewsItem["kind"], "brand" | "accent" | "danger"> = {
  news: "brand",
  transfer: "accent",
  penalty: "danger",
};

const KIND_ICON: Record<NewsItem["kind"], "newspaper-outline" | "swap-horizontal" | "warning-outline"> = {
  news: "newspaper-outline",
  transfer: "swap-horizontal",
  penalty: "warning-outline",
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
      style={styles.featured}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.featuredCover}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" resizeMethod="resize" />
        ) : null}
        <LinearGradient
          colors={[colors.scrimGradientTop, colors.scrimGradientBottom]}
          locations={[0.25, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.featuredTopRow}>
          <Badge label="Manşet" tone="brand" variant="solid" size="xs" icon="flash" />
        </View>
        <View style={styles.featuredBody}>
          <Text style={styles.kicker} numberOfLines={1} {...textScale.badge}>
            {upperTR(item.category_label || "Haber")}
            <Text style={styles.kickerTime}>{`  ·  ${timeAgo(item.published_at)}`}</Text>
          </Text>
          <Text style={styles.featuredTitle} numberOfLines={3} {...textScale.dense}>
            {item.title}
          </Text>
          {item.summary ? (
            <Text style={styles.featuredSummary} numberOfLines={2} {...textScale.dense}>
              {item.summary.trim()}
            </Text>
          ) : null}
        </View>
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
      {editorial ? (
        <View style={styles.thumb}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" resizeMethod="resize" />
          ) : (
            <View style={styles.thumbEmpty}>
              <Ionicons name="newspaper-outline" size={22} color={colors.textTertiary} />
            </View>
          )}
        </View>
      ) : (
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
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowKicker}>
          <Badge label={KIND_LABEL[item.kind]} tone={KIND_TONE[item.kind]} size="xs" icon={KIND_ICON[item.kind]} />
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
      {pressable ? <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} /> : null}
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
      <Reveal index={index} limit={8} distance={8}>
        <FeedRow
          item={item}
          style={groupRowStyle(index, feed.length, false)}
          onOpenNews={openNews}
          onOpenPlayer={openPlayer}
        />
      </Reveal>
    ),
    [feed.length, openNews, openPlayer],
  );

  if (query.isLoading) {
    return (
      <View style={paneStyles.skeleton}>
        <Skeleton height={28} width="70%" radius="pill" />
        <Skeleton height={220} radius="xl" />
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
          {featured ? (
            <Reveal index={0} scaleFrom={0.97}>
              <FeaturedCard item={featured} onOpen={openNews} />
            </Reveal>
          ) : null}
          {feed.length > 0 ? (
            <View style={styles.feedHead}>
              <Text style={styles.feedTitle} {...textScale.dense}>
                Son gelişmeler
              </Text>
              <Text style={styles.feedMeta} {...textScale.dense}>
                {`${feed.length} içerik`}
              </Text>
            </View>
          ) : null}
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

const THUMB = 64;

const styles = StyleSheet.create({
  header: {
    gap: space.md,
    paddingBottom: space.sm,
  },
  chips: {
    marginHorizontal: -layout.screenPadding,
  },
  /* — Manşet — */
  featured: {
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  /* 16:10 — kapak manşeti taşır; metin scrim'in üstünde. */
  featuredCover: {
    aspectRatio: 1.6,
    justifyContent: "space-between",
    backgroundColor: colors.inkBlock,
  },
  featuredTopRow: {
    flexDirection: "row",
    padding: space.md,
  },
  featuredBody: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.xs,
  },
  kicker: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  kickerTime: {
    color: colors.onDarkMuted,
  },
  featuredTitle: {
    ...type.h1,
    color: colors.onDark,
  },
  featuredSummary: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  feedHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingTop: space.md,
    paddingHorizontal: space.xxs,
  },
  feedTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  feedMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  /* — Akış satırı — */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    minHeight: 72,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  rowKicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  rowTime: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  rowTitle: {
    ...type.h4,
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
  thumbEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
