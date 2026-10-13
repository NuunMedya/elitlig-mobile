/**
 * Takip ekranının saf maç yardımcıları — bileşen dışı, test edilebilir.
 *
 * NE: maç kaydının gün/saat anahtarı, bir maçın takip edilen takıma ait olup
 * olmadığı (id, yoksa ad eşleşmesi), takımın son beş maç formu, sıradaki ve
 * son maçı ve sıradaki maça kalan sürenin kısa etiketi.
 *
 * NEDEN AD YEDEĞİ: eski maç kayıtlarında `home_team_id`/`away_team_id` boş
 * olabiliyor; web sitesi de takım–maç eşleşmesini id + ad ile iki yollu yapar.
 * Ad karşılaştırması Türkçe küçük harfle yapılır (I/İ tuzağı).
 */

import type { FormResult } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import type { FavoriteTeam } from "@/providers/FavoriteProvider";

/** Yerel takvime göre "YYYY-MM-DD". */
export function dayKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Maçın gün anahtarı. Sunucu `date` alanını "2026-08-19" ya da
 * "2026-08-19T00:00:00.000Z" biçiminde döndürür; ilk on karakter doğrudan
 * okunur — UTC gece yarısını yerele çevirmek günü kaydırabilirdi.
 */
export function matchDayKey(match: ApiMatch): string {
  const raw = String(match.date ?? "").trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : dayKeyOf(parsed);
}

/** "YYYY-MM-DD HH:MM" — dizi karşılaştırmasıyla kronolojik sıralanır. */
export function matchSortKey(match: ApiMatch): string {
  return `${matchDayKey(match)} ${formatTime(match.time) || "00:00"}`;
}

export const byKickoffAsc = (a: ApiMatch, b: ApiMatch) => (matchSortKey(a) < matchSortKey(b) ? -1 : 1);
export const byKickoffDesc = (a: ApiMatch, b: ApiMatch) => (matchSortKey(a) > matchSortKey(b) ? -1 : 1);

/** Maçın yerel başlama anı; saat yoksa gün başı. */
export function kickoffDate(match: ApiMatch): Date | null {
  const day = matchDayKey(match);
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = (formatTime(match.time) || "00:00").split(":").map(Number);
  return new Date(year, month - 1, date, hour || 0, minute || 0);
}

export const normalizeName = (value?: string | null) => String(value ?? "").trim().toLocaleLowerCase("tr-TR");

/** Takımın bu maçta ev sahibi mi? id yoksa ada bakılır. */
function isHomeOf(match: ApiMatch, team: FavoriteTeam): boolean {
  if (match.home_team_id != null && Number(match.home_team_id) === team.id) return true;
  return normalizeName(match.first_team_name) === normalizeName(team.name);
}

export function belongsToTeam(match: ApiMatch, team: FavoriteTeam): boolean {
  if (match.home_team_id != null && Number(match.home_team_id) === team.id) return true;
  if (match.away_team_id != null && Number(match.away_team_id) === team.id) return true;
  const name = normalizeName(team.name);
  return normalizeName(match.first_team_name) === name || normalizeName(match.second_team_name) === name;
}

/** Son beş biten maçın sonucu — en eskiden en yeniye. */
export function teamForm(matches: ApiMatch[], team: FavoriteTeam): FormResult[] {
  return matches
    .filter((match) => belongsToTeam(match, team) && matchState(match) === "finished")
    .sort(byKickoffAsc)
    .slice(-5)
    .map((match) => {
      const home = Number(match.first_team_score ?? 0);
      const away = Number(match.second_team_score ?? 0);
      const own = isHomeOf(match, team) ? home : away;
      const other = isHomeOf(match, team) ? away : home;
      return own > other ? "W" : own < other ? "L" : "D";
    });
}

/**
 * Takımın sıradaki maçı (canlı dahil, bugün ya da sonrası, bitmemiş) ve son
 * biten maçı. Geçmiş günde "zamanlandı" kalmış kayıtlar sıradaki sayılmaz.
 */
export function nextAndLast(
  matches: ApiMatch[],
  team: FavoriteTeam,
  today: string = dayKeyOf(new Date())
): { next: ApiMatch | null; last: ApiMatch | null } {
  const own = matches.filter((match) => belongsToTeam(match, team) && matchDayKey(match) !== "");
  const live = own.find((match) => matchState(match) === "live");
  const next =
    live ??
    own
      .filter((match) => matchDayKey(match) >= today && matchState(match) !== "finished")
      .sort(byKickoffAsc)[0] ??
    null;
  const last = own.filter((match) => matchState(match) === "finished").sort(byKickoffDesc)[0] ?? null;
  return { next, last };
}

/**
 * Sıradaki maça kalan süre — kısa etiket: "Canlı", "45 dk", "5 sa",
 * "Yarın 21:30", "3 gün". Başlama anı geçmiş ama maç başlamamışsa saati söyler.
 */
export function countdownLabel(match: ApiMatch, now: Date = new Date()): string {
  if (matchState(match) === "live") return "Canlı";
  const kickoff = kickoffDate(match);
  if (!kickoff) return "";
  const minutes = Math.round((kickoff.getTime() - now.getTime()) / 60_000);
  const time = formatTime(match.time);
  if (minutes <= 0) return time ? `Bugün ${time}` : "Bugün";
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  const tomorrow = dayKeyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (matchDayKey(match) === tomorrow) return time ? `Yarın ${time}` : "Yarın";
  const days = Math.round(
    (new Date(kickoff.getFullYear(), kickoff.getMonth(), kickoff.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  return `${days} gün`;
}
