/**
 * LeaguePicker — uygulamanın TEK lig seçicisi.
 *
 * NE: başlık bandında bir hap ve yanında sabitlenmiş lig çipleri:
 *
 *   [ Ankara · FREELİG · 15. Sezon ▾ ]  [📌 1.Lig]  [📌 Süper Lig]
 *
 * Hapa dokununca tek örnek alt sayfa (`ScopeSheet`) il → lig → sezon
 * adımlarıyla açılır; geçmiş sezonlar (eski "Arşiv" sekmesi) o sayfanın sezon
 * adımındadır. Çipe dokununca kapsam doğrudan o lige geçer — lig başka bir
 * ildeyse il de birlikte değişir (`ScopeProvider.jumpTo`).
 *
 * NEDEN TEK BİLEŞEN: eskiden Maçlar başlığında `ScopeChip`, Lig'de
 * `ScopeChip variant="context"` + `ScopeBar` çip şeridi, Ana Sayfa'da yine
 * başka bir kipte çip vardı; aynı ayar üç ayrı biçimde okunuyordu. Artık her
 * ekran bu bileşeni başlığın `bottom` yuvasına koyar.
 *
 * "TÜMÜ" (`allowAll`, yalnız Maçlar): sayfa "Tüm Türkiye" / "Tüm ligler"
 * satırlarıyla açılır ve hap görünüm genişliğini yazar — "Tüm Türkiye",
 * "Ankara · Tüm ligler" ya da tek lig kapsamı.
 *
 * YÜZEYİ KENDİSİ ÖĞRENİR (`HeaderToneContext`): sahne başlığında cam hap,
 * kâğıtta beyaz hap.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Chip, IconTile, Touchable, useHeaderTone } from "@/components/ui";
import { useScope, type PinnedLeague, type ScopeStep } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

/**
 * "2025/26" → "25/26", "2025-2026" → "25/26"; "15. SEZON" → "15. Sezon".
 * Sezon etiketi hapın en uzun parçasıdır; yıl biçimindeyse kısaltılır, değilse
 * yalnız versal yazım düzeltilir — etiket uydurulmaz.
 */
export function shortSeason(label: string): string {
  const trimmed = label.trim();
  const years = trimmed.match(/^(\d{2})?(\d{2})\s*[/\-–]\s*(\d{2})?(\d{2})$/);
  if (years) return `${years[2]}/${years[4]}`;
  const numbered = trimmed.match(/^(\d+)\.\s*SEZON$/i);
  if (numbered) return `${numbered[1]}. Sezon`;
  return trimmed;
}

/** "1. Lig" → "1.Lig": tek satırda kalsın diye ligdeki nokta boşluğu atılır. */
export function shortLeague(label: string): string {
  return label.trim().replace(/^(\d+)\.\s+/, "$1.");
}

/** Hap metni: "Ankara · FREELİG · 15. Sezon". `allowAll` ile Maçlar'ın
 *  görünüm genişliği de okunur: "Tüm Türkiye" / "Ankara · Tüm ligler". */
export function useScopeLabel(allowAll = false): string {
  const { cityLabel, leagueLabel, seasonLabel, matchView } = useScope();
  const view = allowAll ? matchView : "league";
  return useMemo(() => {
    if (view === "country") return "Tüm Türkiye";
    const parts = [cityLabel || "İl seç"];
    if (view === "city") {
      parts.push("Tüm ligler");
      return parts.join(" · ");
    }
    if (leagueLabel) parts.push(shortLeague(leagueLabel));
    if (seasonLabel) parts.push(shortSeason(seasonLabel));
    return parts.join(" · ");
  }, [view, cityLabel, leagueLabel, seasonLabel]);
}

export interface LeaguePickerProps {
  /** Sabitlenmiş lig çiplerini göster (varsayılan true). */
  pinned?: boolean;
  /** Alt sayfanın açılacağı adım (varsayılan "city"). */
  step?: ScopeStep;
  /** Hap ve çipler kenar boşluğu olmadan çizilir (kart içi kullanım). */
  flush?: boolean;
  /** "Tüm Türkiye" / "Tüm ligler" seçenekleri (yalnız Maçlar ekranı). */
  allowAll?: boolean;
  testID?: string;
}

