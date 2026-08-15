/**
 * Tema tercihi — girişte (index.js) AsyncStorage'dan okunup buraya yazılır.
 *
 * theme.ts modülü yüklenirken bu değeri eşzamanlı okuyabilsin diye ayrı ve
 * bağımlılıksız bir dosyadır. null = kullanıcı seçim yapmamış, sistem ayarı
 * geçerli.
 */
export type ThemePref = "light" | "dark" | null;

export const THEME_STORAGE_KEY = "elitlig.theme.v1";

let stored: ThemePref = null;

export function setStoredTheme(value: string | null): void {
  stored = value === "dark" ? "dark" : value === "light" ? "light" : null;
}

export function getStoredTheme(): ThemePref {
  return stored;
}
