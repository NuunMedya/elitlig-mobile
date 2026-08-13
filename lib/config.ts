import Constants from "expo-constants";

/**
 * Yapılandırma tek noktadan okunur.
 *
 * Değerler app.json → expo.extra üzerinden gelir; böylece EAS build profilleri
 * (development / preview / production) aynı koda farklı adres verebilir.
 * Geliştirmede bilgisayarın yerel IP'sini kullanın (telefon "localhost"u kendi
 * cihazı sanar): ör. http://192.168.1.20:3000
 */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

const asString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBool = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes"].includes(value.toLowerCase());
  return fallback;
};

/** API kökü — sonda eğik çizgi yok. */
export const API_BASE_URL = asString(
  extra.apiBaseUrl,
  "https://elitlig-api-88a866b7a4da.herokuapp.com"
).replace(/\/+$/, "");

/** Socket.io sunucusu; ayrı verilmediyse API ile aynı köktür. */
export const SOCKET_URL = asString(extra.socketUrl, API_BASE_URL).replace(/\/+$/, "");

/** Canlı maçta soket bağlanamazsa devreye giren yoklama aralığı (ms). */
export const LIVE_FALLBACK_POLL_MS = asNumber(extra.liveFallbackPollMs, 25_000);

/** Soket tamamen kapatılabilsin (sorun giderme / kurumsal ağlar). */
export const LIVE_SOCKET_ENABLED = asBool(extra.liveSocketEnabled, true);

/** Kapsam seçilmemişse açılacak varsayılan şehir. */
export const DEFAULT_CITY_ID = asNumber(extra.defaultCityId, 1);

/** src/api/apiConfig.js ile aynı zaman aşımı bütçeleri. */
export const API_TIMEOUTS = {
  DEFAULT: 15_000,
  HEAVY: 30_000,
} as const;

/** GET yeniden deneme gecikmeleri — web istemcisiyle aynı. */
export const GET_RETRY_DELAYS = [500, 1500] as const;
