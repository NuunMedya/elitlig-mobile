/**
 * MOBİL REJİ — kamera ekranının sabit koyu paleti ve olay yardımcıları.
 *
 * Kamera ekranı temadan bağımsız HEP koyudur (görüntünün üstünde okunurluk,
 * gece maçında göz kamaşmaması). Renkler bu yüzden temadan değil buradan gelir.
 */

import { isGoalCode, type MatchEvent } from "../api/admin/matches";

export const RIG = {
  bg: "#07040b",
  stage: "#000000",
  panel: "rgba(18,10,26,0.94)",
  panelSoft: "rgba(255,255,255,0.06)",
  panelStrong: "rgba(255,255,255,0.12)",
  glass: "rgba(8,4,12,0.62)",
  line: "rgba(216,191,255,0.16)",
  text: "#ffffff",
  textSoft: "rgba(255,255,255,0.72)",
  textMute: "rgba(255,255,255,0.48)",
  brand: "#8b5cf6",
  brandDim: "rgba(139,92,246,0.22)",
  live: "#ff2d55",
  liveDim: "rgba(255,45,85,0.2)",
  ok: "#22c55e",
  okDim: "rgba(34,197,94,0.2)",
  warn: "#f59e0b",
  warnDim: "rgba(245,158,11,0.2)",
  yellow: "#facc15",
  red: "#ef4444",
  home: "#8a6cf0",
  away: "#f5c518",
  /* Stüdyo eklemeleri */
  info: "#38bdf8",
  infoDim: "rgba(56,189,248,0.2)",
  gold: "#f5c518",
  /** Sarı / altın zemin üstündeki koyu metin. */
  ink: "#1a001a",
  scrim: "rgba(4,2,8,0.78)",
  sheet: "#140a1e",
  flash: "rgba(255,255,255,0.9)",
} as const;

/** Takım şeridi için hazır renkler (skorbord altındaki ince çizgi). */
export const TEAM_SWATCHES = [
  "#8a6cf0", "#f5c518", "#ef4444", "#22c55e", "#38bdf8", "#f97316", "#ec4899", "#ffffff", "#0f172a",
] as const;

export type BugEventKind = "goal" | "yellow" | "red" | "other";

/** Skorbord alt bandında gösterilecek olay mı; öyleyse türü ve etiketi. */
export function bugEventOf(ev: MatchEvent | null | undefined): { kind: BugEventKind; label: string } | null {
  if (!ev) return null;
  const code = String(ev.olay_kodu).toUpperCase();
  if (code === "GOAL_OWN") return { kind: "goal", label: "KENDİ KALESİNE" };
  if (isGoalCode(code)) return { kind: "goal", label: code === "GOAL_PENALTY" ? "PENALTI GOLÜ" : "GOL" };
  if (code === "YELLOW_CARD") return { kind: "yellow", label: "SARI KART" };
  if (code === "RED_CARD") return { kind: "red", label: "KIRMIZI KART" };
  if (code === "SUBSTITUTION") return { kind: "other", label: "DEĞİŞİKLİK" };
  return null;
}

/** Alt bandın ekranda kalma süresi. */
export const BUG_EVENT_MS = 12_000;

/** Yayın kalite seçenekleri (telefon yükleme hızına göre). */
export const QUALITY_PRESETS = [
  { key: "720p", label: "720p · 30 fps", hint: "Önerilen (≥ 4 Mbps yükleme)", width: 1280, height: 720, fps: 30, videoBitrateKbps: 2500 },
  { key: "540p", label: "540p · 30 fps", hint: "Zayıf mobil veri", width: 960, height: 540, fps: 30, videoBitrateKbps: 1500 },
  { key: "1080p", label: "1080p · 30 fps", hint: "Güçlü Wi-Fi / 5G (≥ 8 Mbps)", width: 1920, height: 1080, fps: 30, videoBitrateKbps: 4500 },
] as const;

export type QualityKey = (typeof QUALITY_PRESETS)[number]["key"];

export const FPS_OPTIONS = [25, 30] as const;
export type FpsOption = (typeof FPS_OPTIONS)[number];

/** Elle bit hızı seçenekleri (kbps). null = kalite ön ayarının değeri. */
export const BITRATE_OPTIONS = [1000, 1500, 2500, 3500, 4500, 6000] as const;

