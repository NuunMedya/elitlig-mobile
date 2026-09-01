/**
 * Mevki renkleri — oyuncu kimliğinin tek renk kuralı.
 *
 * Mevki, uygulamada ya yazıyla söyleniyordu ("Forvet") ya da hiç
 * söylenmiyordu; bir kadro listesine bakınca dizilişi görmek için her satırı
 * tek tek okumak gerekiyordu. Artık mevki bir RENKTİR: avatarın etrafındaki
 * halka ve adın yanındaki üç harf aynı rengi taşır.
 *
 *   KAL  altın      · kaleci, sahadaki tek farklı iş
 *   DEF  camgöbeği  · verinin rengi; savunma sayılarla anlatılır
 *   ORT  mor        · markanın rengi, sahanın merkezi
 *   FOR  mercan     · golün rengi, canlı ile aynı aile
 *
 * RENK TEK BAŞINA ANLAM TAŞIMAZ: halkanın yanında daima üç harfli etiket
 * durur. Renk körü bir kullanıcı için etiket birincil, renk ikincil sinyaldir.
 *
 * Bu dosya `theme/zones.ts` ile aynı kalıptadır: saf veri + saf eşleme,
 * yan etkisi yoktur. Serbest metni ("Sol Bek") ya da kodu ("SLB") hatta
 * çeviren mantık veri katmanındadır (`positionLine`, lib/api/team.ts);
 * burası yalnız hattın nasıl görüneceğini söyler.
 */

import type { Palette } from "./palette";

export type PositionLine = "GK" | "DEF" | "MID" | "FWD";

/** Hattın ray/halka rengi; hat bilinmiyorsa nötr lavanta. */
export function positionColor(p: Palette, line: PositionLine | null): string {
  switch (line) {
    case "GK":  return p.posKeeper;
    case "DEF": return p.posDefense;
    case "MID": return p.posMidfield;
    case "FWD": return p.posForward;
    default:    return p.posUnknown;
  }
}

/**
 * Üç harfli etiket. ÜÇ HARF çünkü dört harften uzun bir etiket satırda ada
 * yer bırakmıyor, iki harf ise Türkçede ayırt edici değil ("DE" / "DF").
 */
export function positionBadge(line: PositionLine | null): string {
  switch (line) {
    case "GK":  return "KAL";
    case "DEF": return "DEF";
    case "MID": return "ORT";
    case "FWD": return "FOR";
    default:    return "—";
  }
}

/**
 * Ekran okuyucu ve açıklama satırı için hattın tam adı.
 *
 * ADI `positionLineLabel`, `positionLabel` DEĞİL: veri katmanında zaten
 * `positionLabel` var ve o, KODU ("SLB") insan-okur etikete ("Sol Bek")
 * çeviriyor. İkisi farklı iş yapar; aynı adı taşısalardı ikisini birden
 * içe aktaran bir dosyada sessizce yanlış olan seçilirdi.
 */
export function positionLineLabel(line: PositionLine | null): string {
  switch (line) {
    case "GK":  return "Kaleci";
    case "DEF": return "Defans";
    case "MID": return "Orta saha";
    case "FWD": return "Forvet";
    default:    return "Mevki belirtilmemiş";
  }
}
