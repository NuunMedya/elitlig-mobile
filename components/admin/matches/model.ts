/**
 * Maç iş akışı ekranlarının ortak yardımcıları: adım tanımları, adım kilidi,
 * tarih/saat biçimleri ve kadro satırlarının sade biçimi.
 *
 * Web panelindeki matchUi/matchMeta.js ile aynı kurallar: taslak maçta kadro,
 * canlı akış ve maç sonu kapalıdır; zamanlanmış maçta maç sonu kapalıdır.
 */

import type Ionicons from "@expo/vector-icons/Ionicons";

import {
  normalizeMatchStatus,
  type LineupRow,
  type MatchEvent,
} from "@/lib/api/admin/matches";
import type { MacDurumu } from "@/lib/types";

export type StepKey = "bilgiler" | "kadro" | "canli" | "mac-sonu";

export const STEPS: { key: StepKey; label: string; short: string; icon: keyof typeof Ionicons.glyphMap; permission: string[] }[] = [
  { key: "bilgiler", label: "Maç öncesi", short: "Öncesi", icon: "clipboard-outline", permission: ["matches.update"] },
  { key: "kadro", label: "Kadro", short: "Kadro", icon: "people-outline", permission: ["matches.lineup"] },
  { key: "canli", label: "Canlı akış", short: "Canlı", icon: "radio-outline", permission: ["matches.live"] },
  { key: "mac-sonu", label: "Maç sonu", short: "Maç sonu", icon: "star-outline", permission: ["matches.stats"] },
];

/** Adım bu durumda açılabilir mi; kapalıysa neden. */
export function stepAvailability(step: StepKey, raw: unknown): { ready: boolean; hint?: string } {
  const status = normalizeMatchStatus(raw);
  if (step === "bilgiler") return { ready: true };
  if (!status || status === "taslak") return { ready: false, hint: "Önce maçı zamanla: Maç öncesi adımında durumu “Zamanlandı” yapıp kaydet." };
  if (step === "mac-sonu" && status === "zamanlanmis") return { ready: false, hint: "Maç sonu, maç başladıktan sonra açılır." };
  return { ready: true };
}

/** Maçın bulunduğu aşamaya göre açılacak adım (web matchPhase). */
export function defaultStep(raw: unknown, lineupReady?: boolean): StepKey {
  const status: MacDurumu | null = normalizeMatchStatus(raw);
  if (status === "canli") return "canli";
  if (status === "yayinlanmis") return "mac-sonu";
  if (status === "zamanlanmis") return lineupReady ? "canli" : "kadro";
  return "bilgiler";
}

/** "2026-08-18T00:00:00.000Z" → "2026-08-18" */
export const dayOf = (value: unknown) => String(value ?? "").slice(0, 10);

/** "20:00:00" → "20:00" */
export const hhmm = (value: unknown) => {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const WEEKDAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** "18 Ağu Pzt" — tarih saat dilimine kaymadan gün kısmından okunur. */
export function shortDay(value: unknown): string {
  const m = dayOf(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "Tarih yok";
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[3])} ${MONTHS[date.getMonth()]} ${WEEKDAYS[date.getDay()]}`;
}

export const pad2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

/** 1503000 → "25:03" */
export const clockText = (ms: number) => {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
};

export type Side = "home" | "away";

/** Kadro satırının ekranda kullanılan sade biçimi. */
export interface SquadPlayer {
  id: string;
  name: string;
  number: string;
  position: string;
  role: "starter" | "bench" | "reserve";
  captain: boolean;
  guest: boolean;
}

export function toSquad(rows: LineupRow[] | undefined): SquadPlayer[] {
  const seen = new Set<string>();
  const out: SquadPlayer[] = [];
  for (const row of rows ?? []) {
    const id = String(row.playerId ?? row.oyuncu_id ?? row.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: row.guestName || row.playerName || `Oyuncu #${id}`,
      number: row.number == null ? "" : String(row.number),
      position: row.position || "",
      role: row.role,
      captain: Boolean(row.captain),
      guest: Boolean(row.isGuest),
    });
  }
  const order = { starter: 0, bench: 1, reserve: 2 };
  return out.sort((a, b) => order[a.role] - order[b.role]);
}

/** Olayın tarafı: takım kimliği maçın ev/deplasman kimliğiyle eşlenir. */
export function eventSide(ev: MatchEvent, homeTeamId?: number | null, awayTeamId?: number | null): Side | null {
  const tid = Number(ev.takim_id);
  if (tid && tid === Number(homeTeamId)) return "home";
  if (tid && tid === Number(awayTeamId)) return "away";
  return null;
}

/** Benzersiz istemci olay kimliği — aynı olay iki kez gönderilirse sunucu tekini yazar. */
export const clientEventId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Mevki seçenekleri (kadro ekranı POS_BTNS). */
export const POSITIONS = [
  { key: "Kaleci", label: "Kaleci" },
  { key: "Defans", label: "Defans" },
  { key: "Orta Saha", label: "Orta saha" },
  { key: "Forvet", label: "Forvet" },
];