export interface EncoderConfig {
  key: QualityKey;
  label: string;
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
}

/** Kalite ön ayarı + (varsa) elle seçilen kare hızı / bit hızı → kodlayıcı ayarı. */
export function resolveEncoder(quality: QualityKey, fps?: number | null, bitrateKbps?: number | null): EncoderConfig {
  const preset = QUALITY_PRESETS.find((q) => q.key === quality) ?? QUALITY_PRESETS[0];
  const f = FPS_OPTIONS.includes(fps as FpsOption) ? (fps as number) : preset.fps;
  const b = Number(bitrateKbps) > 0 ? Math.min(8000, Math.max(300, Math.round(Number(bitrateKbps)))) : preset.videoBitrateKbps;
  return { key: preset.key, label: preset.label, width: preset.width, height: preset.height, fps: f, videoBitrateKbps: b };
}

/**
 * Yerel modülün durum iletisini (İngilizce / kod) kullanıcıya gösterilecek
 * Türkçe cümleye çevirir. Bilinmeyen neden parantez içinde korunur (destek için).
 */
export function encoderMessageText(state: string, message?: string | null): string {
  const raw = String(message ?? "").trim();
  const lower = raw.toLowerCase();
  if (lower === "permission_missing") return "Kamera ve mikrofon izni verilmedi.";
  if (lower === "app_background") return "Uygulama arka planda: görüntü durdu. Ekrana dönünce yayın sürer.";
  if (lower === "auth_error") return "Yayın sunucusu bağlantıyı reddetti. Yayın anahtarını kontrol et.";
  if (lower === "bad_stream_key") return "Yayın anahtarı geçersiz ya da başka bir cihazda kullanılıyor.";
  if (lower.startsWith("camera_error")) return "Kamera açılamadı. Başka bir uygulama kamerayı kullanıyor olabilir.";
  const retry = /^\((\d+)\/(\d+)\)/.exec(raw);
  if (state === "reconnecting" && retry) return `Bağlantı koptu, yeniden bağlanılıyor (${retry[1]}/${retry[2]}).`;
  if (state === "reconnecting") return "Bağlantı koptu, yeniden bağlanılıyor.";
  if (state === "failed") {
    const reason = raw.replace(/^\(\d+\/\d+\)\s*/, "");
    if (/timed? ?out|timeout/i.test(reason)) return "Yayın sunucusu yanıt vermedi (zaman aşımı). İnternet bağlantını kontrol et.";
    if (/unknown ?host|resolve|unreachable|no address|enetunreach|network is/i.test(reason)) return "Yayın sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.";
    if (/refused|reset|broken pipe|closed|io_error|econn/i.test(reason)) return "Yayın bağlantısı koptu ve yeniden kurulamadı. Ağı kontrol edip yayını yeniden başlat.";
    if (/malformed|endpoint|url/i.test(reason)) return "Yayın adresi hatalı. rtmp://sunucu/uygulama/anahtar biçiminde olmalı.";
    return reason ? `Yayın bağlantısı kurulamadı (${reason}).` : "Yayın bağlantısı kurulamadı.";
  }
  return raw;
}

/** Ölçülen bit hızının hedefe oranına göre bağlantı sağlığı. */
export type HealthLevel = "good" | "weak" | "bad" | "idle";

export function healthLevel(state: string, bitrateKbps: number | null | undefined, targetKbps: number, fps?: number | null, targetFps?: number): HealthLevel {
  if (state !== "live") return state === "connecting" || state === "reconnecting" ? "weak" : "idle";
  if (bitrateKbps == null) return "good";
  const ratio = targetKbps > 0 ? bitrateKbps / targetKbps : 1;
  const fpsRatio = fps != null && targetFps ? fps / targetFps : 1;
  if (ratio < 0.4 || fpsRatio < 0.5) return "bad";
  if (ratio < 0.7 || fpsRatio < 0.8) return "weak";
  return "good";
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  good: "Bağlantı iyi",
  weak: "Bağlantı zayıf",
  bad: "Bağlantı yetersiz",
  idle: "Yayın kapalı",
};

/** "1:05:09" / "05:09" — yayın süresi. */
export function elapsedText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
