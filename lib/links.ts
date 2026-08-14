import * as WebBrowser from "expo-web-browser";
import { Alert, Linking } from "react-native";

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
