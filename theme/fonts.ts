/**
 * Yazı aileleri — iki aile, altı kesim.
 *
 * 2026-10 SADELEŞTİRME: arayüz ailesi Inter'den PLUS JAKARTA SANS'a geçti.
 * Inter nötr ve okunaklıdır ama her uygulamada aynı sesi verir; Jakarta'nın
 * açık iç boşlukları ve yumuşak geometrisi aynı puntoda daha şık, daha "marka"
 * okunur (premium spor ve fintech uygulamalarının ortak tercihi). Türkçe
 * glifleri ve `tnum` özelliği tam. Rakam ailesi Archivo olarak kaldı: skor
 * sütunu dar ve dik durmalı. Başlıklar artık Archivo değil Jakarta Bold'dur —
 * ekran adı bir rakam değil, bir sözdür.
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
 *   Plus Jakarta Sans → ARAYÜZ METNİ ve BAŞLIKLAR.
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
  /** Plus Jakarta Sans 400 — gövde metni, arayüzün varsayılanı. */
  regular: "PlusJakartaSans-Regular",
  /** Plus Jakarta Sans 500 — caption, ikincil vurgu. */
  medium: "PlusJakartaSans-Medium",
  /** Plus Jakarta Sans 600 — satır başlığı, etiket, buton. */
  semibold: "PlusJakartaSans-SemiBold",
  /** Plus Jakarta Sans 700 — ekran ve bölüm başlıkları (büyük başlık, h1, display). */
  heading: "PlusJakartaSans-Bold",
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
    [fonts.regular]: require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    [fonts.medium]: require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    [fonts.semibold]: require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    [fonts.heading]: require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    [fonts.display]: require("../assets/fonts/Archivo-SemiBold.ttf"),
    [fonts.bold]: require("../assets/fonts/Archivo-Bold.ttf"),
  });
  return loaded || error != null;
}
