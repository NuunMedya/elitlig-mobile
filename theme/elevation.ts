/**
 * Yükselti ve ayraç stratejisi.
 *
 * NEDEN GÖLGE YOK: koyu zeminde `shadowColor: "#000"` görünmez; Android'de
 * `elevation` yalnızca gri bir sis üretir. Bu yüzden koyu temada katmanlar
 * gölgeyle değil YÜZEY FARKI + 1px KENARLIK ile ayrılır; 3. seviyeden itibaren
 * üst kenara 1px iç ışık eklenir (fiziksel olarak "yukarıdan aydınlanan" his).
 * Açık temada klasik yumuşak gölge kullanılır.
 *
 * Seviyeler: 0 zemin · 1 satır/kart · 2 basılı/aktif · 3 yüzen (FAB, toast)
 * · 4 sheet/modal.
 */

import { Platform, StyleSheet, type ViewStyle } from "react-native";
import type { Palette } from "./palette";

export type ElevationLevel = 0 | 1 | 2 | 3 | 4;

/** Verilen seviyenin zemin + kenarlık (+ açık temada gölge) stilini üretir. */
export function elevation(level: ElevationLevel, p: Palette, isDarkTheme: boolean): ViewStyle {
  if (level === 0) return { backgroundColor: p.bg };

  const surface =
    level === 1 ? p.surface1 : level === 2 ? p.surface2 : level === 3 ? p.surface3 : p.elevated;

  if (isDarkTheme) {
    // Gölge yerine: yüzey farkı + kenarlık + (3+) üst kenarda 1px iç ışık.
    return {
      backgroundColor: surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: level >= 3 ? p.borderStrong : p.border,
      ...(level >= 3 ? { borderTopColor: "rgba(255,255,255,0.08)" } : null),
    };
  }

  const shadow = {
    1: { o: 0.03, r: 1, y: 1, e: 1 },
    2: { o: 0.05, r: 2, y: 1, e: 2 },
    3: { o: 0.10, r: 12, y: 4, e: 6 },
    4: { o: 0.14, r: 24, y: 8, e: 12 },
  }[level];

  return {
    backgroundColor: surface,
    borderWidth: level <= 2 ? StyleSheet.hairlineWidth : 0,
    borderColor: p.border,
    ...Platform.select({
      ios: {
        shadowColor: "#0B0D12",
        shadowOpacity: shadow.o,
        shadowRadius: shadow.r,
        shadowOffset: { width: 0, height: shadow.y },
      },
      android: { elevation: shadow.e },
      default: {},
    }),
  };
}

/** Cihaz piksel oranına göre en ince çizgi — 0.5 @2x, 0.33 @3x. */
export const hairline = StyleSheet.hairlineWidth;

/** Ayraç seti — gruplandırılmış listelerin dokusu. */
export interface Dividers {
  /** Tam genişlik — grup sonu */
  full: ViewStyle;
  /** İçeriden — satırlar arası; sol boşluk = ikon/amblem sütunu */
  inset: ViewStyle;
  /** Amblem sütununu atlayan ayraç (12 + 24 + 8) */
  insetAvatar: ViewStyle;
  /** Saat sütununu atlayan ayraç (12 + 44) */
  insetTime: ViewStyle;
  /** Dikey — sayaç/istatistik ayracı */
  vertical: ViewStyle;
  /** Kalın bölüm ayracı — gruplar arası 8px zemin boşluğu */
  section: ViewStyle;
}

/**
 * KURAL: bir grup içindeki satırlar arasında `inset` ayraç; grubun SON
 * satırından sonra ayraç YOK; gruplar arasında 8px `bg` boşluk. Bu, "lige göre
 * bloklar" görüntüsünü üretir.
 */
export function createDividers(p: Palette): Dividers {
  return {
    full:        { height: hairline, backgroundColor: p.separator },
    inset:       { height: hairline, backgroundColor: p.separator, marginLeft: 12 },
    insetAvatar: { height: hairline, backgroundColor: p.separator, marginLeft: 44 },
    insetTime:   { height: hairline, backgroundColor: p.separator, marginLeft: 56 },
    vertical:    { width: hairline, alignSelf: "stretch", backgroundColor: p.separator },
    section:     { height: 8, backgroundColor: p.bg },
  };
}
