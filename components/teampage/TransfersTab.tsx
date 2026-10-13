/**
 * 6) TRANSFERLER — zaman çizelgesi.
 *
 * SUNUCUDA "gelen/giden" AYRIMI VEREN KAMUYA AÇIK UÇ YOK: transfer teklifleri
 * (`/api/transfer-offers/*`) yalnız takım başkanının panelinde görünür. Kamuya
 * açık tek kaynak, tamamlanan transferleri de yayımlayan haber akışıdır
 * (`/api/news/feed` → `kind: "transfer"`). Bu yüzden liste "hareket" olarak
 * gösterilir; yön bilgisi UYDURULMAZ, kayıt yoksa boş durum çizilir.
 *
 * NEDEN ÇİZELGE: transfer bir OLAYDIR ve sırası anlamlıdır. Eski liste
 * ayar satırlarıyla aynı görünüyordu (ikon · başlık · sağda "3 gün önce");
 * çizelgede tarih sol rayda, olay sağda durur ve göz yukarıdan aşağı zamanı
 * takip eder. Kart yok — hiyerarşi tipografiyle kurulur (Arena §1.3).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorState, SectionHeader, SkeletonListRow, Touchable } from "@/components/ui";
import { formatDateShort, timeAgo } from "@/lib/format";
import type { NewsItem } from "@/lib/types";
import { colors, layout, radius, space, textScale, type } from "@/theme";
import type { TabShell } from "./model";

export interface TransfersTabProps extends TabShell {
  items: NewsItem[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpenNews: (newsId: string) => void;
}

export function TransfersTab({
  scrollProps,
  refreshControl,
  items,
  loading,
  error,
  onRetry,
  onOpenNews,
}: TransfersTabProps) {
  return (
    <ScrollView
      {...scrollProps}
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SectionHeader title="Transfer hareketleri" meta={items.length ? `${items.length} kayıt` : undefined} />

      {loading ? (
        <SkeletonListRow count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} variant="inline" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="Transfer kaydı yok"
          body="Takıma gelen ya da takımdan ayrılan oyuncu duyurusu yayımlandığında burada görünecek."
          variant="inline"
        />
      ) : (
        <View style={styles.timeline}>
          {items.map((item, index) => (
            <TimelineItem
              key={item.id}
              newsId={item.id}
              title={item.title}
              summary={item.summary ?? null}
              publishedAt={item.published_at ?? null}
              first={index === 0}
              last={index === items.length - 1}
              onPress={onOpenNews}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const TimelineItem = React.memo(function TimelineItem({
  newsId,
  title,
  summary,
  publishedAt,
  first,
  last,
  onPress,
}: {
  newsId: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  first: boolean;
  last: boolean;
  onPress: (newsId: string) => void;
}) {
  const handlePress = useCallback(() => onPress(newsId), [onPress, newsId]);
  const date = publishedAt ? formatDateShort(publishedAt) : "";
  const ago = publishedAt ? timeAgo(publishedAt) : "";

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${date ? `, ${date}` : ""}`}
      style={styles.item}
    >
      {/* Ray: düğüm + üst/alt çizgi. İlk öğenin üstü, son öğenin altı boş. */}
      <View style={styles.rail}>
        <View style={[styles.line, first ? styles.lineHidden : null]} />
        <View style={[styles.node, first ? styles.nodeFirst : null]}>
          <Ionicons name="swap-horizontal" size={12} color={first ? colors.textOnBrand : colors.brandAccent} />
        </View>
        <View style={[styles.line, styles.lineGrow, last ? styles.lineHidden : null]} />
      </View>

      <View style={styles.body}>
        {date ? (
          <Text style={styles.date} {...textScale.badge}>
            {date.toLocaleUpperCase("tr-TR")}
            {ago ? <Text style={styles.ago}>{`  ·  ${ago}`}</Text> : null}
          </Text>
        ) : null}
        <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
          {title}
        </Text>
        {summary ? (
          <Text style={styles.summary} numberOfLines={3} {...textScale.long}>
            {summary}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
});

const NODE = 26;

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xs,
    paddingBottom: space.huge,
  },
  timeline: {
    paddingHorizontal: layout.screenPadding,
  },
  item: {
    flexDirection: "row",
    gap: space.md,
    borderRadius: radius.md,
  },
  rail: {
    width: NODE,
    alignItems: "center",
  },
  line: {
    width: 2,
    height: space.md,
    backgroundColor: colors.border,
  },
  lineGrow: {
    flex: 1,
  },
  lineHidden: {
    backgroundColor: "transparent",
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  nodeFirst: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
    paddingTop: space.md + space.xxs,
    paddingBottom: space.xl,
  },
  date: {
    ...type.overline,
    color: colors.textTertiary,
  },
  ago: {
    ...type.caption,
    color: colors.textTertiary,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
  },
  summary: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
});
