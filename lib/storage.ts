import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Oturum jetonu cihazın güvenli deposunda (iOS Keychain / Android Keystore)
 * tutulur. Web'de SecureStore yoktur; Expo Go'nun web hedefi için sessizce
 * bellekte tutmaya düşülür, böylece `expo start --web` çalışmaya devam eder.
 */

const TOKEN_KEY = "elitlig.authToken";

let memoryFallback: string | null = null;

const available = async () => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

export async function saveToken(token: string): Promise<void> {
  if (await available()) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return;
  }
  memoryFallback = token;
}

export async function loadToken(): Promise<string | null> {
  if (await available()) {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }
  return memoryFallback;
}

export async function clearToken(): Promise<void> {
  if (await available()) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  memoryFallback = null;
}

/* ───────────── KALICI OTURUM YARDIMCILARI ─────────────
 * Kullanıcı kendisi çıkış yapana kadar oturum açık kalır (Instagram / WhatsApp
 * gibi). İki parça bunu destekler:
 *   · Son bilinen kullanıcı profili: uygulama internetsiz açılsa da ya da
 *     sunucu o an yanıt vermese de kullanıcı GİRİŞLİ görünür; doğrulama
 *     bağlantı gelince arkada yapılır.
 *   · Son yenileme zamanı: jeton en fazla günde bir yenilenir
 *     (POST /api/users/session/refresh), böylece kullanılan cihazda süresi
 *     hiç dolmaz.
 * Profil hassas değildir (ad, rol, il) ve AsyncStorage'de durur; jeton ise
 * yalnız güvenli depoda. */

const SESSION_USER_KEY = "elitlig.session.user.v1";
const SESSION_REFRESHED_AT_KEY = "elitlig.session.refreshedAt.v1";

export async function saveSessionUser(user: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  } catch {
    // Önbellek yazılamazsa yalnız çevrimdışı açılış etkilenir.
  }
}

export async function loadSessionUser<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export async function markSessionRefreshed(at: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_REFRESHED_AT_KEY, String(at));
  } catch {
    // Yazılamazsa bir sonraki açılışta yeniden yenilenir; zararsız.
  }
}

export async function loadSessionRefreshedAt(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_REFRESHED_AT_KEY);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export async function clearSessionCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([SESSION_USER_KEY, SESSION_REFRESHED_AT_KEY]);
  } catch {
    // Yok sayılır.
  }
}

/** İlk açılıştaki şehir seçim ekranının görüldüğünü işaretleyen bayrak. */
export const INTRO_SEEN_KEY = "elitlig.intro.v1";
