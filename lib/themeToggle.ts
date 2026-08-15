import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, DevSettings } from "react-native";
import { isDark } from "@/constants/theme";
import { THEME_STORAGE_KEY } from "@/constants/themePreference";

/**
 * Tema düğmesi davranışı: tercihi kaydet, uygulamayı tazele.
 *
 * Renk paleti açılışta dondurulduğundan geçiş, JS'in yeniden yüklenmesiyle
 * uygulanır (~1 sn). Geliştirmede DevSettings.reload, yayında expo-updates
 * kullanılır; ikisi de yoksa kullanıcıdan uygulamayı yeniden açması istenir.
 */
export async function toggleTheme(): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, isDark ? "light" : "dark");
  } catch {
    Alert.alert("Kaydedilemedi", "Tema tercihi kaydedilirken bir sorun oluştu.");
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates = require("expo-updates");
    if (Updates?.reloadAsync) {
      await Updates.reloadAsync();
      return;
    }
  } catch {
    // expo-updates kurulu değil (geliştirme) — DevSettings'e düş.
  }

  try {
    DevSettings.reload();
  } catch {
    Alert.alert("Tema kaydedildi", "Değişiklik, uygulamayı yeniden açınca uygulanacak.");
  }
}
