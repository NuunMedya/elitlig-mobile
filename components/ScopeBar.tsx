/**
 * ScopeBar — il, lig ve sezonun AYRI AYRI ve tek dokunuşla değiştirildiği şerit.
 *
 * ARENA DÜZENİ: üç ayrı kutu yerine TEK bir kapsam rayı. Eski sürümde üç
 * beyaz kutu, mor çerçeve ve mor etiketlerle ekranın tepesinde üç ayrı
 * "düğme" gibi duruyordu; mor bir şey söylemediği hâlde üç kez tekrar
 * ediyordu. Şimdi kapsam tek bir cümledir — "Ankara · FREELİG · 15. Sezon" —
 * ve ray üç hücreye bölünür. Hangi hücreye dokunulursa alt sayfa O ADIMDA
 * açılır. Etiketler nötr `overline`; renk yalnız seçili lig çipindedir.
 *
 * LİG KISAYOLLARI: seçili ildeki ligler rayın altında yatay çipler olarak
 * durur — ligler arası geçiş alt sayfa açmadan, tek dokunuşla yapılır. Favori
 * ligler başa alınır.
 *
 * `showSlots={false}`: yalnız lig çipleri. Lig merkezi kapsamı başlığın
 * kendisinde (lig adı başlık, il · sezon üst satır) gösterdiği için rayı
 * ikinci kez çizmez; çipler orada hızlı geçiş şeridi olarak kalır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Chip, ChipGroup, Touchable } from "@/components/ui";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope, type ScopeStep } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

export interface ScopeBarProps {
  /** Lig kısayol çiplerini göster (varsayılan true). */
  showLeagueChips?: boolean;
  /** İl · lig · sezon rayını göster (varsayılan true). */
  showSlots?: boolean;
}

const SLOTS: { step: ScopeStep; label: string; icon: keyof typeof Ionicons.glyphMap; flex: number }[] = [
  { step: "city", label: "İl", icon: "location-outline", flex: 1 },
  { step: "league", label: "Lig", icon: "trophy-outline", flex: 1.35 },
  { step: "season", label: "Sezon", icon: "calendar-outline", flex: 1 },
];

export const ScopeBar = React.memo(function ScopeBar({
  showLeagueChips = true,
  showSlots = true,
}: ScopeBarProps) {
  const scope = useScope();
  const { isFavoriteLeague } = useFavorite();

  const values: Record<ScopeStep, string> = {
    city: scope.cityLabel || "Seç",
    league: scope.leagueLabel || "Seç",
    season: scope.seasonLabel || "Seç",
  };

  const leagues = useMemo(() => {
    const list = scope.leagues.filter((league) => !league.is_archived);
    return [...list].sort((a, b) => Number(isFavoriteLeague(b.id)) - Number(isFavoriteLeague(a.id)));
  }, [scope.leagues, isFavoriteLeague]);

  const chips = showLeagueChips && leagues.length > 1;
  if (!showSlots && !chips) return null;

  return (
    <View style={[styles.wrap, !showSlots && styles.wrapChipsOnly]}>
      {showSlots ? (
        <View style={styles.rail}>
          {SLOTS.map((slot, index) => (
            <Touchable
              key={slot.step}
              feedback="row"
              haptic="selection"
              onPress={() => scope.openScopeSheet(slot.step)}
              accessibilityRole="button"
              accessibilityLabel={`${slot.label}: ${values[slot.step]}. Değiştir`}
              style={[styles.slot, { flex: slot.flex }, index > 0 && styles.slotDivided]}
            >
              <View style={styles.slotHead}>
                <Ionicons name={slot.icon} size={11} color={colors.textTertiary} />
                <Text style={styles.slotLabel} {...textScale.badge}>
                  {upperTR(slot.label)}
                </Text>
              </View>
              <View style={styles.slotValueRow}>
                <Text style={styles.slotValue} numberOfLines={1} {...textScale.dense}>
                  {values[slot.step]}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.textTertiary} />
              </View>
            </Touchable>
          ))}
        </View>
      ) : null}

      {chips ? (
        <ChipGroup contentPadding={layout.screenPadding} gap={space.s}>
          {leagues.map((league) => (
            <Chip
              key={league.id}
              label={league.label}
              icon={isFavoriteLeague(league.id) ? "star" : undefined}
              selected={league.id === scope.leagueId}
              onPress={() => scope.selectLeague(league.id)}
            />
          ))}
        </ChipGroup>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingTop: space.xs,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  wrapChipsOnly: {
    paddingTop: space.sm,
  },
  /* Tek ray: beyaz kart, saç teli kenarlık, hücreler arası dikey saç teli. */
  rail: {
    ...elevate(1),
    flexDirection: "row",
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  slot: {
    minWidth: 0,
    minHeight: layout.minTouch + space.xs,
    justifyContent: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    gap: space.xxs,
  },
  slotDivided: {
    borderLeftWidth: hairline,
    borderLeftColor: colors.separator,
  },
  slotHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  slotLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  slotValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  slotValue: {
    ...type.label,
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
