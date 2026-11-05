import { del, get, patch, post } from "../../http";
import type { WeeklyAwardType } from "../weeklyAwards";

/**
 * HAFTANIN ENLERİ — YÖNETİM — routes/adminWeeklyAwards.js
 * (/api/admin/weekly-awards)
 *
 * Web: pages/management/weeklyAwards/WeeklyAwards.js. Bir ödül seti; kapsam
 * (lig + sezon zorunlu, tarih aralığı), bireysel ödüller (haftanın oyuncusu,
 * kalecisi, defansı, orta sahası, forveti, centilmeni, takımı) ve en fazla 11
 * kişilik haftanın kadrosundan oluşur. Yayınlamak piyasa değerini günceller;
 * "Taslağa al" etkiyi geri alır, "Yayından al" görünmez yapar ama korur.
 * Üye tarafı (yayınlanmış setler) lib/api/weeklyAwards.ts'dedir.
 */

const BASE = "/api/admin/weekly-awards";

export type SetStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
export type PositionGroup = "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";

export interface AdminAwardItem {
  id?: number;
  award_type: WeeklyAwardType | string;
  player_id?: number | null;
  team_id?: number | null;
  position_slot?: string | null;
  sort_order?: number | null;
}

export interface AdminAwardSet {
  id: number;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  status: SetStatus;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  notes: string | null;
  formation: string | null;
  published_at?: string | null;
  items: AdminAwardItem[];
}

export interface AwardPlayer {
  playerId: number;
  playerName: string;
  position?: string | null;
  positionGroup?: PositionGroup;
  positionKnown?: boolean;
  teamId?: number | null;
  teamName?: string | null;
  playerImg?: string | null;
  marketValue?: number | null;
  matchCount?: number;
  goals?: number;
  assists?: number;
}

export interface AwardTeam {
  teamId: number;
  teamName: string;
  teamLogo: string | null;
  cityId?: number | null;
}

export interface SetPayload {
  title: string;
  start_date: string;
  end_date: string;
  formation: string;
  league_id: number | null;
  season_id: number | null;
  notes: string;
  items: AdminAwardItem[];
}

export interface PublishWarning {
  code: string;
  category?: string;
  playerId?: number;
}

export const listAwardSets = (params?: { status?: string }) =>
  get<{ items: AdminAwardSet[] }>(BASE, { status: params?.status && params.status !== "ALL" ? params.status : undefined }).then((d) => d.items ?? []);
export const getAwardSet = (id: number) => get<AdminAwardSet>(`${BASE}/${id}`);
export const createAwardSet = (body: SetPayload) => post<AdminAwardSet>(BASE, body);
export const updateAwardSet = (id: number, body: SetPayload) => patch<AdminAwardSet>(`${BASE}/${id}`, body);
export const deleteAwardSet = (id: number) => del<{ ok?: boolean }>(`${BASE}/${id}`);
export const publishAwardSet = (id: number) => post<{ warnings?: PublishWarning[] }>(`${BASE}/${id}/publish`);
export const unpublishAwardSet = (id: number) => post<AdminAwardSet>(`${BASE}/${id}/unpublish`);
export const withdrawAwardSet = (id: number) => post<AdminAwardSet>(`${BASE}/${id}/withdraw`);
export const archiveAwardSet = (id: number) => post<AdminAwardSet>(`${BASE}/${id}/archive`);

export const searchAwardPlayers = (params: { search?: string; position?: string; cityId?: number | null; ids?: number[]; limit?: number }) =>
  get<{ items: AwardPlayer[] }>(`${BASE}/players`, {
    search: params.search || undefined,
    position: params.position || undefined,
    cityId: params.cityId ?? undefined,
    ids: params.ids?.length ? params.ids.join(",") : undefined,
    limit: params.limit ?? 60,
  }).then((d) => d.items ?? []);

export const searchAwardTeams = (params: { search?: string; cityId?: number | null; ids?: number[]; limit?: number }) =>
  get<{ items: AwardTeam[] }>(`${BASE}/teams`, {
    search: params.search || undefined,
    cityId: params.cityId ?? undefined,
    ids: params.ids?.length ? params.ids.join(",") : undefined,
    limit: params.limit ?? 60,
  }).then((d) => d.items ?? []);

export const getAwardLeagues = (cityId?: number | null) =>
  get<{ items: { id: number; label: string }[] }>(`${BASE}/leagues`, { cityId: cityId ?? undefined }).then((d) => d.items ?? []);
export const getAwardSeasons = (leagueId: number, cityId?: number | null) =>
  get<{ items: { id: number; label: string; leagueId: number }[] }>(`${BASE}/seasons`, { leagueId, cityId: cityId ?? undefined }).then((d) => d.items ?? []);

/* ─────────────────────────── sözlükler ─────────────────────────── */

export const MAX_SQUAD = 11;

export const AWARD_LABELS: Record<string, string> = {
  WEEKLY_PLAYER: "Haftanın Oyuncusu",
  WEEKLY_GOALKEEPER: "Haftanın Kalecisi",
  WEEKLY_DEFENDER: "Haftanın Defansı",
  WEEKLY_MIDFIELDER: "Haftanın Orta Sahası",
  WEEKLY_FORWARD: "Haftanın Forveti",
  WEEKLY_FAIR_PLAY: "Haftanın Centilmeni",
  WEEKLY_TEAM: "Haftanın Takımı",
  WEEKLY_SQUAD_PLAYER: "Haftanın Kadrosu",
};

