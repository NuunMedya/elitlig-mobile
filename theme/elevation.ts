/**
 * Yükselti ve ayraç stratejisi.
 *
 * KURAL (2026-10 sadeleştirme): KART GÖLGESİZDİR.
 *
 * Kâğıt artık saf beyaz değil, çok açık bir lavanta-gri (#F7F5FB); beyaz kart
 * onun üstünde DOLGU FARKI + 1px kenarlıkla ayrılır. FotMob, Apple Sports ve
 * OneFootball'un ortak dili budur: kartın yüzdüğünü gölge değil yüzey söyler.
 * Her kartın altındaki mor hâle, listeyi "kabarık" ve gürültülü yapıyordu.
 * Gölge yalnız gerçekten YÜZEN katmanlara kalır.
 *
 * Reçeteler (açık tema):
 *   seviye 1 (kart)         gölge yok — dolgu + hairline
 *   seviye 2 (yükseltilmiş) opaklık .06 · yarıçap 14 · y 3  · android 2
 *   seviye 3 (yüzen)                .10 · 22 · 8  · android 6
 *   seviye 4 (sheet)                .16 · 32 · 14 · android 12
 *
 * GÖLGE MORDUR (`shadowColor`), siyah değil: beyaz zeminde siyah gölge grileşir.
 *
 * Koyu temada gölge görünmez (siyah üstüne siyah); orada katmanlar yüzey farkı
 * + kenarlıkla ayrılır ve 3. seviyeden itibaren üst kenara 1px iç ışık eklenir.
 * Yine de 3–4. seviyeye siyah bir gölge verilir: koyu temada bile bir sheet'in
 * altındaki içeriğin koyulaşması derinliği okutur.
 *
 * Seviyeler: 0 zemin · 1 kart · 2 yükseltilmiş kart / basılı yüzey
 * · 3 yüzen (FAB, toast, sticky) · 4 sheet/modal.
 */

import { Platform, StyleSheet, type ViewStyle } from "react-native";
import { type Palette } from "./palette";

export type ElevationLevel = 0 | 1 | 2 | 3 | 4;

/** Verilen seviyenin zemin + kenarlık (+ yüzen katmanlarda gölge) stilini üretir. */
/** Seviye başına gölge reçetesi: opaklık · yarıçap · y ofseti · android kotu. */
const SHADOW: Record<Exclude<ElevationLevel, 0>, { o: number; r: number; y: number; e: number } | null> = {
  1: null,
  2: { o: 0.06, r: 14, y: 3, e: 2 },
  3: { o: 0.10, r: 22, y: 8, e: 6 },
  4: { o: 0.16, r: 32, y: 14, e: 12 },
};

/** Koyu temada yalnız gerçekten yüzen katmanlar gölge alır; kart almaz. */
const DARK_SHADOW: Record<Exclude<ElevationLevel, 0>, { o: number; r: number; y: number; e: number } | null> = {
  1: null,
  2: null,
  3: { o: 0.4, r: 20, y: 8, e: 8 },
  4: { o: 0.55, r: 30, y: 14, e: 16 },
};

/** Verilen seviyenin zemin + kenarlık + gölge stilini üretir. */
export function elevation(level: ElevationLevel, p: Palette, isDarkTheme: boolean): ViewStyle {
  if (level === 0) return { backgroundColor: p.bg };

  const surface =
    level === 1 ? p.surface1 : level === 2 ? p.surface2 : level === 3 ? p.surface1 : p.elevated;

  const shadow = isDarkTheme ? DARK_SHADOW[level] : SHADOW[level];

  const base: ViewStyle = {
    backgroundColor: surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDarkTheme && level >= 3 ? p.borderStrong : p.border,
  };

  // Koyu temada yüzen katmanın üst kenarına 1px iç ışık: katmanı "kalınlaştırır".
  if (isDarkTheme && level >= 3) {
    base.borderTopColor = "rgba(255,255,255,0.08)";
  }

  if (!shadow) return base;

  return {
    ...base,
    ...Platform.select({
      // Gölge rengi açık temada saf siyah değil MOR mürekkeptir: siyah gölge
      // beyaz zeminde grileşip kirli görünür, mor ton soğuk ve temiz kalır.
      ios: {
        shadowColor: p.shadowColor,
        shadowOpacity: shadow.o,
        shadowRadius: shadow.r,
        shadowOffset: { width: 0, height: shadow.y },
      },
      android: { elevation: shadow.e },
      default: {
        shadowColor: p.shadowColor,
        shadowOpacity: shadow.o,
        shadowRadius: shadow.r,
        shadowOffset: { width: 0, height: shadow.y },
      },
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
  /** Amblem sütununu atlayan ayraç (14 + 28 + 12) */
  insetAvatar: ViewStyle;
  /** Saat sütununu atlayan ayraç (14 + 46) */
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
    inset:       { height: hairline, backgroundColor: p.separator, marginLeft: 14 },
    insetAvatar: { height: hairline, backgroundColor: p.separator, marginLeft: 54 },
    insetTime:   { height: hairline, backgroundColor: p.separator, marginLeft: 60 },
    vertical:    { width: hairline, alignSelf: "stretch", backgroundColor: p.separator },
    section:     { height: 10, backgroundColor: p.bg },
  };
}
