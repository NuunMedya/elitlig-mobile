import { del, get, patch, post, put } from "../../http";

/**
 * KURA ÇEKİMİ — routes/adminDraws.js (/api/admin/draws)
 *
 * Web: pages/management/draws/*. Üç adım: kurulum (biçim, takım / torba /
 * grup sayısı) → torbalar (kapasite + takımlar) → çekiliş. Çekiliş tohumla
 * kaydedilir; aynı kura gerektiğinde birebir yeniden üretilir. Yayın
 * kaplamasının görünümü (torbalar / sahne / çekiliş / sonuç / fikstür) de
 * buradan sürülür. Yetki: görüntüleme draws.view, çekiliş + yayın draws.run.
 */

const BASE = "/api/admin/draws";

export type DrawFormat = "GROUP" | "BRACKET";
export type DrawStatus = "SETUP" | "READY" | "COMPLETED";
export type BroadcastView = "pots" | "stage" | "draw" | "result" | "fixture";

export interface DrawTeam {
  teamId: number;
  teamName: string;
  teamLogo?: string | null;
  potNumber?: number;
}

export interface DrawPot {
  potNumber: number;
  capacity: number;
  label?: string | null;
  teams: DrawTeam[];
}

export interface DrawGroup {
  index: number;
  name: string;
  capacity: number;
  teams: DrawTeam[];
}

export interface BracketMatch {
  index: number;
  matchNo: number;
  home: DrawTeam | null;
  away: DrawTeam | null;
  bye?: boolean;
  sources?: { matchNo: number }[] | null;
}

export interface DrawResult {
  format: DrawFormat;
  order: { teamId: number; potNumber?: number }[];
  groups: DrawGroup[];
  rounds: { round: number; name: string; matches: BracketMatch[] }[];
}

export interface FixtureMatch {
  matchNo?: number;
  home: DrawTeam | null;
  away: DrawTeam | null;
  homeSource?: string | null;
  awaySource?: string | null;
  groupName?: string | null;
  bye?: boolean;
}

export interface DrawFixture {
  type: "WEEKS" | "STAGES";
  totalRounds: number;
  matchCount: number;
  doubleRound?: boolean;
  rounds: { name: string; matches: FixtureMatch[]; byes?: { team: DrawTeam; groupName?: string | null }[] }[];
}

export interface Draw {
  id: number;
  name: string;
  format: DrawFormat;
  status: DrawStatus;
  teamCount: number;
  potCount: number;
  groupCount: number | null;
  groupNames: string[];
  doubleRound: boolean;
  leagueId: number | null;
  seasonId: number | null;
  cityId: number | null;
  notes: string | null;
  pots: DrawPot[];
  selectedTeamCount: number;
  isRosterComplete: boolean;
  result: DrawResult | null;
  fixture: DrawFixture | null;
  broadcast?: { view: BroadcastView | null; sequence?: number } | null;
  drawnAt?: string | null;
  createdBy?: number | null;
  updatedAt?: string | null;
}

export interface DrawSetupPayload {
  name: string;
  format: DrawFormat;
  teamCount: number;
  potCount: number;
  groupCount?: number;
  groupNames?: string[];
  doubleRound?: boolean;
  leagueId?: number | null;
  seasonId?: number | null;
  notes?: string | null;
}

export const listDraws = (params: { status?: string; search?: string }) =>
  get<{ items: Draw[]; total: number }>(BASE, { status: params.status && params.status !== "ALL" ? params.status : undefined, search: params.search || undefined });

export const getDraw = (id: number) => get<{ draw: Draw }>(`${BASE}/${id}`).then((d) => d.draw);
export const createDraw = (body: DrawSetupPayload) => post<{ draw: Draw }>(BASE, body).then((d) => d.draw);
export const updateDraw = (id: number, body: Partial<DrawSetupPayload>) => patch<{ draw: Draw; rosterReset?: boolean }>(`${BASE}/${id}`, body);
export const deleteDraw = (id: number) => del<{ deleted?: boolean }>(`${BASE}/${id}`);
export const saveRoster = (id: number, pots: { potNumber: number; capacity: number; teamIds: number[] }[]) =>
  put<{ draw: Draw }>(`${BASE}/${id}/roster`, { pots }).then((d) => d.draw);
