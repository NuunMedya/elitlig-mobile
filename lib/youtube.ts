/**
 * Şehir YouTube kanalları.
 *
 * Her ilin kendi kanalı var; maçlar oradan canlı yayınlanır. Yeni şehir
 * eklemek için sözlüğe bir satır eklemek yeterlidir (anahtar: şehir adının
 * Türkçe küçük harf hali — API'deki şehir etiketiyle eşleşir).
 *
 * Kanal adları Türkçe karakter içerebildiğinden (İ, ı, ğ) adres kurulurken
 * kodlanır: "@İstanbulElitlig" → "@%C4%B0stanbulElitlig".
 *
 * `/live` yolu YouTube'un kısayoludur: kanal o an yayındaysa doğrudan canlı
 * yayını, değilse kanal sayfasını açar.
 */
const CITY_CHANNELS: Record<string, string> = {
  ankara: "elitligankara",
  istanbul: "İstanbulElitlig",
  "istanbul avrupa": "ElitLigİstanbulAvrupa",
  "tekirdağ": "ElitligTekirdag",
  izmir: "izmirelitlig",
  "kırklareli": "ElitLigKırklareli",
};

const keyOf = (label?: string | null) =>
  String(label ?? "").trim().toLocaleLowerCase("tr-TR");

export function youtubeChannelUrl(cityLabel?: string | null): string | null {
  const handle = CITY_CHANNELS[keyOf(cityLabel)];
  return handle ? `https://www.youtube.com/@${encodeURIComponent(handle)}` : null;
}

export function youtubeLiveUrl(cityLabel?: string | null): string | null {
  const channel = youtubeChannelUrl(cityLabel);
  return channel ? `${channel}/live` : null;
}
