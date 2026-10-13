/**
 * ScopeBar — il, lig ve sezonun AYRI AYRI ve tek dokunuşla değiştirildiği şerit.
 *
 * NEDEN ScopeChip YETMEDİ: başlıktaki tek çip üç ayarı tek satırda özetliyordu;
 * sezonu değiştirmek isteyen kullanıcı önce çipi bulmak, sonra alt sayfada
 * il → lig → sezon adımlarını geçmek zorundaydı. Şerit üç ayarı üç ayrı kutu
 * olarak gösterir: hangi kutuya dokunulursa alt sayfa O ADIMDA açılır.
 *
 * LİG KISAYOLLARI: seçili ildeki ligler kutuların altında yatay çipler olarak
 * durur — ligler arası geçiş alt sayfa açmadan, tek dokunuşla yapılır. Favori
 * ligler başa alınır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope, type ScopeStep } from "@/providers/ScopeProvider";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

export interface ScopeBarProps {
  /** Lig kısayol çiplerini göster (varsayılan true). */
  showLeagueChips?: boolean;
}

const SLOTS: { step: ScopeStep; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { step: "city", label: "İL", icon: "location" },
  { step: "league", label: "LİG", icon: "trophy" },
  { step: "season", label: "SEZON", icon: "calendar" },
];

export const ScopeBar = React.memo(function ScopeBar({ showLeagueChips = true }: ScopeBarProps) {
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

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {SLOTS.map((slot) => (
          <Touchable
            key={slot.step}
            feedback="chip"
            haptic="selection"
            onPress={() => scope.openScopeSheet(slot.step)}
            accessibilityRole="button"
            accessibilityLabel={`${slot.label}: ${values[slot.step]}. Değiştir`}
            style={[styles.slot, slot.step === "league" && styles.slotWide]}
          >
            <View style={styles.slotHead}>
              <Ionicons name={slot.icon} size={11} color={colors.brandAccent} />
              <Text style={styles.slotLabel} {...textScale.badge}>
                {slot.label}
              </Text>
            </View>
            <View style={styles.slotValueRow}>
              <Text style={styles.slotValue} numberOfLines={1} {...textScale.dense}>
                {values[slot.step]}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
            </View>
          </Touchable>
        ))}
      </View>

      {showLeagueChips && leagues.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipScroll}
        >
          {leagues.map((league) => {
            const selected = league.id === scope.leagueId;
            return (
              <Touchable
                key={league.id}
                feedback="chip"
                haptic="selection"
                onPress={() => scope.selectLeague(league.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${league.label} ligine geç`}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                {isFavoriteLeague(league.id) ? (
                  <Ionicons name="star" size={11} color={selected ? colors.textOnBrand : colors.star} />
                ) : null}
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} {...textScale.dense}>
                  {league.label}
                </Text>
              </Touchable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  row: {
    flexDirection: "row",
    gap: space.s,
    paddingHorizontal: layout.screenPadding,
  },
  slot: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandBorder,
    gap: 1,
  },
  slotWide: {
    flex: 1.3,
  },
  slotHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  slotLabel: {
    ...type.overline,
    color: colors.brandAccent,
  },
  slotValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  slotValue: {
    ...type.label,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chips: {
    gap: space.s,
    paddingHorizontal: layout.screenPadding,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  chipSelected: {
    backgroundColor: colors.brand,
  },
  chipText: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.textOnBrand,
  },
});
