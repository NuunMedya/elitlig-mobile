/**
 * Özel giriş noktası (v2).
 *
 * Kural: uygulama bileşeni Expo'ya ANINDA kaydedilmelidir — gecikmeli kayıt
 * "App entry not found" hatası üretir. Bu yüzden burada hemen bir kapı
 * bileşeni kaydedilir; kapı, tema tercihini okuyana kadar boş ekran gösterir
 * (göz açıp kapama süresi), sonra asıl uygulamayı yükler. Ekran modülleri ve
 * içlerindeki stiller bu sayede tema bilindikten SONRA değerlendirilir.
 */
import "@expo/metro-runtime";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { THEME_STORAGE_KEY, setStoredTheme } from "./constants/themePreference";

function ThemedGate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .catch(() => null)
      .then((value) => {
        setStoredTheme(value ?? null);
        setReady(true);
      });
  }, []);

  if (!ready) return null;

  // Asıl uygulama ancak tema bilindikten sonra yüklenir (satır-içi require kasıtlı).
  const { App } = require("expo-router/build/qualified-entry");
  return React.createElement(App);
}

renderRootComponent(ThemedGate);
