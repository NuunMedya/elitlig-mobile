import { isAssist, isGoal, isOwnGoal, isRedCard, isSubstitution, isTimelineEvent, isYellowCard, scoreDelta } from "./match";
import type { ApiMatchEvent, KadroPlayer, KadroResponse } from "./types";

/**
 * Maç olaylarından istatistik türetme — sitedeki "Maç Olay Özeti" ızgarasının
 * ve "En İyi Oyuncular" listesinin veri katmanı.
 *
 * Sunucu ayrıca istatistik ucu sunmaz; site de aynı olay tablosunu sayarak
 * gösterir. Bilinen kod aileleri etiketlenir, tanınmayan kodlar okunur hale
 * getirilip yine sayılır — böylece sitede görünen her satır mobilde de çıkar.
 */

export interface StatRow {
  label: string;
  home: number;
  away: number;
}

/** Bilinen istatistik kodları → Türkçe etiket (site satır adlarıyla uyumlu). */
const CODE_LABELS: Record<string, string> = {
  SAVE: "Kurtarışlar",
  KURTARIS: "Kurtarışlar",
  CHANCE: "Fırsat Yarat.",
  CHANCE_CREATED: "Fırsat Yarat.",
  FIRSAT: "Fırsat Yarat.",
  BLOCK: "Kritik Blok",
  CRITICAL_BLOCK: "Kritik Blok",
  AERIAL: "Hava Topu",
  AERIAL_DUEL: "Hava Topu",
  HAVA_TOPU: "Hava Topu",
  DUEL: "İkili Müc.",
  TACKLE: "İkili Müc.",
  IKILI_MUCADELE: "İkili Müc.",
  FOUL: "Fauller",
  FAUL: "Fauller",
  INJURY: "Sakatlık",
  SAKATLIK: "Sakatlık",
};

const prettify = (code: string) =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");

const sideOf = (
  event: ApiMatchEvent,
  homeTeamId: number | null,
  awayTeamId: number | null
): "home" | "away" | null => {
  const teamId = Number(event.takim_id);
  if (teamId && teamId === Number(homeTeamId)) return "home";
  if (teamId && teamId === Number(awayTeamId)) return "away";
  return null;
};

export function buildStatRows(
  events: ApiMatchEvent[],
  homeTeamId: number | null,
  awayTeamId: number | null
): StatRow[] {
  const core = {
    goals: { label: "Goller", home: 0, away: 0 },
    assists: { label: "Asistler", home: 0, away: 0 },
    yellow: { label: "Sarı Kart", home: 0, away: 0 },
    red: { label: "Kırmızı Kart", home: 0, away: 0 },
    subs: { label: "Değişiklik", home: 0, away: 0 },
  };
  const extras = new Map<string, StatRow>();

  for (const event of events) {
    const side = sideOf(event, homeTeamId, awayTeamId);

    if (isGoal(event) || isOwnGoal(event)) {
      const delta = scoreDelta(event, homeTeamId, awayTeamId);
      core.goals.home += delta.home;
      core.goals.away += delta.away;
      continue;
    }
    if (!side) continue;

    if (isAssist(event)) core.assists[side] += 1;
    else if (isYellowCard(event)) core.yellow[side] += 1;
    else if (isRedCard(event)) core.red[side] += 1;
    else if (isSubstitution(event)) core.subs[side] += 1;
    else if (!isTimelineEvent(event)) {
      const code = String(event.olay_kodu ?? "").trim().toUpperCase();
      if (!code) continue;
      const label = CODE_LABELS[code] ?? prettify(code);
      const row = extras.get(label) ?? { label, home: 0, away: 0 };
      row[side] += 1;
      extras.set(label, row);
    }
  }

  // Çekirdek satırlar her zaman görünür (sitede sıfırlar da gösterilir);
  // keşfedilen ekstra kodlar yalnızca en az bir kez sayıldıysa eklenir.
  return [core.goals, core.assists, ...extras.values(), core.yellow, core.red, core.subs];
}

export interface TopPlayer {
  playerId: number;
  name: string;
  image: string | null;
  teamId: number | null;
  goals: number;
  assists: number;
  rating: number | null;
}

