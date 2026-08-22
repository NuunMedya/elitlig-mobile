/**
 * Yazı aileleri — iki aile, beş kesim.
 *
 * NEDEN ÖZEL FONT (eski karar değişti): önceki sürüm bilinçli olarak sistem
 * yazı tipi kullanıyordu (açılış maliyeti + FOUT gerekçesiyle). Yeniden
 * tasarımda tipografi kimliğin taşıyıcısı olduğu için iki aile yükleniyor;
 * FOUT sorunu `useAppFonts()` ile splash ekranı ARKASINDA çözülüyor: fontlar
 * hazır olmadan uygulama ilk karesini çizmez, dolayısıyla "önce sistem fontu
 * sonra zıplama" hiç yaşanmaz. Toplam maliyet ~1,2 MB paket içi, ağ isteği yok.
 *
 * ROL DAĞILIMI (brief §2.2):
 *   Archivo → SKOR ve RAKAM. Dar, yüksek x-height, tabular rakamları düzgün.
 *   Inter   → ARAYÜZ METNİ. 10–16px arasında en okunur gövde ailesi.
 *
 * NEDEN HER KESİMİN AYRI ADI VAR: React Native'de özel bir font ailesine
 * `fontWeight` UYGULANMAZ (Android'de tamamen yok sayılır, iOS'ta faceleri
 * uydurmaya çalışır). Ağırlık, ailenin ADIYLA seçilir. Bu yüzden kod tabanında
 * `fontWeight` KULLANILMAZ; `fontFamily: fonts.semibold` yazılır.
 * `theme/typography.ts` içindeki tokenların hepsi zaten doğru aileyi taşır;
 * elle ağırlık vermeniz gereken bir yer kalmamalı.
 *
 * TÜRKÇE: her iki ailenin de indirilen kesimleri ğ Ğ ı İ ş Ş ö Ö ü Ü ç Ç â Â
 * glifleri dâhil Latin Extended-A kapsar (doğrulandı).
 */

import { useFonts } from "expo-font";

/**
 * Aile adları — `useAppFonts` içindeki anahtarlarla BİREBİR aynı olmak
 * zorundadır; ayrışan bir ad sessizce sistem fontuna düşer.
 */
export const fonts = {
  /** Inter 400 — gövde metni, arayüzün varsayılanı. */
  regular: "Inter-Regular",
  /** Inter 500 — caption, ikincil vurgu. */
  medium: "Inter-Medium",
  /** Inter 600 — başlık, etiket, buton. ARAYÜZÜN EN KALINI. */
  semibold: "Inter-SemiBold",
  /** Archivo 600 — küçük rakam blokları, tablo vurgusu. */
  display: "Archivo-SemiBold",
  /** Archivo 700 — skor, dakika, büyük metrik. */
  bold: "Archivo-Bold",
} as const;

export type FontFamily = (typeof fonts)[keyof typeof fonts];

/**
 * Fontları yükler. `false` döndüğü sürece uygulama ilk karesini çizmemelidir
 * (bkz. index.js → ThemedGate). Yükleme başarısız olursa da `true` döner:
 * fontsuz bir uygulama, açılmayan bir uygulamadan iyidir — sistem fontuna
 * düşer ve ölçek korunur.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [fonts.regular]: require("../assets/fonts/Inter-Regular.ttf"),
    [fonts.medium]: require("../assets/fonts/Inter-Medium.ttf"),
    [fonts.semibold]: require("../assets/fonts/Inter-SemiBold.ttf"),
    [fonts.display]: require("../assets/fonts/Archivo-SemiBold.ttf"),
    [fonts.bold]: require("../assets/fonts/Archivo-Bold.ttf"),
  });
  return loaded || error != null;
}
