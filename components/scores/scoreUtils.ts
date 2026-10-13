/**
 * Skorlar ekranının saf yardımcıları — tarih, sıralama, gol tespiti.
 *
 * NEDEN AYRI DOSYA: Skorlar ekranı eski Maçlar, Canlı ve Ana Sayfa'nın
 * vitrinini tek ekranda topladı; üçünün yardımcıları ekran dosyasında kalsa
 * dosya bin satırı aşıyordu. Burada hiçbir React kodu yok — bileşen dışı saf
 * fonksiyonlar, testten ve render döngüsünden bağımsız.
 */

import { toIsoDate } from "@/components/ui/DateStrip";
import type { ApiMatch } from "@/lib/types";

export const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

/**
 * Ay adlarının bulunma hâli ekleri. Kural (ünsüz sertleşmesi + ünlü uyumu)
 * hesaplanabilir ama 12 sabit için tablo hem kısa hem kesin: "Ağustos'ta",
 * "Nisan'da", "Eylül'de".
 */
const MONTH_LOCATIVE = ["ta", "ta", "ta", "da", "ta", "da", "da", "ta", "de", "de", "da", "ta"] as const;

export const pad2 = (value: number) => String(value).padStart(2, "0");

/** "YYYY-MM-DD" → yerel gece yarısı. `new Date(iso)` UTC okur ve gün kaydırır. */
export function fromIso(iso: string): Date {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!parts) return new Date();
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

export function shiftDays(iso: string, delta: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

/** Maç kaydındaki tarih "2026-08-18T00:00:00.000Z" da olabilir; gün kısmı alınır. */
export const matchDay = (match: Pick<ApiMatch, "date">) => String(match.date ?? "").slice(0, 10);

/** Başlama anı — aynı gün içindeki sıralama saate göredir. */
export function kickoff(match: ApiMatch): number {
  const stamp = Date.parse(`${matchDay(match)}T${match.time || "00:00:00"}`);
  return Number.isFinite(stamp) ? stamp : 0;
}

export const byKickoff = (a: ApiMatch, b: ApiMatch) => kickoff(a) - kickoff(b) || Number(a.id) - Number(b.id);

/** Türkçe küçük harf (İ/I tuzağı) — ad karşılaştırmaları bununla yapılır. */
export const normalizeName = (value: string | null | undefined) =>
  String(value ?? "").trim().toLocaleLowerCase("tr");

/** "18 Ağustos'ta" / "Bugün" / "Dün" / "Yarın" — boş durum cümlesi için. */
export function dayPhrase(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Bugün";
  if (iso === shiftDays(todayIso, -1)) return "Dün";
  if (iso === shiftDays(todayIso, 1)) return "Yarın";
  const date = fromIso(iso);
  return `${date.getDate()} ${MONTHS_TR[date.getMonth()]}'${MONTH_LOCATIVE[date.getMonth()]}`;
}

/* ───────────────────────────── GOL TESPİTİ ───────────────────────────── */

/** "2-1" — skorun tek dizgeye indirgenmiş hâli; karşılaştırma bunun üzerinden. */
export const scoreKey = (match: ApiMatch) =>
  `${Number(match.first_team_score ?? 0)}-${Number(match.second_team_score ?? 0)}`;

/** "2-1" → 3. Toplam gol sayısı; azalış (düzeltme) ile artışı ayırmak için. */
const scoreTotal = (key: string) => key.split("-").reduce((sum, part) => sum + (Number(part) || 0), 0);

/** Gol bandının gösterdiği tek olay. */
export interface GoalNews {
  matchId: number;
  /** Skoru artan takım (kendi kalesine golde rakip görünür — sunucu da böyle sayar). */
  scoringTeam: string;
  homeTeam: string;
  awayTeam: string;
  /** "2-1" */
  score: string;
  at: number;
}

/**
 * İki yoklama arasında skoru ARTAN maçı bulur.
 *
 * NEDEN YALNIZ ARTIŞ: yönetici yanlış girilen bir golü silebilir; skorun
 * düşmesi "gol" değildir ve bant yanıltıcı olur. Aynı yoklamada birden çok
 * gol varsa listedeki son eşleşme kazanır — bant tek satırdır.
 */
export function detectGoal(previous: Map<number, string>, list: ApiMatch[]): GoalNews | null {
  let found: GoalNews | null = null;

  for (const match of list) {
    const matchId = Number(match.id);
    const before = previous.get(matchId);
    // Bu turda listeye YENİ giren maç: kıyaslanacak geçmişi yok, gol sayılmaz.
    if (before === undefined) continue;

    const now = scoreKey(match);
    if (now === before || scoreTotal(now) <= scoreTotal(before)) continue;

    const beforeHome = Number(before.split("-")[0]) || 0;
    const home = Number(match.first_team_score ?? 0);

    found = {
      matchId,
      scoringTeam: home > beforeHome ? match.first_team_name : match.second_team_name,
      homeTeam: match.first_team_name,
      awayTeam: match.second_team_name,
      score: now,
      at: Date.now(),
    };
  }

  return found;
}
