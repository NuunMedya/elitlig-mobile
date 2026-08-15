/**
 * Şehir Instagram hesapları — YouTube kanallarıyla aynı düzen.
 *
 * Anahtar: şehir etiketinin Türkçe küçük harf hali. Yeni bölge eklemek için
 * sözlüğe bir satır eklemek yeterlidir; hesabı olmayan şehirlerde Instagram
 * satırı görünmez.
 */
const CITY_INSTAGRAM: Record<string, string> = {
  ankara: "elitlig.ankara",
  istanbul: "elitlig.istanbul",
  "istanbul avrupa": "istanbulavrupaelitlig",
  "tekirdağ": "elitlig_tekirdag",
  "ankara sincan": "elitlig.sincan",
  sincan: "elitlig.sincan",
};

const keyOf = (label?: string | null) =>
  String(label ?? "").trim().toLocaleLowerCase("tr-TR");

export function instagramUrl(cityLabel?: string | null): string | null {
  const handle = CITY_INSTAGRAM[keyOf(cityLabel)];
  return handle ? `https://www.instagram.com/${handle}/` : null;
}
