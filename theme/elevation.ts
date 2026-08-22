/**
 * Yükselti ve ayraç stratejisi.
 *
 * KURAL: ÇİZGİ ÖNCE, GÖLGE SONRA — ama gölge VAR. Varsayılan kart `surface1`
 * zemin + 1px `border` kenarlık + ÇOK GENİŞ, ÇOK SÖNÜK bir gölgedir.
 *
 * NEDEN DEĞİŞTİ: önceki sürüm "gölge değil çizgi" diyerek kart gölgesini
 * tamamen kaldırmıştı. Gerekçe doğruydu (her yuvarlak köşenin altına koyu bir
 * bulut koymak ürünü şablona çevirir) ama çözüm aşırıydı: beyaz kart, beyaza
 * yakın kâğıdın üstünde yalnız 1px çizgiyle durunca hiçbir şey YÜZMEDİ ve
 * arayüz "ekrana basılmış" göründü. Doğru orta yol, gölgenin GÖRÜNMEMESİ ama
 * HİSSEDİLMESİDİR: y ofseti küçük, yarıçap büyük, opaklık 0.04–0.06.
 *
 * Reçeteler (açık tema):
 *   seviye 1 (kart)     opaklık .045 · yarıçap 14 · y 3   · android 1
 *   seviye 2 (yükseltilmiş) .06 · 20 · 6  · android 3
 *   seviye 3 (yüzen)    .10  · 24 · 10 · android 8
 *   seviye 4 (sheet)    .16  · 32 · 16 · android 16
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
const SHADOW: Record<Exclude<ElevationLevel, 0>, { o: number; r: number; y: number; e: number }> = {
  1: { o: 0.045, r: 14, y: 3, e: 1 },
  2: { o: 0.06, r: 20, y: 6, e: 3 },
  3: { o: 0.1, r: 24, y: 10, e: 8 },
  4: { o: 0.16, r: 32, y: 16, e: 16 },
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
      // Gölge rengi açık temada saf siyah değil mürekkeptir: siyah gölge açık
      // zeminde grileşip kirli görünür, mürekkep tonu soğuk kalır.
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