export const runDraw = (id: number) => post<{ draw: Draw }>(`${BASE}/${id}/run`, {}).then((d) => d.draw);
export const resetDraw = (id: number) => post<{ draw: Draw }>(`${BASE}/${id}/reset`).then((d) => d.draw);
export const setBroadcastView = (id: number, view: BroadcastView) => post<{ draw: Draw }>(`${BASE}/${id}/broadcast`, { view }).then((d) => d.draw);

export const searchDrawTeams = (params: { search?: string; cityId?: number | null; seasonId?: number | null; limit?: number }) =>
  get<{ items: DrawTeam[] }>(`${BASE}/lookup/teams`, {
    search: params.search || undefined,
    cityId: params.cityId ?? undefined,
    seasonId: params.seasonId ?? undefined,
    limit: params.limit ?? 80,
  }).then((d) => d.items ?? []);

export const getDrawLeagues = () => get<{ items: { leagueId: number; leagueName: string }[] }>(`${BASE}/lookup/leagues`).then((d) => d.items ?? []);
export const getDrawSeasons = () =>
  get<{ items: { seasonId: number; seasonName: string; leagueId: number }[] }>(`${BASE}/lookup/seasons`).then((d) => d.items ?? []);

/* ─────────────────────────── sözlükler ─────────────────────────── */

export const DRAW_FORMATS: { value: DrawFormat; label: string; description: string }[] = [
  { value: "GROUP", label: "Grup kurası", description: "Takımlar gruplara bölünür. Her gruba her torbadan dengeli sayıda takım düşer." },
  { value: "BRACKET", label: "Eleme ağacı", description: "Takımlar tek maçlık eşleşmelere dağılır. Sayı ikinin kuvveti değilse üst torba BAY geçer." },
];

export const DRAW_STATUS_LABELS: Record<DrawStatus, string> = {
  SETUP: "Kurulum",
  READY: "Çekilişe hazır",
  COMPLETED: "Tamamlandı",
};

/** Yayın kaplamasında gösterilebilecek görünümler (web BROADCAST_VIEWS). */
export const BROADCAST_VIEWS: { value: BroadcastView; label: string; hint: string; primary?: boolean }[] = [
  { value: "pots", label: "Torbalar", hint: "Torbaları ve içindeki takımları göster" },
  { value: "stage", label: "Çekiliş aşamasına geç", hint: "Sahneyi kur — çekiliş başlamaz, ekran hazır bekler" },
  { value: "draw", label: "Kura çekimine başla", hint: "Töreni başlat: toplar çekilir, takımlar yerleşir", primary: true },
  { value: "result", label: "Gruplar / eleme ağacı", hint: "Yalnız dağılımı göster" },
  { value: "fixture", label: "Fikstür", hint: "Fikstürün tamamını tek ekranda göster" },
];

const GROUP_LETTERS = "ABCDEFGHJKLMNOPRSTUVYZ";
export const defaultGroupName = (i: number) =>
  i < GROUP_LETTERS.length ? GROUP_LETTERS[i] : `${GROUP_LETTERS[Math.floor(i / GROUP_LETTERS.length) - 1]}${GROUP_LETTERS[i % GROUP_LETTERS.length]}`;

/** teamCount takımı count torbaya olabildiğince eşit böler (sunucuyla aynı kural). */
export function balancedSizes(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** 12 takım → 16'lık ağaç, 4 BAY. */
export function bracketPreview(teamCount: number) {
  let size = 1;
  while (size < teamCount) size *= 2;
  return { size, byes: size - teamCount };
}
