/**
 * TEMA GEÇİŞİ (Gece teması · "Portal Open").
 *
 * Palet modül yüklenirken donduğu için tema değişimi JS'in yeniden
 * yüklenmesini gerektirir. Yeniden yükleme anı kullanıcıya bir "kesme" gibi
 * görünmesin diye:
 *
 *   1. Değişimden hemen önce ekranın görüntüsü alınır (`react-native-view-shot`)
 *      ve geçici dosya yolu cihazda saklanır.
 *   2. Uygulama yeniden yüklenir: geliştirmede `DevSettings.reload()`, yayında
 *      `expo-updates`'in `reloadAsync()`'i (mağaza sürümü gerektirmez).
 *   3. Açılışta `index.js` kaydı okur; yeni temalı uygulama, eski temanın
 *      görüntüsünün ALTINDA açılır ve görüntü ortadan büyüyerek söner
 *      (`ThemeSwitchOverlay`). Kullanıcı yeni temanın "açıldığını" görür.
 *
 * Her adım isteğe bağlıdır: görüntü alınamazsa geçiş animasyonsuz olur,
 * yeniden yükleme yapılamazsa çağıran tarafa `false` döner.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DevSettings, Platform } from "react-native";

export const THEME_SNAPSHOT_KEY = "elitlig.themeSnapshot.v1";

/**
 * Yeniden yüklemenin tema değişiminden geldiğini işaretler. Açılışta
 * `index.js` okur ve siler; işaret varsa logo açılış animasyonu
 * (components/IntroSplash.tsx) OYNAMAZ — kullanıcı uygulamayı yeni açmadı,
 * yalnız tema değiştirdi. Görüntü alınamasa bile (web, hata) işaret yazılır.
 */
export const THEME_RELOAD_KEY = "elitlig.themeReload.v1";

/** Ekranın görüntüsünü alır ve yolunu saklar. Hata yutulur. */
async function captureSnapshot(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { captureScreen } = await import("react-native-view-shot");
    const uri = await captureScreen({ format: "jpg", quality: 0.85, result: "tmpfile" });
    if (uri) await AsyncStorage.setItem(THEME_SNAPSHOT_KEY, uri);
  } catch {
    // Görüntü alınamadı: geçiş animasyonsuz olur, tema yine değişir.
  }
}

/**
 * Temayı uygulamak için uygulamayı yeniden yükler.
 * @returns yeniden yükleme başlatıldıysa `true`; bu ortamda mümkün değilse `false`.
 */
export async function reloadForTheme(): Promise<boolean> {
  await captureSnapshot();
  await AsyncStorage.setItem(THEME_RELOAD_KEY, "1").catch(() => {});
  if (__DEV__) {
    DevSettings.reload();
    return true;
  }
  try {
    const Updates = await import("expo-updates");
    await Updates.reloadAsync();
    return true;
  } catch {
    await AsyncStorage.multiRemove([THEME_SNAPSHOT_KEY, THEME_RELOAD_KEY]).catch(() => {});
    return false;
  }
}
