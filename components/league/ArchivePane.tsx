/**
 * ArchivePane — geçmiş sezonlara geçiş (Lig merkezinin "Arşiv" bölmesi).
 *
 * Bir sezona dokunmak uygulamayı o sezona GEÇİRİR (kapsam değişir) ve Puan
 * bölmesine döner: arşiv ayrı bir ekran değil, aynı lig merkezinin geçmişe
 * bakan hâlidir. Seçili sezon satırı vurgulanır; tamamlanmış sezonlar
 * "Tamamlandı" rozeti taşır. Yıldız ayrı dokunma alanıdır — satıra basmak
 * sezona geçer, yıldız yalnız favoriye alır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import {
  Badge,
  EmptyState,
  ListRow,
  SkeletonListRow,
  Touchable,
} from "@/components/ui";
import type { MetaSeason } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, space, textScale, touchSlop, type } from "@/theme";
import { PaneLabel, paneStyles, type PaneProps } from "./shared";

const SeasonItem = React.memo(function SeasonItem({
  seasonId,
  label,
  year,
  current,
  archived,
  favorite,
  position,
  onPress,
  onToggleFavorite,
}: {
  seasonId: number;
  label: string;
  year: number | null;
  current: boolean;
  archived: boolean;
  favorite: boolean;
  position: "single" | "first" | "middle" | "last";
  onPress: (seasonId: number) => void;
  onToggleFavorite: (seasonId: number, label: string) => void;
}) {
  const handlePress = useCallback(() => onPress(seasonId), [onPress, seasonId]);
  const handleStar = useCallback(
    () => onToggleFavorite(seasonId, label),
    [label, onToggleFavorite, seasonId],
  );

  return (
    <ListRow
      position={position}
      title={label}
      subtitle={year ? String(year) : undefined}
      onPress={handlePress}
      highlighted={current}
      chevron={false}
      leading={{ icon: current ? "calendar" : "calendar-outline", tone: current ? "brand" : "neutral" }}
      trailing={
        <View style={styles.trailing}>
          {current ? <Badge label="Seçili" tone="brand" size="xs" /> : null}
          {!current && archived ? <Badge label="Tamamlandı" tone="neutral" size="xs" /> : null}
          <Touchable
            onPress={handleStar}
            feedback="icon"
            haptic="light"
            hitSlop={touchSlop(20)}
            accessibilityRole="button"
            accessibilityLabel={favorite ? "Sezonu favorilerden çıkar" : "Sezonu favoriye al"}
          >
            <Ionicons
              name={favorite ? "star" : "star-outline"}
              size={18}
              color={favorite ? colors.star : colors.starEmpty}
            />
          </Touchable>
        </View>
      }
    />
  );
});

export interface ArchivePaneProps extends PaneProps {
  /** Sezon seçildikten sonra Puan bölmesine dön. */
  onGoStandings: () => void;
}

export function ArchivePane({ scrollProps, onGoStandings }: ArchivePaneProps) {
  const scope = useScope();
  const { isFavoriteSeason, toggleFavoriteSeason } = useFavorite();
  const seasons = scope.seasons;

  const openSeason = useCallback(
    (seasonId: number) => {
      scope.selectSeason(seasonId);
      onGoStandings();
    },
    [onGoStandings, scope],
  );

  const starSeason = useCallback(
    (seasonId: number, label: string) => toggleFavoriteSeason({ id: seasonId, name: label }),
    [toggleFavoriteSeason],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MetaSeason; index: number }) => (
      <SeasonItem
        seasonId={item.id}
        label={item.label}
        year={item.season_year ?? null}
        current={item.id === scope.seasonId}
        archived={Boolean(item.is_archived)}
        favorite={isFavoriteSeason(item.id)}
        position={
          seasons.length === 1
            ? "single"
            : index === 0
              ? "first"
              : index === seasons.length - 1
                ? "last"
                : "middle"
        }
        onPress={openSeason}
        onToggleFavorite={starSeason}
      />
    ),
    [isFavoriteSeason, openSeason, scope.seasonId, seasons.length, starSeason],
  );

  if (scope.loading && seasons.length === 0) {
    return (
      <View style={paneStyles.skeleton}>
        <SkeletonListRow count={6} />
      </View>
    );
  }

  return (
    <FlatList
      {...scrollProps}
      data={seasons}
      keyExtractor={seasonKey}
      renderItem={renderItem}
      contentContainerStyle={paneStyles.content}
      ListHeaderComponent={
        seasons.length > 0 ? (
          <View style={styles.header}>
            <View style={styles.intro}>
              <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
              <Text style={styles.introText} {...textScale.long}>
                Bir sezona dokun: puan durumu, fikstür ve oyuncular o sezonun verisiyle açılır.
              </Text>
            </View>
            <PaneLabel
              title={`${scope.leagueLabel || "Lig"} sezonları`}
              meta={`${seasons.length} sezon`}
            />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon="archive-outline"
          title="Arşiv boş"
          body="Bu ligde listelenecek sezon bulunmuyor."
          action={{ label: "Lig seç", onPress: () => scope.openScopeSheet("league") }}
        />
      }
    />
  );
}

const seasonKey = (item: { id: number }) => String(item.id);

const styles = StyleSheet.create({
  header: {
    gap: space.lg,
  },
  intro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingHorizontal: space.xxs,
  },
  introText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
