/**
 * MatchesDock — Maçlar ekranının ALT KONTROL PANELİ.
 *
 * NEDEN ALTTA: lig seçici, gün şeridi ve Tümü/Canlı/Bitti/Yaklaşan eskiden
 * üst başlık bandındaydı; telefonun en ulaşılmaz yeri. Üçü de sık dokunulan
 * süzgeçlerdir, bu yüzden başparmağın doğal yayına — alt menünün hemen
 * üstüne — taşındı. Liste yukarıda kesintisiz akar; başlık yalnız adı taşır.
 *
 * DİZİLİŞ (yukarıdan aşağı, alt menüye en yakın olan en sık kullanılan):
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  [ Tümü | Canlı • 3 | Bitti | Yaklaşan ]       │  segment
 *   │  [🏆 Ankara · FREELİG · 15. Sezon ▾] [📌 …]   │  lig/sezon seçici
 *   │  PZT SAL ÇAR [14] PER CUM …        [BUGÜN][📅] │  gün şeridi
 *   └───────────────────────────────────────────────┘
 *   ══════════════ alt menü ══════════════
 *
 * Canlı segmentinde gün kavramı yoktur: şeridin yerini aynı yükseklikte canlı
 * özet satırı alır — panel zıplamaz.
 *
 * Panel tek bir yükseltilmiş yüzeydir (üst köşeler yuvarlak, yukarı düşen
 * hafif gölge); sayfa zeminiyle değil kendi `surface1` zemininde çizilir.
 */

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LeaguePicker } from "@/components/LeaguePicker";
import { DateStrip, LiveBadge, SegmentedControl } from "@/components/ui";
import type { SegmentedItem } from "@/components/ui";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";
import type { DayMarker } from "./CalendarSheet";

export interface MatchesDockProps<T extends string> {
  segments: SegmentedItem<T>[];
  tab: T;
  onTabChange: (next: T) => void;
  /** Canlı segmentinde şerit yerine özet satırı. */
  live: boolean;
  liveCount: number;
  liveText: string;
  date: string;
  onDateChange: (iso: string) => void;
  markers: Record<string, DayMarker>;
  range: { start: string; end: string };
  onOpenCalendar: () => void;
}

function MatchesDockBase<T extends string>({
  segments,
  tab,
  onTabChange,
  live,
  liveCount,
  liveText,
  date,
  onDateChange,
  markers,
  range,
  onOpenCalendar,
}: MatchesDockProps<T>) {
  return (
    <View style={styles.dock}>
      <View style={styles.grip} />

      <View style={styles.segmentRow}>
        <SegmentedControl<T> items={segments} value={tab} onChange={onTabChange} size="sm" />
      </View>

      <LeaguePicker allowAll />

      {live ? (
        <View style={styles.liveRow}>
          {liveCount > 0 ? <LiveBadge compact /> : null}
          <Text style={styles.liveText} numberOfLines={1} {...textScale.dense}>
            {liveText}
          </Text>
        </View>
      ) : (
        <DateStrip
          value={date}
          onChange={onDateChange}
          markers={markers}
          range={range}
          onOpenCalendar={onOpenCalendar}
          showTodayButton
          surface={colors.surface1}
        />
      )}
    </View>
  );
}

export const MatchesDock = memo(MatchesDockBase) as typeof MatchesDockBase;

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: hairline,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
    paddingTop: space.xs,
    // Yukarı düşen yumuşak gölge: panel listenin ÜSTÜNDE durur.
    shadowColor: colors.shadowColor,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  /** Panelin tepesindeki küçük tutamak — yüzeyin "çekmece" olduğunu söyler. */
  grip: {
    alignSelf: "center",
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.s,
  },
  segmentRow: {
    paddingHorizontal: layout.screenPadding,
  },
  liveRow: {
    height: layout.dateStripHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
  },
  liveText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
});
