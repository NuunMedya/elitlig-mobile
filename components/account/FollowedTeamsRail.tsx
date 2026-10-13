/**
 * FollowedTeamsRail — takip edilen takımların yatay şeridi (Profil).
 *
 * NEDEN ŞERİT: "Takip ettiklerim" eskiden üç menü satırıydı ve kullanıcı hangi
 * takımları takip ettiğini görmek için bir ekran daha açmak zorundaydı.
 * Armalar burada doğrudan görünür: dokununca takım sayfası, son kutu yeni takım
 * ekler. Yönetim (sıralama, çıkarma) bölüm başlığındaki "Yönet" ile takip
 * ekranına gider.
 *
 * BOŞ HÂL: tek satırlık davet — ne olduğunu ve ne yapılacağını söyler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { TeamLogo, Touchable } from "@/components/ui";
import type { FavoriteTeam } from "@/providers/FavoriteProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";

const TILE_W = 84;

export interface FollowedTeamsRailProps {
  teams: FavoriteTeam[];
  onOpenTeam: (teamId: number) => void;
  onAdd: () => void;
}

type RailItem = { kind: "team"; team: FavoriteTeam } | { kind: "add" };

export const FollowedTeamsRail = React.memo(function FollowedTeamsRail({
  teams,
  onOpenTeam,
  onAdd,
}: FollowedTeamsRailProps) {
  const renderItem = useCallback(
    ({ item }: { item: RailItem }) =>
      item.kind === "add" ? (
        <AddTile onPress={onAdd} />
      ) : (
        <TeamTile team={item.team} onOpen={onOpenTeam} />
      ),
    [onAdd, onOpenTeam]
  );

  if (!teams.length) {
    return (
      <Touchable
        feedback="card"
        haptic="selection"
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Takım bul ve takip et"
        style={styles.empty}
      >
        <View style={styles.emptyIcon}>
          <Ionicons name="star-outline" size={18} color={colors.brandAccent} />
        </View>
        <View style={styles.emptyBody}>
          <Text style={styles.emptyTitle} {...textScale.dense}>
            Takımını takip et
          </Text>
          <Text style={styles.emptyText} {...textScale.dense}>
            Maçları öne çıkar, gol ve sonuç bildirimi al.
          </Text>
        </View>
        <Ionicons name="add-circle" size={26} color={colors.brand} />
      </Touchable>
    );
  }

  const data: RailItem[] = [...teams.map((team) => ({ kind: "team" as const, team })), { kind: "add" }];

  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(item) => (item.kind === "add" ? "add" : String(item.team.id))}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={styles.railOuter}
    />
  );
});

const TeamTile = React.memo(function TeamTile({
  team,
  onOpen,
}: {
  team: FavoriteTeam;
  onOpen: (teamId: number) => void;
}) {
  const handle = useCallback(() => onOpen(team.id), [onOpen, team.id]);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handle}
      accessibilityRole="button"
      accessibilityLabel={`${team.name} takım sayfası`}
      style={styles.tile}
    >
      <TeamLogo name={team.name} logo={team.logo ?? null} size={layout.crestLg + 4} />
      <Text style={styles.tileName} numberOfLines={2} {...textScale.dense}>
        {team.name}
      </Text>
    </Touchable>
  );
});

const AddTile = React.memo(function AddTile({ onPress }: { onPress: () => void }) {
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Takım ekle"
      style={[styles.tile, styles.addTile]}
    >
      <View style={styles.addIcon}>
        <Ionicons name="add" size={20} color={colors.brandAccent} />
      </View>
      <Text style={[styles.tileName, styles.addLabel]} numberOfLines={2} {...textScale.dense}>
        Takım ekle
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  /* Şerit ekran kenarına kadar akar; içerik kenar boşluğuyla hizalanır. */
  railOuter: {
    marginHorizontal: -layout.screenPadding,
  },
  rail: {
    paddingHorizontal: layout.screenPadding,
    gap: space.sm,
    paddingTop: space.xxs,
    paddingBottom: space.m,
  },
  tile: {
    width: TILE_W,
    alignItems: "center",
    gap: space.s,
    paddingTop: space.md,
    paddingBottom: space.m,
    paddingHorizontal: space.s,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  tileName: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
    minHeight: 30,
  },
  addTile: {
    backgroundColor: colors.bg,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  addIcon: {
    width: layout.crestLg + 4,
    height: layout.crestLg + 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  addLabel: {
    color: colors.brandAccent,
  },

  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  emptyBody: {
    flex: 1,
    gap: 2,
  },
  emptyTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  emptyText: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
});
