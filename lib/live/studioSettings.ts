import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import type { CaptionSeconds } from "./lowerThird";
import type { FpsOption, QualityKey } from "./rig";
import type { BugCorner, BugVariant } from "./scorebug";

/**
 * STÜDYO AYARLARI — cihazda saklanan yayın tercihleri.
 *
 *   · Görünüm / kalite tercihleri (gizli değil) → AsyncStorage, tek JSON.
 *   · Elle RTMP adresi + yayın anahtarı (GİZLİ) → SecureStore (Keychain /
 *     Keystore). Anahtar hiçbir zaman AsyncStorage'e ya da günlüğe yazılmaz.
 *
 * Okuma hataları sessizce varsayılana düşer: ayar dosyası bozulsa bile stüdyo
 * açılmalıdır.
 */

export type SponsorMode = "off" | "fixed" | "rotate";
export type ReplaySeconds = 6 | 10 | 13;

export interface StudioSettings {
  quality: QualityKey;
  fps: FpsOption;
  /** null → kalite ön ayarının bit hızı. */
  bitrateKbps: number | null;
  bugVariant: BugVariant;
  bugCorner: BugCorner;
  showClock: boolean;
  goalFlash: boolean;
  sponsorMode: SponsorMode;
  /** Dönüşümlü kipte bir sponsorun ekranda kalma süresi (sn). */
  sponsorSeconds: number;
  captionSeconds: CaptionSeconds;
  replaySeconds: ReplaySeconds;
  replayRate: number;
  /** Yayın telefon hafızasına da kaydedilsin mi (yayın başlarken sorulur; son seçim hatırlanır). */
  saveLocal: boolean;
  /** Takım kimliği → elle girilen kısa kod / şerit rengi. */
  teamCodes: Record<string, string>;
  teamColors: Record<string, string>;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  quality: "720p",
  fps: 30,
  bitrateKbps: null,
  bugVariant: "premier",
  bugCorner: "left",
  showClock: true,
  goalFlash: true,
  sponsorMode: "off",
  sponsorSeconds: 20,
  captionSeconds: 10,
  replaySeconds: 10,
  replayRate: 0.5,
  saveLocal: true,
  teamCodes: {},
  teamColors: {},
};

const SETTINGS_KEY = "elitlig.studio.settings.v1";
const RTMP_KEY = "elitlig.studio.rtmp.v1";
const MAX_TEAM_ENTRIES = 60;

const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

function stringMap(value: unknown, test: (v: string) => boolean): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(-MAX_TEAM_ENTRIES)) {
    if (typeof v === "string" && test(v)) out[k] = v;
  }
  return out;
}

export function normalizeSettings(input: unknown): StudioSettings {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const bitrate = Number(src.bitrateKbps);
  const sponsorSeconds = Number(src.sponsorSeconds);
  const rate = Number(src.replayRate);
  return {
    quality: pick<QualityKey>(src.quality, ["720p", "540p", "1080p"], d.quality),
    fps: pick<FpsOption>(src.fps, [25, 30], d.fps),
    bitrateKbps: Number.isFinite(bitrate) && bitrate >= 300 && bitrate <= 8000 ? Math.round(bitrate) : null,
    bugVariant: pick<BugVariant>(src.bugVariant, ["premier", "compact", "bottom"], d.bugVariant),
    bugCorner: pick<BugCorner>(src.bugCorner, ["left", "right"], d.bugCorner),
    showClock: src.showClock !== false,
    goalFlash: src.goalFlash !== false,
    sponsorMode: pick<SponsorMode>(src.sponsorMode, ["off", "fixed", "rotate"], d.sponsorMode),
    sponsorSeconds: Number.isFinite(sponsorSeconds) ? Math.min(120, Math.max(5, Math.round(sponsorSeconds))) : d.sponsorSeconds,
    captionSeconds: pick<CaptionSeconds>(src.captionSeconds, [6, 10, 20, 0], d.captionSeconds),
    replaySeconds: pick<ReplaySeconds>(src.replaySeconds, [6, 10, 13], d.replaySeconds),
    replayRate: pick<number>(rate, [0.25, 0.5, 0.75, 1], d.replayRate),
    saveLocal: src.saveLocal !== false,
    teamCodes: stringMap(src.teamCodes, (v) => v.length > 0 && v.length <= 4),
    teamColors: stringMap(src.teamColors, (v) => /^#[0-9a-f]{6}$/i.test(v)),
  };
}

export async function loadStudioSettings(): Promise<StudioSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveStudioSettings(settings: StudioSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ayar yazılamazsa oturum boyunca bellekteki değer geçerli kalır */
  }
}

/* ───────── elle RTMP hedefi (gizli) ───────── */

export interface RtmpTarget {
  url: string;
  key: string;
}

export const DEFAULT_RTMP_URL = "rtmp://a.rtmp.youtube.com/live2";

const secureAvailable = async () => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

export async function loadRtmpTarget(): Promise<RtmpTarget | null> {
  try {
    if (!(await secureAvailable())) return null;
    const raw = await SecureStore.getItemAsync(RTMP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RtmpTarget>;
    const url = String(parsed.url ?? "").trim();
    const key = String(parsed.key ?? "").trim();
    return url && key ? { url, key } : null;
  } catch {
    return null;
  }
}

/** true → güvenli depoya yazıldı. */
export async function saveRtmpTarget(target: RtmpTarget): Promise<boolean> {
  try {
    if (!(await secureAvailable())) return false;
    await SecureStore.setItemAsync(RTMP_KEY, JSON.stringify({ url: target.url.trim(), key: target.key.trim() }));
    return true;
  } catch {
    return false;
  }
}

export async function clearRtmpTarget(): Promise<void> {
  try {
    if (await secureAvailable()) await SecureStore.deleteItemAsync(RTMP_KEY);
  } catch {
    /* yok say */
  }
}

/** "rtmp://sunucu/uygulama" + anahtar biçimi doğru mu (yayına başlamadan önce). */
export function validateRtmp(url: string, key: string): string | null {
  const u = url.trim();
  const k = key.trim();
  if (!/^rtmps?:\/\/[^/\s]+\/[^\s]+$/i.test(u)) return "Sunucu adresi rtmp://sunucu/uygulama biçiminde olmalı (ör. rtmp://a.rtmp.youtube.com/live2).";
  if (!k) return "Yayın anahtarını gir.";
  if (/\s/.test(k)) return "Yayın anahtarında boşluk olamaz.";
  return null;
}
