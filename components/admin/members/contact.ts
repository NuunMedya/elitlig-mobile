import * as Linking from "expo-linking";
import { Alert } from "react-native";

/**
 * Telefon, SMS, e-posta ve WhatsApp bağlantıları sistem uygulamasında açılır
 * (uygulama içi tarayıcı tel:/sms: şemalarını açamaz).
 */
export async function openExternal(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Bağlantı açılamadı", "Bu cihazda bu bağlantıyı açacak bir uygulama bulunamadı.");
  }
}
