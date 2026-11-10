import { get, post } from "../http";

/**
 * UYGULAMA REKLAM ALANLARI — sunucu routes/publicAds.js
 *
 *   GET  /public/ads?surface=app&cityId=   alan ayarları + canlı sponsorlar + AdMob
 *   POST /public/ads/track                 gösterim / tıklama sayaçları
 *
 * Alan modu yönetimden (web: Sponsorlar → Reklam alanları → Mobil uygulama)
 * belirlenir: sponsor | google | auto (sponsor öncelikli, boşsa Google).
 * Kapalı alan ve birimi girilmemiş "google" alanı sunucudan hiç gelmez.
 *
 * Alan anahtarları sunucudaki constants/adZones.js ile aynıdır.
 */

export type AppAdZoneKey = "app_home" | "app_match" | "app_inline" | "app_popup";
export type AdMode = "sponsor" | "google" | "auto";

export interface AdZoneConfig {
  mode: AdMode;
  kind: "banner" | "inline" | "popup";
  google: { android?: string; ios?: string; format: string } | null;
  rotateSeconds: number;
  delaySeconds?: number;
  frequencyHours?: number;
}

export interface AdSponsor {
  id: number;
  name: string;
  tagline?: string;
  linkUrl?: string;
  brandColor?: string;
  images: Partial<Record<"logo" | "app_banner" | "app_popup" | "web_mobile" | "web_popup", string>>;
  placements: string[];
}

export interface AppAds {
  google: { enabled: boolean; nonPersonalized?: boolean };
  zones: Partial<Record<AppAdZoneKey, AdZoneConfig>>;
  sponsors: AdSponsor[];
}

export const EMPTY_ADS: AppAds = { google: { enabled: false }, zones: {}, sponsors: [] };

export async function getAppAds(cityId?: number | string | null): Promise<AppAds> {
  const data = await get<Partial<AppAds>>("/public/ads", { surface: "app", ...(cityId ? { cityId: String(cityId) } : {}) });
  return {
    google: data?.google ?? { enabled: false },
    zones: data?.zones && typeof data.zones === "object" ? data.zones : {},
    sponsors: Array.isArray(data?.sponsors) ? data.sponsors : [],
  };
}

/** Alanda kullanılacak görsel (sunucu PLACEMENT image/fallback ile aynı). */
const ZONE_IMAGE: Record<AppAdZoneKey, [keyof AdSponsor["images"], keyof AdSponsor["images"]]> = {
  app_home: ["app_banner", "web_mobile"],
  app_match: ["app_banner", "web_mobile"],
  app_inline: ["app_banner", "web_mobile"],
  app_popup: ["app_popup", "web_popup"],
};

export function adImage(sponsor: AdSponsor, zone: AppAdZoneKey): string | null {
  const [main, fallback] = ZONE_IMAGE[zone];
  return sponsor.images?.[main] || sponsor.images?.[fallback] || null;
}

/** Alanın göstereceği sponsorlar; boşsa ve mod izin veriyorsa Google. */
export function resolveAppZone(ads: AppAds, zone: AppAdZoneKey) {
  const config = ads.zones[zone];
  if (!config) return { config: null, sponsors: [] as AdSponsor[], google: null };
  const sponsors = config.mode === "google"
    ? []
    : ads.sponsors.filter((s) => s.placements?.includes(zone) && adImage(s, zone));
  const google = !sponsors.length && config.mode !== "sponsor" && ads.google?.enabled ? config.google : null;
  return { config, sponsors, google };
}

/* ------------------------------- sayaçlar ------------------------------- */

type AdEvent = { sponsorId: number; zone: AppAdZoneKey; type: "view" | "click" };
let queue: AdEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const events = queue.splice(0, 40);
  post("/public/ads/track", { events }).catch(() => {
    /* sayaç hatası kullanıcıya yansımaz */
  });
  if (queue.length) flush();
}

export function trackAd(sponsorId: number, zone: AppAdZoneKey, type: "view" | "click") {
  if (!sponsorId) return;
  queue.push({ sponsorId, zone, type });
  if (type === "click") flush();
  else if (!timer) timer = setTimeout(flush, 5000);
}
