/**
 * Maç iş akışı ekranlarının ortak yardımcıları: adım tanımları, adım kilidi,
 * tarih/saat biçimleri ve kadro satırlarının sade biçimi.
 *
 * KİLİT KURALI — sunucu hiçbir maç yazımını duruma göre reddetmez
 * (routes/MatchFlow.js kadro / puan / olaylar, routes/Matches.js result,
 * routes/PlayerStatistics.js). Web paneli (matchUi/matchMeta.js) taslakta üç
 * adımı, zamanlanmış maçta maç sonunu kapatır; saha kenarında bu, "bölüm yok"
 * diye okunuyordu. Mobil kural:
 *   · Kadro      — her durumda açık (taslakta bilgi notuyla).
 *   · Canlı akış — taslakta kapalı; tek dokunuşla "Maçı zamanla" ile açılır.
 *   · Maç sonu   — taslakta kapalı (aynı düğme); zamanlanmış maçta AÇIK:
 *                  canlı takip edilmeden oynanan maçın sonucu, puanları ve
 *                  içerikleri buradan girilir.
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
  { key: "mac-sonu", label: "Maç sonu", short: "Maç sonu", icon: "star-outline", permission: ["matches.stats", "matches.update"] },
];

export interface StepAvailability {
  ready: boolean;
  /** Kapalıyken: neden kapalı. */
  hint?: string;
  /** Açıkken gösterilecek kısa bilgi (ör. maç henüz başlamadı). */
  note?: string;
  /** Kilidi tek dokunuşla çözen eylem: maçı "Zamanlandı" yap. */
  fix?: "schedule";
}

/** Adım bu durumda açılabilir mi; kapalıysa neden ve nasıl açılır. */
export function stepAvailability(step: StepKey, raw: unknown): StepAvailability {
  const status = normalizeMatchStatus(raw);
  if (step === "bilgiler") return { ready: true };
  const draft = !status || status === "taslak";
  if (step === "kadro") {
    return draft
      ? { ready: true, note: "Maç taslak: kadro kaydedilir ama maç sitede görünmez. Fikstürde yayınlamak için maçı zamanla.", fix: "schedule" }
      : { ready: true };
  }
  if (draft) {
    return {
      ready: false,
      fix: "schedule",
      hint:
        step === "canli"
          ? "Taslak maç canlıya alınamaz. Maçı zamanladığında canlı akış açılır."
          : "Taslak maçın sonucu girilemez. Maçı zamanladığında maç sonu açılır.",
    };
  }
  if (step === "mac-sonu" && status === "zamanlanmis") {
    return {
      ready: true,
      note: "Maç henüz başlatılmadı. Canlı takip edilmeden oynandıysa sonucu “Sonucu tescil et” ile gir; puan, içerik ve istatistikleri buradan tamamla.",
    };
  }
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