export function buildTopPlayers(
  events: ApiMatchEvent[],
  kadro: KadroResponse | undefined,
  limit = 4
): TopPlayer[] {
  if (!kadro) return [];

  const roster = new Map<number, KadroPlayer>();
  for (const row of [...kadro.home, ...kadro.away]) {
    const id = Number(row.oyuncu_id ?? row.playerId);
    if (id) roster.set(id, row);
  }

  const tally = new Map<number, { goals: number; assists: number }>();
  const bump = (playerId: number | null | undefined, key: "goals" | "assists") => {
    const id = Number(playerId);
    if (!id) return;
    const entry = tally.get(id) ?? { goals: 0, assists: 0 };
    entry[key] += 1;
    tally.set(id, entry);
  };

  for (const event of events) {
    if (isGoal(event)) bump(event.oyuncu_id, "goals");
    else if (isAssist(event)) bump(event.oyuncu_id, "assists");
  }

  const players: TopPlayer[] = [];
  for (const [id, row] of roster) {
    const stats = tally.get(id) ?? { goals: 0, assists: 0 };
    const rating = row.puan != null ? Number(row.puan) : null;
    // Katkısı ya da puanı olmayan oyuncular listeye girmez.
    if (!stats.goals && !stats.assists && rating == null) continue;
    players.push({
      playerId: id,
      name: row.playerName ?? row.guestName ?? "Oyuncu",
      image: row.playerImg,
      teamId: row.team_id ?? row.takim_id ?? null,
      goals: stats.goals,
      assists: stats.assists,
      rating: Number.isFinite(rating as number) ? rating : null,
    });
  }

  players.sort(
    (a, b) =>
      (b.rating ?? -1) - (a.rating ?? -1) ||
      b.goals - a.goals ||
      b.assists - a.assists
  );

  return players.slice(0, limit);
}

/* ===================== KATKI TABLOSU ===================== */

export interface ContribRow {
  playerId: number | null;
  name: string;
  image: string | null;
  goals: number;
  assists: number;
  cards: number;
  rating: number | null;
  guest: boolean;
}

/**
 * Sitedeki "Takım Kadroları" tablosu: oyuncu başına G / A / K / PUAN.
 * Kadro satırları temel alınır; sayılar olay tablosundan toplanır.
 */
export function buildContributions(
  events: ApiMatchEvent[],
  kadro: KadroResponse | undefined
): { home: ContribRow[]; away: ContribRow[] } {
  const tally = new Map<number, { goals: number; assists: number; cards: number }>();
  const bump = (playerId: number | null | undefined, key: "goals" | "assists" | "cards") => {
    const id = Number(playerId);
    if (!id) return;
    const entry = tally.get(id) ?? { goals: 0, assists: 0, cards: 0 };
    entry[key] += 1;
    tally.set(id, entry);
  };

  for (const event of events) {
    if (isGoal(event)) bump(event.oyuncu_id, "goals");
    else if (isAssist(event)) bump(event.oyuncu_id, "assists");
    else if (isYellowCard(event) || isRedCard(event)) bump(event.oyuncu_id, "cards");
  }

  const toRows = (players: KadroPlayer[]): ContribRow[] =>
    players
      .map((row) => {
        const id = Number(row.oyuncu_id ?? row.playerId) || null;
        const stats = (id && tally.get(id)) || { goals: 0, assists: 0, cards: 0 };
        const rating = row.puan != null ? Number(row.puan) : null;
        return {
          playerId: id,
          name: row.playerName ?? row.guestName ?? "İsimsiz oyuncu",
          image: row.playerImg,
          goals: stats.goals,
          assists: stats.assists,
          cards: stats.cards,
          rating: Number.isFinite(rating as number) && (rating as number) > 0 ? rating : null,
          guest: row.isGuest,
        };
      })
      .sort(
        (a, b) =>
          b.goals - a.goals ||
          b.assists - a.assists ||
          (b.rating ?? -1) - (a.rating ?? -1) ||
          a.name.localeCompare(b.name, "tr")
      );

  return { home: toRows(kadro?.home ?? []), away: toRows(kadro?.away ?? []) };
}
