import * as WebBrowser from "expo-web-browser";
import { Alert, Linking } from "react-native";

import { WEB_BASE_URL } from "./config";


/**
 * Paylaşım metinlerine eklenen web adresleri. Bağlantıyı alan kişi uygulamayı
 * kurmamış olabilir; adres sitede çalışır (elitlig-client App.js rotaları).
 * İli bilinmeyen maçta adres üretilmez: çalışmayan bağlantı paylaşılmaz.
 */
export function webMatchUrl(match: {
  id: number | string;
  city_id?: number | null;
  first_team_name?: string | null;
  second_team_name?: string | null;
}): string | null {
  if (!match.city_id) return null;
  // Okunaklı adres: iki takım adı + numara (sitedeki src/utils/entityPath.js ile aynı kural).
  const slug = webSlug([match.first_team_name, match.second_team_name].filter(Boolean).join(" "));
  return `${WEB_BASE_URL}/sehir/${match.city_id}/mac/${slug ? `${slug}-` : ""}${match.id}`;
}

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** "Kartallar FK" -> "kartallar-fk" (en çok 70 karakter, kelime ortasından kesilmez). */
export function webSlug(value: string): string {
  const words = value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 70) break;
    slug = next;
  }
  return slug || words.join("-").slice(0, 70);
}

/**
 * Tekil haber: sitedeki haber ayrıntı sayfası. Sunucu okunaklı adresi hazır
 * verir (`path`: /haber/kartallar-sampiyon-oldu-111111112222); eski sunucuda ya
 * da yalnız kimlik eldeyse adres kimlikle kurulur (site onu okunaklı adrese
 * düzeltir).
 */
export function webNewsUrl(news: string | { id: string; path?: string | null }): string {
  const path = typeof news === "string" ? "" : news.path ?? "";
  if (/^\/haber\/[a-z0-9-]+$/.test(path)) return `${WEB_BASE_URL}${path}`;
  const id = typeof news === "string" ? news : news.id;
  return `${WEB_BASE_URL}/haber/${encodeURIComponent(id)}`;
}

/**
 * Dış bağlantı açıcı.
 *
 * iOS'ta Linking.openURL kimi cihazlarda geçerli https adreslerini bile
 * "Unable to open URL" diye reddedebiliyor. Uygulama içi tarayıcı
 * (SFSafariViewController) bu sorunu yaşamaz ve kullanıcıyı uygulamadan
 * koparmaz; o da olmazsa sistem tarayıcısı denenir.
 */
export async function openLink(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
    return;
  } catch {
    // Uygulama içi tarayıcı açılamadı; sisteme bırak.
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Bağlantı açılamadı", "Lütfen daha sonra tekrar deneyin.");
  }
}

/**
 * YouTube bağlantısı: önce sistem (evrensel bağlantı) — YouTube uygulaması
 * kuruluysa canlı yayın orada, tam ekran ve sohbetle açılır; açılamazsa
 * uygulama içi tarayıcıya (`openLink`) düşer.
 */
export async function openYouTube(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
    return;
  } catch {
    // Sistem açamadı; uygulama içi tarayıcı denensin.
  }
  await openLink(url);
}
