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
 *   2. FONT — Archivo ve Plus Jakarta Sans yüklenir. Bu adım olmadan uygulama ilk karesini
 *      sistem fontuyla çizer, fontlar gelince tüm metin zıplar (FOUT). Skor
 *      listesinde bu kabul edilemez.
 *
 * Bu iki bekleyiş SPLASH EKRANININ ARKASINDA olur: `preventAutoHideAsync` ile
 * splash açık tutulur, kapı hazır olduğunda kapatılır. Kullanıcı beyaz bir
 * kare ya da font zıplaması görmez.
 *
 * LOGO AÇILIŞI: splash kapandığı karede, SOĞUK AÇILIŞTA, uygulamanın üstüne
 * mor logo animasyonu (components/IntroSplash.tsx) konur. Uygulama altta
 * hemen yüklenir; animasyon bitince saydamlaşıp kalkar. Tema değişimi
 * yeniden yüklemesinde (THEME_RELOAD_KEY / görüntü kaydı) oynamaz.
 */
import "@expo/metro-runtime";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { THEME_STORAGE_KEY, setStoredTheme } from "./constants/themePreference";
import { THEME_RELOAD_KEY, THEME_SNAPSHOT_KEY } from "./lib/themeTransition";
import { useAppFonts } from "./theme/fonts";

// Splash'i biz kapatacağız; hata yutulur çünkü splash zaten kapalıysa reddeder.
SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedGate() {
  const [themeReady, setThemeReady] = useState(false);
  /* Tema değişiminden sonraki açılış: eski temanın görüntüsü (bkz. lib/themeTransition.ts). */
  const [snapshot, setSnapshot] = useState(null);
  /* Logo açılışı: yalnız soğuk açılışta (tema yeniden yüklemesinde değil). */
  const [intro, setIntro] = useState(false);
  const fontsReady = useAppFonts();
  const ready = themeReady && fontsReady;

  useEffect(() => {
    AsyncStorage.multiGet([THEME_STORAGE_KEY, THEME_SNAPSHOT_KEY, THEME_RELOAD_KEY])
      .catch(() => [])
      .then((pairs) => {
        const map = Object.fromEntries(pairs ?? []);
        setStoredTheme(map[THEME_STORAGE_KEY] ?? null);
        if (map[THEME_SNAPSHOT_KEY]) {
          setSnapshot(map[THEME_SNAPSHOT_KEY]);
          AsyncStorage.removeItem(THEME_SNAPSHOT_KEY).catch(() => {});
        }
        const themeReload = Boolean(map[THEME_SNAPSHOT_KEY] || map[THEME_RELOAD_KEY]);
        if (map[THEME_RELOAD_KEY]) AsyncStorage.removeItem(THEME_RELOAD_KEY).catch(() => {});
        // `shouldPlayIntro` aynı JS ömründe ikinci kurulumu engeller (Android'de
        // etkinlik yeniden yaratılırsa kapı yeniden kurulur). Modül, tema
        // belirlendikten SONRA yüklenmeli — o yüzden satır-içi require.
        if (!themeReload && require("./components/IntroSplash").shouldPlayIntro()) setIntro(true);
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
  const { ThemeSwitchOverlay } = require("./components/ThemeSwitchOverlay");
  // Uygulama ALTTA hemen kurulur; logo sahnesi üstte oynar ve kendini kaldırır.
  // Sarmalayıcı daima aynıdır: sahne kalkınca ağaç değişip uygulama yeniden
  // kurulmasın.
  const IntroSplash = intro ? require("./components/IntroSplash").IntroSplash : null;
  return React.createElement(
    View,
    { style: { flex: 1 } },
    React.createElement(ThemeSwitchOverlay, { uri: snapshot }, React.createElement(App)),
    IntroSplash ? React.createElement(IntroSplash, { onDone: () => setIntro(false) }) : null,
  );
}

renderRootComponent(ThemedGate);
