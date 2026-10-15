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

/** Tekil haber: haber listesi açılır ve haber penceresi kendiliğinden gelir. */
export function webNewsUrl(publicId: string): string {
  return `${WEB_BASE_URL}/haberler?haber=${encodeURIComponent(publicId)}`;
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