/** Bireysel oyuncu ödülleri; `pos` mevki süzgecinin önerisi. */
export const INDIVIDUAL: { type: WeeklyAwardType; pos: PositionGroup | null }[] = [
  { type: "WEEKLY_PLAYER", pos: null },
  { type: "WEEKLY_GOALKEEPER", pos: "GOALKEEPER" },
  { type: "WEEKLY_DEFENDER", pos: "DEFENDER" },
  { type: "WEEKLY_MIDFIELDER", pos: "MIDFIELDER" },
  { type: "WEEKLY_FORWARD", pos: "FORWARD" },
  { type: "WEEKLY_FAIR_PLAY", pos: null },
];

export const POS_GROUPS: { value: PositionGroup; label: string }[] = [
  { value: "GOALKEEPER", label: "Kaleci" },
  { value: "DEFENDER", label: "Defans" },
  { value: "MIDFIELDER", label: "Orta Saha" },
  { value: "FORWARD", label: "Forvet" },
];
const GROUP_ORDER: PositionGroup[] = ["GOALKEEPER", "DEFENDER", "MIDFIELDER", "FORWARD"];
const GROUP_PREFIX: Record<PositionGroup, string> = { GOALKEEPER: "GK", DEFENDER: "DEF", MIDFIELDER: "MID", FORWARD: "FWD" };

export const SET_STATUS_LABELS: Record<SetStatus, string> = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  UNPUBLISHED: "Yayından alındı",
  ARCHIVED: "Arşiv",
};

const WARNING_TEXT: Record<string, string> = {
  MISSING_CATEGORY: "Kategori boş",
  MISSING_TEAM: "Haftanın takımı seçilmedi",
  PLAYER_WRONG_CITY: "Oyuncu başka ilde",
  PLAYER_NOT_PLAYED_IN_RANGE: "Oyuncu tarih aralığında maç oynamamış",
};
export const warningText = (w: PublishWarning, playerName?: string | null) =>
  [WARNING_TEXT[w.code] ?? w.code, w.category ? AWARD_LABELS[w.category] ?? w.category : null, w.playerId ? playerName || `oyuncu #${w.playerId}` : null]
    .filter(Boolean)
    .join(" — ");

/** position_slot ("DEF2") → mevki grubu. */
export function groupFromSlot(slot: string | null | undefined): PositionGroup {
  const s = String(slot || "").toUpperCase();
  if (s.startsWith("GK")) return "GOALKEEPER";
  if (s.startsWith("DEF")) return "DEFENDER";
  if (s.startsWith("FWD")) return "FORWARD";
  return "MIDFIELDER";
}

/** Kadrodan formasyon: 1 GK, 3 DEF, 3 MID, 1 FWD → "1-3-3-1". */
export const computeFormation = (squad: { group: PositionGroup }[]) =>
  GROUP_ORDER.map((g) => squad.filter((s) => s.group === g).length).join("-");

export interface AwardForm {
  id?: number;
  status?: SetStatus;
  city_id?: number | null;
  title: string;
  start_date: string;
  end_date: string;
  league_id: number | null;
  season_id: number | null;
  notes: string;
  individual: Partial<Record<WeeklyAwardType, number | null>>;
  teamId: number | null;
  squad: { playerId: number; group: PositionGroup }[];
}

export function formFromSet(set: AdminAwardSet): AwardForm {
  const individual: AwardForm["individual"] = {};
  const squad: { playerId: number; group: PositionGroup; sort: number }[] = [];
  let teamId: number | null = null;
  for (const it of set.items ?? []) {
    if (it.award_type === "WEEKLY_TEAM") teamId = it.team_id ?? null;
    else if (it.award_type === "WEEKLY_SQUAD_PLAYER") squad.push({ playerId: Number(it.player_id), group: groupFromSlot(it.position_slot), sort: it.sort_order ?? 0 });
    else individual[it.award_type as WeeklyAwardType] = it.player_id ?? null;
  }
  squad.sort((a, b) => a.sort - b.sort);
  return {
    id: set.id,
    status: set.status,
    city_id: set.city_id,
    title: set.title || "",
    start_date: (set.start_date || "").slice(0, 10),
    end_date: (set.end_date || "").slice(0, 10),
    league_id: set.league_id,
    season_id: set.season_id,
    notes: set.notes || "",
    individual,
    teamId,
    squad: squad.map(({ playerId, group }) => ({ playerId, group })),
  };
}

export function payloadFromForm(f: AwardForm): SetPayload {
  const items: AdminAwardItem[] = [];
  Object.entries(f.individual).forEach(([type, playerId]) => {
    if (playerId) items.push({ award_type: type, player_id: Number(playerId) });
  });
  if (f.teamId) items.push({ award_type: "WEEKLY_TEAM", team_id: Number(f.teamId) });
  const counters: Partial<Record<PositionGroup, number>> = {};
  f.squad.forEach((s, idx) => {
    counters[s.group] = (counters[s.group] || 0) + 1;
    items.push({ award_type: "WEEKLY_SQUAD_PLAYER", player_id: s.playerId, position_slot: `${GROUP_PREFIX[s.group] || "MID"}${counters[s.group]}`, sort_order: idx });
  });
  return {
    title: f.title,
    start_date: f.start_date,
    end_date: f.end_date,
    formation: computeFormation(f.squad),
    league_id: f.league_id,
    season_id: f.season_id,
    notes: f.notes,
    items,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const emptyAwardForm = (): AwardForm => ({
  title: "",
  start_date: iso(new Date(Date.now() - 6 * 86400000)),
  end_date: iso(new Date()),
  league_id: null,
  season_id: null,
  notes: "",
  individual: {},
  teamId: null,
  squad: [],
});

export const formatEtl = (v: number | null | undefined) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Math.round(Number(v)).toLocaleString("tr-TR")} ETL`);
