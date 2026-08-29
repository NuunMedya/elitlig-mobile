import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, DevSettings } from "react-native";
import { isDark } from "@/constants/theme";
import { THEME_STORAGE_KEY } from "@/constants/themePreference";

/**
 * Tema düğmesi davranışı: tercihi kaydet, uygulamayı tazele.
 *
 * Renk paleti açılışta dondurulduğundan geçiş, JS'in yeniden yüklenmesiyle
 * uygulanır (~1 sn). Geliştirmede DevSettings.reload kullanılır; yayında
 * tazeleme yoktur, kullanıcıdan uygulamayı yeniden açması istenir.
 *
 * İKİ TUZAK, İKİSİ DE ÖLÇÜLDÜ:
 *
 *  1. `DevSettings.reload()` YAYINDA HATA ATMAZ. React Native `__DEV__` false
 *     iken gövdesi boş bir nesne koyar (`reload() {}`), dolayısıyla bir
 *     try/catch'in catch dalı hiç çalışmaz. Eski kurguda kullanıcı yayındaki
 *     uygulamada temayı değiştiriyor, hiçbir şey olmuyor ve hiçbir şey
 *     söylenmiyordu. Bu yüzden karar `__DEV__` ile verilir, istisnayla değil.
 *
 *  2. `expo-updates` BU PROJEDE KURULU DEĞİL (package.json). `require` her
 *     zaman patlıyor, dal ölü. Sessiz bir yedek gibi görünen o blok
 *     kaldırıldı: olmayan bir yedeğe güvenmek, yedeği olmamaktan kötüdür.
 *
 * NOT: bu yardımcıyı şu an hiçbir ekran çağırmıyor — tema seçimi
 * `app/(tabs)/profil.tsx` içindeki üç durumlu akıştan yapılıyor (Açık / Koyu /
 * Sistem; bu ikili yardımcı "Sistem"i ifade edemiyor). Aynı hatanın iki yerde
 * yaşamaması için davranış burada da düzeltildi.
 */
export async function toggleTheme(): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, isDark ? "light" : "dark");
  } catch {
    Alert.alert("Tema kaydedilemedi", "Tercih cihaza yazılamadı. Tekrar dene; sürerse uygulamayı kapatıp aç.");
    return;
  }

  if (__DEV__) {
    DevSettings.reload();
    return;
  }

  Alert.alert(
    "Tema kaydedildi",
    "Değişiklik, uygulamayı tamamen kapatıp yeniden açınca uygulanacak."
  );
}
