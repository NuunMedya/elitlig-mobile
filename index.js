/**
 * Özel giriş noktası (v3).
 *
 * Kural: uygulama bileşeni Expo'ya ANINDA kaydedilmelidir — gecikmeli kayıt
 * "App entry not found" hatası üretir. Bu yüzden burada hemen bir kapı
 * bileşeni kaydedilir; kapı, iki ön koşul tamamlanana kadar boş ekran gösterir,
 * sonra asıl uygulamayı yükler:
 *
 *   1. TEMA — AsyncStorage'daki tercih okunur. Ekran modülleri ve içlerindeki
 *      StyleSheet'ler tema bilindikten SONRA değerlendirilsin diye şart.
 *   2. FONT — Archivo ve Inter yüklenir. Bu adım olmadan uygulama ilk karesini
 *      sistem fontuyla çizer, fontlar gelince tüm metin zıplar (FOUT). Skor
 *      listesinde bu kabul edilemez.
 *
 * Bu iki bekleyiş SPLASH EKRANININ ARKASINDA olur: `preventAutoHideAsync` ile
 * splash açık tutulur, kapı hazır olduğunda kapatılır. Kullanıcı beyaz bir
 * kare ya da font zıplaması görmez.
 */
import "@expo/metro-runtime";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { THEME_STORAGE_KEY, setStoredTheme } from "./constants/themePreference";
import { useAppFonts } from "./theme/fonts";

// Splash'i biz kapatacağız; hata yutulur çünkü splash zaten kapalıysa reddeder.
SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedGate() {
  const [themeReady, setThemeReady] = useState(false);
  const fontsReady = useAppFonts();
  const ready = themeReady && fontsReady;

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .catch(() => null)
      .then((value) => {
        setStoredTheme(value ?? null);
        setThemeReady(true);
      });
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // Asıl uygulama ancak tema ve font hazır olduktan sonra yüklenir
  // (satır-içi require kasıtlı).
  const { App } = require("expo-router/build/qualified-entry");
  return React.createElement(App);
}

renderRootComponent(ThemedGate);
