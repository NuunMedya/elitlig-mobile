/**
 * Yükselti ve ayraç stratejisi.
 *
 * KURAL (yeniden tasarım): GÖLGE DEĞİL ÇİZGİ. Varsayılan kart `surface1` zemin
 * + 1px `border` kenarlıktır ve GÖLGESİ YOKTUR. Yuvarlak köşeli her şeyin
 * altına gölge koymak, ürünü anında "hazır şablon" gösteren tek hamledir.
 *
 * Gölge yalnız GERÇEKTEN YÜZEN katmanlara ayrılmıştır (seviye 3–4): bottom
 * sheet, sticky skor şeridi, dropdown, FAB, toast. Bunlar içeriğin ÜSTÜNDE
 * durur ve altındakini gölgelemeleri fiziksel olarak doğrudur.
 *
 * Tek gölge reçetesi (`--shadow-pop`):
 *   0 1px 2px rgba(18,20,28,.04), 0 12px 32px -8px rgba(18,20,28,.12)
 * RN tek katman gölge desteklediği için ikinci (geniş) katman uygulanır;
 * birinci katmanın işini zaten 1px kenarlık görüyor.
 *
 * Koyu temada gölge görünmez (siyah üstüne siyah); orada katmanlar yüzey farkı
 * + kenarlıkla ayrılır ve 3. seviyeden itibaren üst kenara 1px iç ışık eklenir.
 *
 * Seviyeler: 0 zemin · 1 kart (çizgi) · 2 basılı/ikinci yüzey (çizgi)
 * · 3 yüzen (FAB, toast, sticky) · 4 sheet/modal.
 */

import { Platform, StyleSheet, type ViewStyle } from "react-native";
import { type Palette } from "./palette";

export type ElevationLevel = 0 | 1 | 2 | 3 | 4;

/** Verilen seviyenin zemin + kenarlık (+ yüzen katmanlarda gölge) stilini üretir. */
export function elevation(level: ElevationLevel, p: Palette, isDarkTheme: boolean): ViewStyle {
  if (level === 0) return { backgroundColor: p.bg };

  const surface =
    level === 1 ? p.surface1 : level === 2 ? p.surface2 : level === 3 ? p.surface1 : p.elevated;

  // Seviye 1–2: yüzen değil, yalnız çizgi. Her iki temada da aynı.
  if (level <= 2) {
    return {
      backgroundColor: surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    };
  }

  if (isDarkTheme) {
    // Koyu temada gölge görünmez: yüzey farkı + güçlü kenarlık + üst iç ışık.
    return {
      backgroundColor: surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderStrong,
      borderTopColor: "rgba(255,255,255,0.08)",
    };
  }

  // Açık tema, yüzen katman: tek reçete (--shadow-pop'un geniş katmanı).
  const shadow = level === 3 ? { o: 0.12, r: 16, y: 8, e: 8 } : { o: 0.16, r: 24, y: 12, e: 14 };

  return {
    backgroundColor: surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.border,
    ...Platform.select({
      ios: {
        // Gölge rengi saf siyah değil mürekkeptir (#12141C): siyah gölge açık
        // zeminde grileşip kirli görünür, mürekkep tonu soğuk kalır.
        shadowColor: "#12141C",
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
