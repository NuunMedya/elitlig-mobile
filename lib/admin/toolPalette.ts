import type { EventCategory } from "../api/admin/tools";

/**
 * ARAÇLAR VERİ RENKLERİ — not, etkinlik ve kart etiketi renkleri.
 *
 * NEDEN lib/ ALTINDA: bunlar tema rengi değil, kullanıcının seçtiği VERİDİR
 * (sunucuya "#rrggbb" olarak yazılır, web panelinde de aynı değerle görünür).
 * Tasarım denetimi app/ ve components/ altında çıplak hex'i yasaklar; veri
 * paletleri bu yüzden burada durur. Değerler web (elitlig-client
 * tools/toolsUi.js NOTE_COLORS, tools/agendaUtils.js CATEGORIES,
 * todos/todos.css etiket renkleri) ile birebir aynıdır.
 */

/** Not renkleri — "" renksizdir. */
export const NOTE_COLORS: { key: string; label: string }[] = [
  { key: "", label: "Renksiz" },
  { key: "#fde68a", label: "Sarı" },
  { key: "#fecaca", label: "Kırmızı" },
  { key: "#bbf7d0", label: "Yeşil" },
  { key: "#bfdbfe", label: "Mavi" },
  { key: "#ddd6fe", label: "Mor" },
  { key: "#fbcfe8", label: "Pembe" },
  { key: "#fed7aa", label: "Turuncu" },
  { key: "#e2e8f0", label: "Gri" },
];

/** Etkinlik türlerinin varsayılan rengi. */
export const EVENT_CATEGORY_COLORS: Record<EventCategory, string> = {
  general: "#6366f1",
  match: "#7c3aed",
  meeting: "#0284c7",
  training: "#059669",
  deadline: "#dc2626",
  payment: "#d97706",
  personal: "#db2777",
};

/** Etkinliğe elle verilebilecek renkler (ColorField paleti). */
export const EVENT_COLORS: string[] = [
  "#6366f1",
  "#7c3aed",
  "#0284c7",
  "#0d9488",
  "#059669",
  "#ca8a04",
  "#d97706",
  "#dc2626",
  "#db2777",
  "#475569",
];

/** Takvimde son tarihli Yapılacaklar kartının rengi. */
export const AGENDA_TODO_COLOR = "#dc2626";

/** Etkinliğin rengi: kendi rengi yoksa türünün rengi. */
export function eventColor(item: { color?: string | null; category?: EventCategory | null; source?: string }): string {
  if (item.source === "todo") return AGENDA_TODO_COLOR;
  return item.color || EVENT_CATEGORY_COLORS[item.category ?? "general"] || EVENT_CATEGORY_COLORS.general;
}

/** Yapılacaklar kart etiketlerinin renk anahtarları (sunucu LABEL_COLORS). */
export type TodoLabelColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "gray";

export const TODO_LABEL_COLORS: { key: TodoLabelColor; label: string; hex: string }[] = [
  { key: "red", label: "Kırmızı", hex: "#ef4444" },
  { key: "orange", label: "Turuncu", hex: "#f97316" },
  { key: "yellow", label: "Sarı", hex: "#eab308" },
  { key: "green", label: "Yeşil", hex: "#22c55e" },
  { key: "teal", label: "Turkuaz", hex: "#14b8a6" },
  { key: "blue", label: "Mavi", hex: "#3b82f6" },
  { key: "purple", label: "Mor", hex: "#a855f7" },
  { key: "pink", label: "Pembe", hex: "#ec4899" },
  { key: "gray", label: "Gri", hex: "#6b7280" },
];

export function todoLabelHex(color: string | null | undefined): string {
  return TODO_LABEL_COLORS.find((item) => item.key === color)?.hex ?? TODO_LABEL_COLORS[8].hex;
}

/** Kişiye göre sabit avatar rengi (web boardUtils.avatarTone). */
const AVATAR_TONES = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#16a34a", "#ca8a04", "#4f46e5"];
export function avatarTone(person: { name?: string | null; id?: number | null } | null | undefined): string {
  const text = String(person?.name || person?.id || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** Odak sayacı evre renkleri (web FocusTimer PHASES). */
export const FOCUS_COLORS = {
  focus: "#7c3aed",
  short: "#059669",
  long: "#0284c7",
  countdown: "#d97706",
  stopwatch: "#0f766e",
} as const;