const PinnedChip = React.memo(function PinnedChip({
  league,
  selected,
  onPress,
}: {
  league: PinnedLeague;
  selected: boolean;
  onPress: (league: PinnedLeague) => void;
}) {
  const handlePress = useCallback(() => onPress(league), [league, onPress]);
  return (
    <Chip
      label={shortLeague(league.label)}
      icon="pin"
      size="sm"
      selected={selected}
      onPress={handlePress}
      testID={`pinned-league-${league.leagueId}`}
    />
  );
});

export const LeaguePicker = React.memo(function LeaguePicker({
  pinned: showPinned = true,
  step = "city",
  flush = false,
  allowAll = false,
  testID,
}: LeaguePickerProps) {
  const ink = useHeaderTone("paper") === "ink";
  const scope = useScope();
  const { openScopeSheet, jumpTo, leagueId, pinnedLeagues, matchView, setMatchView } = scope;
  const label = useScopeLabel(allowAll);
  const wide = allowAll && matchView !== "league";

  const open = useCallback(() => openScopeSheet(step, { allowAll }), [openScopeSheet, step, allowAll]);
  const goPinned = useCallback(
    (league: PinnedLeague) => {
      // Sabitli lig çipi daima tek lig görünümüne döner.
      if (allowAll) setMatchView("league");
      if (league.leagueId === leagueId) return;
      jumpTo(league.cityId, league.leagueId);
    },
    [jumpTo, leagueId, allowAll, setMatchView]
  );

  const chips = showPinned ? pinnedLeagues : [];
  const parts = useMemo(() => label.split(" · "), [label]);

  const pill = (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={open}
      style={[styles.pill, ink ? styles.pillInk : styles.pillPaper]}
      accessibilityRole="button"
      accessibilityLabel={`Lig seçici: ${label}`}
      accessibilityHint="İl, lig ve sezon seçmek için dokunun"
      testID={testID ?? "league-picker"}
    >
      {/* Degrade ikon kutusu: hapın "kapsam" olduğunu ilk bakışta söyler. */}
      <IconTile icon={wide ? "earth" : "trophy"} tone="signature" size={24} glow={false} />
      {/* Etiket parçalı okunur: il sönük · LİG kalın · sezon ikincil. */}
      <Text
        style={[styles.pillLabel, ink ? styles.pillLabelInk : null]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {parts.map((part, i) => (
          <Text
            key={`${i}-${part}`}
            style={
              i === parts.length - 1 && parts.length > 1
                ? ink ? styles.partMutedInk : styles.partMuted
                : i === 0 && parts.length > 2
                  ? ink ? styles.partMutedInk : styles.partMuted
                  : null
            }
          >
            {i > 0 ? <Text style={ink ? styles.sepInk : styles.sep}>{" · "}</Text> : null}
            {part}
          </Text>
        ))}
      </Text>
      <View style={[styles.chevron, ink ? styles.chevronInk : null]}>
        <Ionicons name="chevron-down" size={12} color={ink ? colors.onDark : colors.brandAccent} />
      </View>
    </Touchable>
  );

  if (!chips.length) {
    return <View style={[styles.single, flush ? null : styles.inset]}>{pill}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scroll, flush ? null : styles.inset]}
    >
      {pill}
      {chips.map((league) => (
        <PinnedChip
          key={league.leagueId}
          league={league}
          selected={!wide && league.leagueId === leagueId}
          onPress={goPinned}
        />
      ))}
    </ScrollView>
  );
});

const PILL_HEIGHT = 36;

const styles = StyleSheet.create({
  single: {
    flexDirection: "row",
    paddingVertical: space.xs,
  },
  inset: {
    paddingHorizontal: layout.screenPadding,
  },
  scroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.xs,
  },
  pill: {
    height: PILL_HEIGHT,
    maxWidth: 300,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.s,
    paddingRight: space.s,
    borderRadius: radius.pill,
  },
  pillPaper: {
    ...elevate(1),
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  pillInk: {
    backgroundColor: colors.inkPill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkPillBorder,
  },
  pillLabel: {
    ...type.label,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  pillLabelInk: {
    color: colors.onDark,
  },
  partMuted: {
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  partMutedInk: {
    fontFamily: fonts.medium,
    color: colors.onDarkMuted,
  },
  sep: {
    color: colors.textTertiary,
  },
  sepInk: {
    color: colors.onDarkMuted,
  },
  chevron: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  chevronInk: {
    backgroundColor: colors.inkTile,
  },
});
