/**
 * SKORBORD (yayın grafiği) — web SkorOverlay "ScoreBugPremier" ile birebir.
 *
 * Renkler web overlay CSS değişkenlerinden (src/pages/SkorOverlay.css) alındı;
 * yayın grafiği tema değil yayın kimliğidir, bu yüzden açık/koyu temadan
 * bağımsız sabittir ve lib/ altında durur.
 */

export const BUG = {
  /** Web sahnesi 1920×1080; konum ve ölçü buna göre. */
  stageW: 1920,
  stageH: 1080,
  left: 56,
  top: 48,
  rowH: 44,
  teamW: 106,
  scoreW: 38,
  medalW: 62,
  radius: 6,
  /** "Orta-alt" skorbord (web BottomScoreBoard, 1920 sahnesinde). */
  low: {
    width: 1000,
    bottom: 64,
    bandH: 84,
    teamW: 356,
    scoreW: 82,
    medalW: 74,
    logo: 66,
    crest: 52,
    clockH: 34,
    radius: 12,
  },
  colors: {
    barTop: "#360a36",
    barBottom: "#240024",
    p900: "#1a001a",
    v700: "#54009c",
    v400: "#a855f7",
    live: "#ff2d55",
    white: "#ffffff",
    hair: "rgba(216, 191, 255, 0.14)",
    homeBright: "#8a6cf0",
    awayBright: "#f5c518",
    lowerGoal: "#16a34a",
    lowerCard: "#f5c518",
    lowerRed: "#dc2626",
  },
} as const;

/** Reji "Skorbord" seçimi: köşe (premier) ya da orta-alt bant. */
export type BugVariant = "premier" | "bottom";

export const BUG_VARIANTS: { key: BugVariant; label: string; hint: string }[] = [
  { key: "premier", label: "Köşe skorbord", hint: "Sol üstte ince çubuk (varsayılan)" },
  { key: "bottom", label: "Orta-alt skorbord", hint: "Ekranın altında ortalanmış geniş bant" },
];

const GENERIC = new Set(["spor", "sk", "fk", "sc", "fc", "kulubu", "kulübü", "gücü", "gucu", "birliği", "birligi", "takımı", "takimi"]);

/** web live/teamColor.js teamShortCode ile birebir — "Ankara Gençlikspor" → "ANG". */
export function teamShortCode(teamName: string | null | undefined): string {
  const raw = String(teamName || "").trim();
  if (!raw) return "TAK";
  const words = raw
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w));
  if (!words.length) return raw.slice(0, 3).toLocaleUpperCase("tr-TR");
  if (words.length === 1) return words[0].slice(0, 3).toLocaleUpperCase("tr-TR");
  const meaningful = words.filter((w) => !GENERIC.has(w.toLocaleLowerCase("tr-TR")));
  const source = meaningful.length ? meaningful : words;
  if (source.length === 1) return source[0].slice(0, 3).toLocaleUpperCase("tr-TR");
  const picked = source.slice(0, 3);
  const counts = picked.map(() => 1);
  let remaining = 3 - picked.length;
  picked.forEach((word, index) => {
    const extra = Math.min(remaining, word.length - 1);
    counts[index] += extra;
    remaining -= extra;
  });
  return picked
    .map((word, index) => word.slice(0, counts[index]))
    .join("")
    .toLocaleUpperCase("tr-TR");
}

/** "1. YARI" | "2. YARI" | "UZATMA" */
export function periodLabel(period: number | null | undefined): string {
  const p = Number(period) || 1;
  if (p >= 3) return "UZATMA";
  if (p === 2) return "2. YARI";
  return "1. YARI";
}

/** ms → "MM:SS" (web clockText ile aynı). */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
