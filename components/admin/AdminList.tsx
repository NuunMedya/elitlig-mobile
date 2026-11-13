/**
 * AdminList — yönetim listelerinin tek bileşeni.
 *
 * NE: arama kutusu + filtre çipleri + (isteğe bağlı) sayfalı sonsuz liste.
 * Yükleniyorsa iskelet, boşsa EmptyState, hata varsa ErrorState çizer;
 * aşağı çekince yeniler. Satırı ekran kendisi çizer (`renderItem`).
 *
 * İKİ VERİ MODU:
 *   · `query`: tek seferde gelen liste (useQuery sonucu).
 *   · `infinite`: useInfiniteQuery sonucu; sayfalar `pages[].items` olarak
 *     düzleştirilir, sona gelince bir sonraki sayfa çekilir.
 *
 * Arama metni ekran tarafından tutulur (sorgu anahtarına girer); bileşen
 * yalnız 300ms gecikmeli bildirir — her tuşta istek atılmaz.
 *
 * GÖRÜNÜM (yönetim tasarım dili): başlık bandı = hap arama kutusu → yatay
 * filtre çipleri (sayaçlı) → ek süzgeç → özet satırı ("124 kayıt", solda
 * küçük degrade ray). İlk sekiz satır `Reveal` ile sırayla süzülerek girer;
 * satırlar arası boşluk space.sm, her satır kendi kartıdır (RecordCard).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  Reveal,
  SkeletonListFooter,
  SkeletonListRow,
  refreshControlProps,
} from "@/components/ui";
import { LinearGradient } from "expo-linear-gradient";

import { colors, layout, radius, space, textScale, type } from "@/theme";

export interface FilterOption<T extends string = string> {
  key: T;
  label: string;
  count?: number;
}

export interface AdminListProps<T> {
  data: T[] | undefined;
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Sonsuz kaydırma. */
  onEndReached?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;

  search?: string;
  onSearch?: (text: string) => void;
  searchPlaceholder?: string;

  filters?: FilterOption[];
  filter?: string;
  onFilter?: (key: string) => void;
  /** İkinci filtre satırı (ör. il, sezon). */
  extraHeader?: React.ReactNode;
  /** Liste başındaki özet ("124 kayıt"). */
  summary?: string | null;

  emptyIcon?: React.ComponentProps<typeof EmptyState>["icon"];
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: { label: string; onPress: () => void };

  contentStyle?: StyleProp<ViewStyle>;
  ListFooterComponent?: React.ReactElement | null;
  /** Satırlar arası boşluk (varsayılan space.sm). */
  gap?: number;
}

export function AdminList<T>({
  data,
  renderItem,
  keyExtractor,
  loading,
  error,
  onRetry,
  refreshing = false,
  onRefresh,
  onEndReached,
  hasMore,
  loadingMore,
  search,
  onSearch,
  searchPlaceholder = "Ara",
  filters,
  filter,
  onFilter,
  extraHeader,
  summary,
  emptyIcon = "file-tray-outline",
  emptyTitle = "Kayıt yok",
  emptyBody,
  emptyAction,
  contentStyle,
  ListFooterComponent,
  gap = space.sm,
}: AdminListProps<T>) {
  const [text, setText] = useState(search ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (search !== undefined && search !== text && !timer.current) setText(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const changeText = useCallback(
    (value: string) => {
      setText(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        onSearch?.(value.trim());
      }, 300);
    },
    [onSearch]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const header = (
    <View style={styles.header}>
      {onSearch ? (
        <Input
          variant="search"
          leadingIcon="search"
          value={text}
          onChangeText={changeText}
          placeholder={searchPlaceholder}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      ) : null}
      {filters?.length ? (
        <ChipGroup scrollable contentPadding={0}>
          {filters.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              count={option.count}
              selected={filter === option.key}
              onPress={() => onFilter?.(option.key)}
              size="sm"
            />
          ))}
        </ChipGroup>
      ) : null}
      {extraHeader}
      {summary ? (
        <View style={styles.summaryRow}>
          <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.summaryRail} />
          <Text style={styles.summary} numberOfLines={1} {...textScale.dense}>
            {summary}
          </Text>
        </View>
      ) : null}
      {error && data?.length ? <ErrorState error={error} onRetry={onRetry} variant="banner" /> : null}
    </View>
  );

  const empty = loading ? (
    <SkeletonListRow count={6} />
  ) : error ? (
    <ErrorState error={error} onRetry={onRetry} variant="inline" />
  ) : (
    <EmptyState
      icon={emptyIcon}
      title={emptyTitle}
      body={emptyBody}
      action={emptyAction}
      variant="inline"
    />
  );

  const Separator = useCallback(() => <View style={{ height: gap }} />, [gap]);

  /* İlk sekiz satır sırayla süzülür; sonrakiler (kaydırınca gelenler) doğrudan. */
  const renderRow = useCallback<ListRenderItem<T>>(
    (info) => {
      const node = renderItem(info);
      return info.index < 8 ? <Reveal index={info.index}>{node}</Reveal> : node;
    },
    [renderItem]
  );

  return (
    <FlatList
      data={data ?? []}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={Separator}
      ListFooterComponent={
        loadingMore ? <SkeletonListFooter /> : ListFooterComponent ?? <View style={styles.footerSpace} />
      }
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReachedThreshold={0.4}
      onEndReached={hasMore && !loadingMore ? onEndReached : undefined}
      refreshControl={onRefresh ? <RefreshControl {...refreshControlProps(refreshing, onRefresh)} /> : undefined}
      initialNumToRender={12}
      windowSize={9}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant * 2,
  },
  header: {
    gap: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingTop: space.xs,
  },
  summaryRail: { width: 3, height: 12, borderRadius: radius.pill },
  summary: {
    ...type.labelSm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  footerSpace: { height: space.xl },
});
