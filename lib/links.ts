import * as WebBrowser from "expo-web-browser";
import { Alert, Linking } from "react-native";

import { WEB_BASE_URL } from "./config";


/**
 * Paylaşım metinlerine eklenen web adresleri. Bağlantıyı alan kişi uygulamayı
 * kurmamış olabilir; adres sitede çalışır (elitlig-client App.js rotaları).
 * İli bilinmeyen maçta adres üretilmez: çalışmayan bağlantı paylaşılmaz.
 */
export function webMatchUrl(match: { id: number | string; city_id?: number | null }): string | null {
  if (!match.city_id) return null;
  return `${WEB_BASE_URL}/sehir/${match.city_id}/mac/${match.id}`;
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
