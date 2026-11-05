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
} as const;

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
