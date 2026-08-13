import type { ApiMatch, ApiMatchEvent, MacDurumu, MatchState } from "./types";

/**
 * Maç verisinin yorumlanması.
 *
 * Backend'de durum `mac_durumu` alanında Türkçe değerlerle tutulur ve eski
 * kayıtlarda boş olabilir. Ekranların bu ayrıntıyı bilmesi gerekmesin diye
 * yorum tek bir yerde yapılır (web'deki resolveLiveStatus'ün karşılığı).
 */

const LIVE_VALUES = ["canli", "canlı", "live", "devam"];
const SCHEDULED_VALUES = ["zamanlanmis", "zamanlanmış", "zamanlandi", "zamanlandı", "scheduled"];
const PUBLISHED_VALUES = ["yayinlanmis", "yayınlanmış", "yayinlanmış", "published"];

export function matchState(match: Pick<ApiMatch, "mac_durumu" | "is_it_fixture" | "first_team_score" | "second_team_score">): MatchState {
  const status = String(match.mac_durumu ?? "").trim().toLowerCase();

  if (LIVE_VALUES.includes(status)) return "live";
  if (SCHEDULED_VALUES.includes(status)) return "scheduled";
  if (PUBLISHED_VALUES.includes(status)) return "finished";

  // Durum alanı eklenmeden önceki kayıtlar: fikstür bayrağı ve skor varlığı karar verir.
  if (Number(match.is_it_fixture) === 1) return "scheduled";
  if (match.first_team_score != null && match.second_team_score != null) return "finished";
  return "scheduled";
}

export const isLive = (match: Parameters<typeof matchState>[0]) => matchState(match) === "live";

export const STATE_LABEL: Record<MatchState, string> = {
  scheduled: "Fikstür",
  live: "CANLI",
  finished: "Bitti",
};

/** `mac_durumu` değerini sunucunun beklediği biçimde döndürür. */
export const asMacDurumu = (state: MatchState): MacDurumu =>
  state === "live" ? "canli" : state === "finished" ? "yayinlanmis" : "zamanlanmis";

/* ===================== OLAYLAR ===================== */

/** constants/matchEvents.js ile aynı kod aileleri. */
const GOAL_CODES = [
  "GOAL",
  "PEN_GOAL",
  "GOAL_RIGHT_FOOT",
  "GOAL_LEFT_FOOT",
  "GOAL_HEADER",
  "GOAL_PENALTY",
  "GOAL_FREEKICK",
  "GOAL_LONG_RIGHT",
  "GOAL_LONG_LEFT",
];
const OWN_GOAL_CODES = ["OG", "OWN_GOAL"];
const YELLOW_CODES = ["YELLOW", "YELLOW_CARD"];
const RED_CODES = ["RED", "RED_CARD"];

const code = (event: Pick<ApiMatchEvent, "olay_kodu">) =>
  String(event.olay_kodu ?? "").trim().toUpperCase();

export const isGoal = (event: ApiMatchEvent) => GOAL_CODES.includes(code(event));
export const isOwnGoal = (event: ApiMatchEvent) => OWN_GOAL_CODES.includes(code(event));
export const isYellowCard = (event: ApiMatchEvent) => YELLOW_CODES.includes(code(event));
export const isRedCard = (event: ApiMatchEvent) => RED_CODES.includes(code(event));
export const isSubstitution = (event: ApiMatchEvent) => code(event) === "SUBSTITUTION";
export const isAssist = (event: ApiMatchEvent) => code(event) === "ASSIST";

/** Zaman tünelinde gösterilmeye değer olaylar (istatistik kodları elenir). */
export const isTimelineEvent = (event: ApiMatchEvent) =>
  isGoal(event) ||
  isOwnGoal(event) ||
  isYellowCard(event) ||
  isRedCard(event) ||
  isSubstitution(event);

export type EventKind = "goal" | "ownGoal" | "yellow" | "red" | "substitution" | "other";

export function eventKind(event: ApiMatchEvent): EventKind {
  if (isGoal(event)) return "goal";
  if (isOwnGoal(event)) return "ownGoal";
  if (isYellowCard(event)) return "yellow";
  if (isRedCard(event)) return "red";
  if (isSubstitution(event)) return "substitution";
  return "other";
}

export const EVENT_LABEL: Record<EventKind, string> = {
  goal: "Gol",
  ownGoal: "Kendi kalesine",
  yellow: "Sarı kart",
  red: "Kırmızı kart",
  substitution: "Oyuncu değişikliği",
  other: "",
};

/** Gol ikonları: kodun ayrıntısı varsa nasıl atıldığını da anlatır. */
export function goalDetail(event: ApiMatchEvent): string | null {
  switch (code(event)) {
    case "GOAL_HEADER":
      return "kafa";
    case "GOAL_PENALTY":
    case "PEN_GOAL":
      return "penaltı";
    case "GOAL_FREEKICK":
      return "serbest vuruş";
    case "GOAL_LONG_RIGHT":
    case "GOAL_LONG_LEFT":
      return "uzaktan";
    default:
      return null;
  }
}

/**
 * Bir olayın skora etkisi. Kendi kalesine golde puanı RAKİP alır — sunucudaki
 * scoreDeltaForEvent ile aynı kural.
 */
export function scoreDelta(
  event: ApiMatchEvent,
  homeTeamId: number | null | undefined,
  awayTeamId: number | null | undefined
): { home: number; away: number } {
  const teamId = Number(event.takim_id);
  const home = Number(homeTeamId);
  const away = Number(awayTeamId);

  if (isGoal(event)) {
    if (teamId && teamId === home) return { home: 1, away: 0 };
    if (teamId && teamId === away) return { home: 0, away: 1 };
  } else if (isOwnGoal(event)) {
    if (teamId && teamId === home) return { home: 0, away: 1 };
    if (teamId && teamId === away) return { home: 1, away: 0 };
  }
  return { home: 0, away: 0 };
}
