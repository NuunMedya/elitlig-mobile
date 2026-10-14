/**
 * Lig merkezi bölmelerinin ortak parçaları.
 *
 * Beş bölme (Puan · Fikstür · Oyuncular · İstatistik · Haber) aynı kapsama
 * bağlıdır ve aynı kabuğun altında durur; kaydırma
 * bağlantısı, "lig seçilmedi" kartı, kapsam anahtarı ve satır grubu kabuğu
 * her birinde aynı olmak zorunda. Tek yerde tanımlanır ki bir bölme
 * diğerlerinden ayrı bir dil konuşmasın.
 */

import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { EmptyState } from "@/components/ui";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/** Her bölmenin listesine geçen ortak kaydırma bağlantısı (başlığı daraltır). */
export interface ScrollChrome {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export interface PaneProps {
  scrollProps?: ScrollChrome;
}

/** Sunucu bazı toplamları DİZE döndürüyor ("41", "1.95"); tek dönüştürücü. */
export const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

/** Sistem oyuncuları (hükmen maç kayıtları) — sıralamalarda yerleri yok. */
export const JUNK_PLAYER = /hükmen|hukmen|antpl/i;

/** Kapsam sorgu anahtarı — `queryKeys.*` ile aynı biçim. */
export function useScopeKey() {
  const { cityId, leagueId, seasonId } = useScope();
  return useMemo(
    () => ({
      cityId: cityId ?? undefined,
      leagueId: leagueId ?? undefined,
      seasonId: seasonId ?? undefined,
    }),
    [cityId, leagueId, seasonId],
  );
}

/** Kapsam seçilmemişken bölmelerin gösterdiği ortak kart. */
export const ScopeMissing = React.memo(function ScopeMissing({ body }: { body?: string }) {
  const { openScopeSheet } = useScope();
  return (
    <EmptyState
      icon="options-outline"
      title="Lig seçilmedi"
      body={body ?? "Şehir, lig ve sezon seçince bu bölüm dolar."}
      action={{ label: "Kapsam seç", onPress: () => openScopeSheet("city") }}
    />
  );
});

/**
 * Bölüm başlığı (lig merkezi içi): küçük versal etiket + sağda bağlam.
 * `SectionHeader`ın kâğıt üstündeki karşılığı; kart grupları arasında 16px
 * nefesle durur, kendi yatay boşluğu yoktur (liste kenarına hizalı).
 */
export const PaneLabel = React.memo(function PaneLabel({
  title,
  meta,
  style,
}: {
  title: string;
  meta?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.label, style]}>
      <Text style={styles.labelText} numberOfLines={1} {...textScale.badge}>
        {upperTR(title)}
      </Text>
      {meta ? (
        <Text style={styles.labelMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * Satır grubu (tek kart, satır satır çizilir) — FlatList satırları için kabuk.
 * Lig sekmesi YOĞUN dildedir: kart köşesi 18 değil 14 (`radius.lg`); küçük
 * puntolu satırların yanında iri köşe kartı şişkin gösteriyordu.
 */
export const GROUP_RADIUS = radius.lg;
const GROUP_SHELL = {
  backgroundColor: colors.surface1,
  borderColor: colors.border,
} as const;

export const groupStyles = StyleSheet.create({
  /** Grubun tepesi: üst kenarlık ve üst köşeler. */
  head: {
    ...GROUP_SHELL,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderTopLeftRadius: GROUP_RADIUS,
    borderTopRightRadius: GROUP_RADIUS,
    overflow: "hidden",
  },
  row: {
    ...GROUP_SHELL,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
  },
  /** Başlıksız grubun ilk satırı. */
  rowFirst: {
    ...GROUP_SHELL,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderTopWidth: hairline,
    borderTopLeftRadius: GROUP_RADIUS,
    borderTopRightRadius: GROUP_RADIUS,
    overflow: "hidden",
  },
  rowLast: {
    ...GROUP_SHELL,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderBottomWidth: hairline,
    borderBottomLeftRadius: GROUP_RADIUS,
    borderBottomRightRadius: GROUP_RADIUS,
    overflow: "hidden",
  },
  rowSingle: {
    ...GROUP_SHELL,
    borderWidth: hairline,
    borderRadius: GROUP_RADIUS,
    overflow: "hidden",
  },
  /** Satırlar arası ince ayraç; kartın yan kenarlığını da taşır ki çizgi kesilmesin. */
  separator: {
    height: hairline,
    backgroundColor: colors.separator,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  /** Bağımsız kart (iç içe kart yok — içerik doğrudan bunun içinde). */
  card: {
    ...elevate(1),
    backgroundColor: colors.surface1,
    borderRadius: GROUP_RADIUS,
    borderWidth: hairline,
    borderColor: colors.border,
  },
});

/** Satırın grup içindeki konumuna göre kabuğu. */
export function groupRowStyle(index: number, total: number, hasHead: boolean) {
  if (total === 1) return hasHead ? groupStyles.rowLast : groupStyles.rowSingle;
  if (index === total - 1) return groupStyles.rowLast;
  if (index === 0 && !hasHead) return groupStyles.rowFirst;
  return groupStyles.row;
}

export const GroupSeparator = () => <View style={groupStyles.separator} />;

/** Bölme listelerinin ortak içerik boşluğu (alt menü barının üstünde biter). */
export const paneStyles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: layout.tabBarHeight + space.xl,
    flexGrow: 1,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    gap: space.sm,
  },
});

const styles = StyleSheet.create({
  label: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    paddingHorizontal: space.xxs,
    paddingBottom: space.s,
  },
  labelText: {
    ...type.overline,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  labelMeta: {
    ...type.caption,
    fontSize: 10,
    lineHeight: 13,
    color: colors.textTertiary,
  },
});
