import { del, get, patch, post, put } from "../../http";
import type { AuthUser } from "../../types";
import { fetchScopedLeagues, fetchScopedSeasons, type LookupLeague, type LookupSeason } from "./lookups";

/**
 * LİG, SEZON, KURAL KİTAPÇIĞI ve LİG STATÜSÜ uçları.
 *
 *   routes/Leagues.js        → /ligler (CRUD, arşiv, öncelik, logo)
 *   routes/Seasons.js        → /sezonlar (CRUD, arşiv, öncelik)
 *   routes/seasonScoring.js  → PUT /api/seasons/:id/rule-book (kitapçık atama)
 *   routes/ruleBooks.js      → /api/rule-books (kitapçık + puanlama + kadro kuralı)
 *   routes/seasonGroups.js   → /api/season-groups (grup, kutu, statü, fikstür)
 *   routes/rosterRuleSets.js → /api/roster-rule-sets (kural seti adları)
 *
 * Alan adları sunucu modelleriyle birebir (Leagues, Seasons, RuleBook,
 * SeasonGroups). Etiket sözlükleri web sabitleriyle aynı.
 */

/* ===================== LİGLER ===================== */

export interface League extends LookupLeague {
  league_logo?: string | null;
  organization_type?: string | null;
  archived_at?: string | null;
}

export const listLeagues = (user: AuthUser | null | undefined) =>
  fetchScopedLeagues(user, true) as Promise<League[]>;

/** Öncelik gövdesi — sunucu league_priority'yi okur; boş değer temizler. */
const priorityOf = (value: unknown): number | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

export const createLeague = (body: { league_name: string; league_priority?: unknown; city?: string | null }) =>
  post<League>("/ligler", {
    league_name: body.league_name.trim(),
    city: body.city || undefined,
    league_priority: priorityOf(body.league_priority),
  });

export const updateLeague = (id: number, body: { league_name: string; league_priority?: unknown }) =>
  patch<{ message: string; league: League }>(`/ligler/update-league/${id}`, {
    newLeagueName: body.league_name.trim(),
    league_priority: priorityOf(body.league_priority),
  });

/** Lig arşivi lige bağlı TÜM sezonları da aynı duruma geçirir. */
export const setLeagueArchived = (id: number, archived: boolean) =>
  patch<{ message: string; archivedSeasonCount: number }>(`/ligler/${id}/archive`, { archived });

export const deleteLeague = (id: number) => del<{ message?: string }>(`/ligler/${id}`);

/** Galeriden seçilen görsel { uri, name, type } üçlüsüyle gönderilir (multer "logo"). */
export function uploadLeagueLogo(id: number, file: UploadFile) {
  const form = new FormData();
  form.append("logo", file as unknown as Blob);
  return patch<{ message: string; league_logo: string }>(`/ligler/updateLogo/${id}`, form, { timeout: 120_000 });
}

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/* ===================== SEZONLAR ===================== */

export interface Season extends LookupSeason {
  season_year?: string | null;
  standings_type?: string | null;
  points_win?: number | null;
  points_draw?: number | null;
  points_loss?: number | null;
  scoring_system_id?: number | null;
  roster_rule_set_id?: number | null;
  rule_book_id?: number | null;
  show_overall_standings?: boolean | null;
  group_display_mode?: string | null;
}

export const listSeasons = (user: AuthUser | null | undefined) =>
  fetchScopedSeasons(user, true) as Promise<Season[]>;

export const createSeason = (body: {
  season_name: string;
  league: League;
  season_priority?: unknown;
  rule_book_id?: string | null;
  fallbackCity?: string | null;
}) =>
  post<Season>("/sezonlar", {
    season_name: body.season_name.trim(),
    league_name: body.league.league_name,
    league_id: body.league.id,
    city: body.league.city || body.fallbackCity || undefined,
    city_id: body.league.city_id ?? undefined,
    season_year: String(new Date().getFullYear()),
    season_priority: priorityOf(body.season_priority),
    ...(body.rule_book_id ? { rule_book_id: body.rule_book_id } : {}),
  });

export const updateSeason = (id: number, body: { season_name: string; season_priority?: unknown }) =>
  patch<{ message?: string }>(`/sezonlar/update-season/${id}`, {
    newSeasonName: body.season_name.trim(),
    season_priority: priorityOf(body.season_priority),
  });

export const setSeasonArchived = (id: number, archived: boolean) =>
  patch<{ message?: string }>(`/sezonlar/${id}/archive`, { archived });

export const deleteSeason = (id: number) => del<{ message?: string }>(`/sezonlar/${id}`);

/** Kitapçık seçimi — ruleBookId kitapçığın public_id'si; null kaldırır. */
export const assignSeasonRuleBook = (seasonId: number, ruleBookId: string | null) =>
  put<{ season?: Partial<Season> }>(`/api/seasons/${seasonId}/rule-book`, { ruleBookId: ruleBookId || null });

/* ---- Puanlama sözlüğü (features/leagueSettings/scoringSystem.js) ---- */

export const STANDINGS_TYPE_LABELS: Record<string, string> = {
  standart: "Standart Puanlama",
  gucdengesi: "Güç Dengesi",
  ozel: "Özel Puanlama",
};

export function seasonScoringText(season: Season): string {
  const type = String(season.standings_type || "standart");
  if (type === "gucdengesi") return "Güç Dengesi";
  if (type !== "ozel") return "Standart (3-1-0)";
  return `Özel · G ${season.points_win ?? 3} · B ${season.points_draw ?? 1} · M ${season.points_loss ?? 0}`;
}

/* ---- Kadro kural setleri (yalnız ad gösterimi) ---- */

export interface RuleSetSummary {
  id: number;
  name: string;
  status?: string;
}

export const listRuleSets = () =>
  get<{ ruleSets?: RuleSetSummary[] }>("/api/roster-rule-sets").then((d) => d.ruleSets ?? []);

/* ===================== KURAL KİTAPÇIKLARI ===================== */

export const RULE_BOOK_STATUS_LABELS: Record<string, string> = { published: "Yayında", draft: "Taslak" };
export const RULE_BOOK_KIND_LABELS: Record<string, string> = { structured: "Seçenekli", rich: "Serbest metin" };

export interface ScoringState {
  type: "standart" | "gucdengesi" | "ozel" | string;
  win: number;
  draw: number;
  loss: number;
  name?: string | null;
  system_id?: number | null;
}

export interface RuleBook {
  /** public_id */
  id: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  kind: "structured" | "rich";
  settings?: unknown;
  status: "published" | "draft" | string;
  seasons?: { id: number; name: string; league_name?: string | null; archived?: boolean }[];
  manage_summary?: { scoring?: ScoringState | null; roster?: boolean | null } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export const listRuleBooks = (status?: string) =>
  get<{ items?: RuleBook[] }>("/api/rule-books/admin/list", { status: status || undefined }).then((d) => d.items ?? []);

export const getRuleBook = (publicId: string) =>
  get<{ item: RuleBook }>(`/api/rule-books/${encodeURIComponent(publicId)}`).then((d) => d.item);

export const getRuleBookManage = (publicId: string) =>
  get<{ manage?: { scoring?: Partial<ScoringState>; roster?: Partial<RosterState> } }>(
    `/api/rule-books/admin/${encodeURIComponent(publicId)}/manage`
  );

export interface BookSeason {
  id: number;
  name: string;
  league_name?: string | null;
  archived?: boolean;
  scoring?: ScoringState | null;
  roster?: { id: number; name?: string } | null;
}

export const getRuleBookSeasons = (publicId: string) =>
  get<{ seasons?: BookSeason[] }>(`/api/rule-books/admin/${encodeURIComponent(publicId)}/seasons`).then(
    (d) => d.seasons ?? []
  );

export interface RuleBookBody {
  kind: "structured" | "rich";
  title: string;
  status: string;
  content?: string;
  settings?: unknown;
  manage?: { scoring: Record<string, unknown>; roster: Record<string, unknown> };
}

export interface RuleBookSaveResult {
  message: string;
  item: RuleBook;
  sync?: { updated?: number; scoring?: number } | null;
}

export const createRuleBook = (body: RuleBookBody) => post<RuleBookSaveResult>("/api/rule-books", body);

/** Kısmi güncelleme: gönderilmeyen alanlar (settings, content) korunur. */
export const updateRuleBook = (publicId: string, body: Partial<RuleBookBody>) =>
  put<RuleBookSaveResult>(`/api/rule-books/${encodeURIComponent(publicId)}`, body);

export const deleteRuleBook = (publicId: string) =>
  del<{ message: string }>(`/api/rule-books/${encodeURIComponent(publicId)}`);

/** Serbest metni sunucunun beklediği basit HTML'e çevirir (paragraf + satır sonu). */
export function plainToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/** HTML içeriği düzenlenebilir düz metne çevirir. */
export function htmlToPlain(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---- Yönetilen kurallar: puanlama + kadro (features/ruleBuilder/managedRules.js) ---- */

export const LIMIT_TYPE = { FINITE: "FINITE", UNLIMITED: "UNLIMITED", NONE: "NONE", VARIABLE: "VARIABLE" } as const;
export const VALIDITY_TYPE = { MATCH_COUNT: "MATCH_COUNT", DATE: "DATE", STAGE: "STAGE", SEASON_END: "SEASON_END" } as const;
export const START_TYPE = {
  SEASON_START: "SEASON_START",
  DATE: "DATE",
  MATCH_COUNT: "MATCH_COUNT",
  STAGE: "STAGE",
  PREVIOUS: "PREVIOUS_PERIOD_END",
} as const;

export const SCORING_CHOICES = [
  { value: "standart", label: "Standart", hint: "Galibiyet 3, beraberlik 1, mağlubiyet 0 puan." },
  { value: "gucdengesi", label: "Güç dengesi", hint: "Puan rakibin gücüne göre değişir (puan endeksi)." },
  { value: "ozel", label: "Özel puanlar", hint: "Galibiyet, beraberlik ve mağlubiyet puanlarını siz belirleyin." },
];

export const POINT_RANGE = { min: -10, max: 20 };

export const START_LABELS: Record<string, string> = {
  SEASON_START: "Sezon başında",
  DATE: "Belirli bir tarihte",
  MATCH_COUNT: "Belirli bir maçtan sonra",
  STAGE: "Belirli bir etapta",
  PREVIOUS_PERIOD_END: "Önceki dönem bitince",
};

export const VALIDITY_LABELS: Record<string, string> = {
  SEASON_END: "Sezon sonuna kadar",
  MATCH_COUNT: "Belirli bir maça kadar",
  DATE: "Belirli bir tarihe kadar",
  STAGE: "Belirli bir etaba kadar",
};

export const LIMIT_TYPE_LABELS: Record<string, string> = {
  FINITE: "Sayı",
  UNLIMITED: "Sınırsız",
  NONE: "Yok",
  VARIABLE: "Değişken",
};

/** Her limit alanının seçenekleri (sunucu: constants/rosterRules.js). */
export const LIMIT_FIELDS: { key: string; label: string; types: string[]; min: number }[] = [
  { key: "general_roster_limit", label: "Genel kadro", types: ["FINITE", "UNLIMITED"], min: 1 },
  { key: "licensed_roster_limit", label: "Lisanslı kadro", types: ["FINITE", "UNLIMITED"], min: 0 },
  { key: "field_player_count", label: "Sahadaki oyuncu", types: ["FINITE", "VARIABLE"], min: 1 },
  { key: "licensed_field_player_limit", label: "Sahada lisanslı", types: ["FINITE", "UNLIMITED"], min: 0 },
  { key: "substitute_limit", label: "Yedek sayısı", types: ["FINITE", "UNLIMITED"], min: 0 },
  { key: "substitution_limit", label: "Oyuncu değişikliği", types: ["FINITE", "UNLIMITED"], min: 0 },
  { key: "guest_limit", label: "Misafir oyuncu", types: ["NONE", "FINITE", "UNLIMITED"], min: 0 },
  { key: "transfer_limit", label: "Transfer hakkı", types: ["NONE", "FINITE", "UNLIMITED"], min: 0 },
];

export const CARRY_LABELS: Record<string, string> = {
  CARRY_REMAINING_AND_ADD: "Kalan hakların üzerine eklenir",
  RESET_AND_GRANT: "Sıfırlanıp yeniden verilir",
};

export const LICENSE_FROM_LABELS: Record<string, string> = {
  "": "Belirtilmemiş",
  DATE: "Belirli bir tarihten",
  MONTHS_BEFORE_SEASON: "Sezon başlangıcından önceki aylardan",
};

export const LEAGUE_CATEGORY_LABELS: Record<string, string> = {
  IKINCI_AMATOR: "2. Amatör",
  BIRINCI_AMATOR: "1. Amatör",
  SAL: "SAL Ligi (Süper Amatör)",
  BAL: "BAL Ligi (Bölgesel Amatör)",
  PROFESYONEL: "Profesyonel Ligler",
  ALTYAPI: "Altyapı Ligleri",
};

/** Dönem kaydı — sunucu RosterRulePeriod alanlarıyla aynı anahtarlar. */
export type RosterPeriod = Record<string, unknown> & {
  name?: string | null;
  start_type: string;
  validity_type: string;
  eligibilityRules?: unknown[];
  licensed_league_categories?: string[];
};

export interface RosterState {
  enabled: boolean;
  periods: RosterPeriod[];
  dirty: boolean;
  rule_set_id: number | null;
  name: string;
  season_count: number;
}

export interface ManageState {
  scoring: ScoringState;
  roster: RosterState;
}

export const DEFAULT_SCORING: ScoringState = { type: "standart", win: 3, draw: 1, loss: 0, name: "", system_id: null };

const BLANK_PERIOD: RosterPeriod = {
  name: "",
  start_type: START_TYPE.SEASON_START,
  start_value_date: null,
  start_value_int: null,
  validity_type: VALIDITY_TYPE.SEASON_END,
  end_value_date: null,
  end_value_int: null,
  general_roster_limit_type: LIMIT_TYPE.FINITE,
  general_roster_limit_value: 16,
  licensed_roster_limit_type: LIMIT_TYPE.FINITE,
  licensed_roster_limit_value: 3,
  field_player_count_type: LIMIT_TYPE.FINITE,
  field_player_count_value: 7,
  minimum_field_player_count: 4,
  licensed_field_player_limit_type: LIMIT_TYPE.FINITE,
  licensed_field_player_limit_value: 2,
  substitute_limit_type: LIMIT_TYPE.FINITE,
  substitute_limit_value: 5,
  substitution_limit_type: LIMIT_TYPE.UNLIMITED,
  substitution_limit_value: null,
  player_reentry_allowed: false,
  guest_limit_type: LIMIT_TYPE.FINITE,
  guest_limit_value: 4,
  transfer_limit_type: LIMIT_TYPE.NONE,
  transfer_limit_value: null,
  transfer_carry_mode: null,
  license_valid_from_type: null,
  license_valid_from_date: null,
  license_valid_from_months: null,
  licensed_league_categories: [],
  eligibilityRules: [],
};

export const blankPeriod = (): RosterPeriod => ({ ...BLANK_PERIOD, licensed_league_categories: [], eligibilityRules: [] });

/** Transfer geçiş biçimi yalnız önceki dönem sınırsız değilken sayısal hakta sorulur. */
export const carryRequired = (period: RosterPeriod, previous?: RosterPeriod) =>
  Boolean(previous) && previous!.transfer_limit_type !== LIMIT_TYPE.UNLIMITED && period.transfer_limit_type === LIMIT_TYPE.FINITE;

export function withCarry(periods: RosterPeriod[]): RosterPeriod[] {
  return periods.map((period, index) => {
    const required = carryRequired(period, periods[index - 1]);
    if (!required && period.transfer_carry_mode) return { ...period, transfer_carry_mode: null };
    if (required && !period.transfer_carry_mode) return { ...period, transfer_carry_mode: "CARRY_REMAINING_AND_ADD" };
    return period;
  });
}

/** Önceki dönem bitmeden yeni dönem başlamaz: "sezon sonuna kadar" son dönemde kalır. */
export function addPeriod(periods: RosterPeriod[]): RosterPeriod[] {
  const list = periods.map((p) => ({ ...p }));
  const previous = list[list.length - 1];
  if (previous && previous.validity_type === VALIDITY_TYPE.SEASON_END) {
    previous.validity_type = VALIDITY_TYPE.MATCH_COUNT;
    previous.end_value_int = previous.end_value_int || 5;
  }
  const base = previous ? { ...previous, eligibilityRules: [...(previous.eligibilityRules ?? [])] } : blankPeriod();
  const next: RosterPeriod = {
    ...base,
    name: "",
    start_type: list.length ? START_TYPE.PREVIOUS : START_TYPE.SEASON_START,
    start_value_date: null,
    start_value_int: null,
    validity_type: VALIDITY_TYPE.SEASON_END,
    end_value_date: null,
    end_value_int: null,
  };
  return withCarry([...list, next]);
}

export function removePeriod(periods: RosterPeriod[], index: number): RosterPeriod[] {
  const list = periods.filter((_, i) => i !== index).map((p) => ({ ...p }));
  if (list[0] && list[0].start_type === START_TYPE.PREVIOUS) list[0].start_type = START_TYPE.SEASON_START;
  if (list.length) {
    list[list.length - 1] = { ...list[list.length - 1], validity_type: VALIDITY_TYPE.SEASON_END, end_value_int: null, end_value_date: null };
  }
  return withCarry(list);
}

const cleanScoring = (scoring?: Partial<ScoringState> | null): ScoringState => ({
  ...DEFAULT_SCORING,
  ...(scoring || {}),
  name: scoring?.name || "",
});

const cleanRoster = (roster?: Partial<RosterState> | null): RosterState => ({
  enabled: Boolean(roster?.enabled),
  periods: Array.isArray(roster?.periods) ? (roster!.periods as RosterPeriod[]) : [],
  dirty: false,
  rule_set_id: roster?.rule_set_id ?? null,
  name: roster?.name || "",
  season_count: roster?.season_count ?? 0,
});

export const emptyManage = (): ManageState => ({ scoring: cleanScoring(null), roster: cleanRoster(null) });

export const manageFromApi = (manage?: { scoring?: Partial<ScoringState>; roster?: Partial<RosterState> } | null): ManageState =>
  manage ? { scoring: cleanScoring(manage.scoring), roster: cleanRoster(manage.roster) } : emptyManage();

/** Kopyada kural seti bağı gelmez (sunucu yeni set açar). */
export const copyManage = (state: ManageState): ManageState => ({
  ...state,
  roster: { ...state.roster, rule_set_id: null, season_count: 0, dirty: state.roster.enabled },
});

/** Kaydetme isteğindeki "manage" alanı (managedRules.managePayload). */
export function managePayload(state: ManageState) {
  const s = state.scoring;
  const scoring = {
    type: s.type,
    win: Number(s.win),
    draw: Number(s.draw),
    loss: Number(s.loss),
    name: String(s.name || "").trim() || null,
  };
  const r = state.roster;
  const roster = !r.enabled
    ? { enabled: false }
    : !r.dirty && r.rule_set_id
      ? { enabled: true }
      : { enabled: true, periods: r.periods };
  return { scoring, roster };
}

export function scoringSummary(scoring?: Partial<ScoringState> | null): string {
  if (!scoring) return "—";
  if (scoring.type === "gucdengesi") return "Güç dengesi";
  if (scoring.type === "ozel") {
    return `${scoring.name ? `${scoring.name} · ` : "Özel · "}G ${Number(scoring.win)} · B ${Number(scoring.draw)} · M ${Number(scoring.loss)}`;
  }
  return "Standart (3-1-0)";
}

/** Özel puan doğrulaması (scoringSystem.validatePoints). */
export function validatePoints({ win, draw, loss }: { win: unknown; draw: unknown; loss: unknown }): string | null {
  const fields: [string, unknown][] = [["Galibiyet", win], ["Beraberlik", draw], ["Mağlubiyet", loss]];
  for (const [label, raw] of fields) {
    if (raw === "" || raw == null) return `${label} puanını girin.`;
    const n = Number(raw);
    if (!Number.isInteger(n)) return `${label} puanı tam sayı olmalı.`;
    if (n < POINT_RANGE.min || n > POINT_RANGE.max) return `${label} puanı ${POINT_RANGE.min} ile ${POINT_RANGE.max} arasında olmalı.`;
  }
  if (!(Number(win) > Number(draw) && Number(draw) >= Number(loss))) {
    return "Galibiyet puanı beraberlikten büyük, beraberlik puanı mağlubiyetten küçük olamaz.";
  }
  return null;
}

/* ===================== LİG STATÜSÜ (gruplar) ===================== */

export const SLOT_SOURCES = {
  EMPTY: "EMPTY",
  TEAM: "TEAM",
  OVERALL_RANK: "OVERALL_RANK",
  GROUP_RANK: "GROUP_RANK",
  MATCH_WINNER: "MATCH_WINNER",
  MATCH_LOSER: "MATCH_LOSER",
} as const;

export const SLOT_SOURCE_LABELS: Record<string, string> = {
  EMPTY: "Boş bırak",
  TEAM: "Takım",
  OVERALL_RANK: "Genel tablo sırası",
  GROUP_RANK: "Grup sırası",
  MATCH_WINNER: "Eşleşme galibi",
  MATCH_LOSER: "Eşleşme mağlubu",
};

export const GROUP_KIND_LABELS: Record<string, string> = { grup: "Grup", etap: "Etap" };
export const GROUP_FORMAT_LABELS: Record<string, string> = { serbest: "Serbest", fikstur: "Fikstürlü" };
export const DISPLAY_MODE_LABELS: Record<string, string> = { sekme: "Sekmeli", agac: "Ağaç şeması" };
export const MAX_SOURCE_RANK = 50;

export interface GroupSlot {
  id: number;
  slot_order: number;
  source_type: string;
  team_id: number | null;
  source_group_id: number | null;
  source_rank: number | null;
  source_matchup: number | null;
  resolved_team_id?: number | null;
  resolved_team_name?: string | null;
  resolved_team_logo?: string | null;
  source_label?: string | null;
}

export interface MeetingSide {
  slot_id: number;
  label?: string | null;
  team?: { team_id: number; team_name: string; logo?: string } | null;
}

export interface Meeting {
  key: string;
  index: number;
  leg: number;
  home_slot_id: number;
  away_slot_id: number;
  home: MeetingSide;
  away: MeetingSide;
  match?: {
    id: number;
    home_score: number | null;
    away_score: number | null;
    date?: string | null;
    time?: string | null;
    venue?: string | null;
    status?: string | null;
  } | null;
  linked?: boolean;
  winner_team_id?: number | null;
  drawn?: boolean;
  decided_by?: string | null;
  needs_winner?: boolean;
  picked_winner_team_id?: number | null;
}

export interface ScheduleRound {
  round: number;
  round_label?: string | null;
  leg?: number;
  meetings: Meeting[];
}

export interface SeasonGroup {
  id: number;
  season_id: number;
  group_name: string;
  group_priority: number | null;
  group_kind: "grup" | "etap" | string;
  group_format: "serbest" | "fikstur" | string;
  double_round: boolean;
  show_in_bracket: boolean;
  slot_count: number;
  unit_count: number;
  slots: GroupSlot[];
  team_count: number;
  matchup_count: number;
  schedule?: ScheduleRound[];
  round_count?: number;
}

export interface SeasonOverview {
  settings: {
    season_id: number | null;
    show_overall_standings: boolean;
    group_display_mode: string;
    standings_type?: string;
  } | null;
  groups: SeasonGroup[];
}

const G = "/api/season-groups";

export const getSeasonOverview = (seasonId: number) =>
  get<SeasonOverview>(`${G}/season/${seasonId}`).then((d) => ({ settings: d.settings ?? null, groups: d.groups ?? [] }));

export const updateSeasonGroupSettings = (
  seasonId: number,
  body: { showOverallStandings?: boolean; groupDisplayMode?: string }
) => patch<{ settings: SeasonOverview["settings"] }>(`${G}/season/${seasonId}/settings`, body);

export const resolveSeasonGroups = (seasonId: number) => post<SeasonOverview>(`${G}/season/${seasonId}/resolve`);

export interface GroupBody {
  groupName?: string;
  groupPriority?: number | null;
  groupKind?: string;
  groupFormat?: string;
  doubleRound?: boolean;
  showInBracket?: boolean;
}

export const createSeasonGroup = (seasonId: number, body: GroupBody & { slotCount?: number }) =>
  post<{ group: SeasonGroup }>(G, { seasonId, ...body });

export const updateSeasonGroup = (groupId: number, body: GroupBody) => patch<{ group: SeasonGroup }>(`${G}/${groupId}`, body);

export const deleteSeasonGroup = (groupId: number) => del<{ message?: string }>(`${G}/${groupId}`);

/** İskelet boyutu (grupta takım, etapta eşleşme). Küçültme dolu kutu silecekse 409 + SLOT_SHRINK_FILLED. */
export const setGroupSlotCount = (groupId: number, count: number, force = false) =>
  put<unknown>(`${G}/${groupId}/slots/count`, { count, force });

export const updateGroupSlot = (
  groupId: number,
  slotId: number,
  body: { source_type: string; team_id?: number | null; source_group_id?: number | null; source_rank?: number | null; source_matchup?: number | null }
) => patch<unknown>(`${G}/${groupId}/slots/${slotId}`, body);

export const clearGroupSlot = (groupId: number, slotId: number) => post<unknown>(`${G}/${groupId}/slots/${slotId}/clear`);

export const moveGroupSlot = (groupId: number, slotId: number, direction: "up" | "down") =>
  post<unknown>(`${G}/${groupId}/slots/${slotId}/move`, { direction });

/** Statü şablonu (services/seasonGroups/structure.js). */
export interface StructureTemplate {
  groups: { count: number; size?: number; format?: string; doubleRound?: boolean };
  knockout:
    | { enabled: false }
    | {
        enabled: true;
        perGroup?: number;
        qualifiers?: number;
        doubleRound: boolean;
        finalDoubleRound: boolean;
        thirdPlace: boolean;
        pairing: "auto" | "seeded";
      };
}

export interface StructurePreview {
  groups?: { name: string; kind: string; format?: string; double_round?: boolean; slots: string[] }[];
}

export const previewStructure = (template: StructureTemplate) =>
  post<StructurePreview>(`${G}/structure/preview`, { template });

export const buildStructure = (seasonId: number, template: StructureTemplate) =>
  post<unknown>(`${G}/season/${seasonId}/structure`, { template, mode: "replace" });

export const copyStructure = (
  sourceSeasonId: number,
  body: { targetSeasonId: number; mode: "append" | "replace"; includeTeams: boolean; includeSettings: boolean }
) => post<{ message?: string }>(`${G}/season/${sourceSeasonId}/copy-to`, body);

/** "Fikstüre ekle": eşleşme için tarih/saat girilerek maç oluşturulur. */
export const addMeetingFixture = (
  groupId: number,
  body: { homeSlotId: number; awaySlotId: number; leg: number; date: string; time: string; venue?: string }
) => post<{ message?: string }>(`${G}/${groupId}/fixtures`, body);

/** Bağı kaldırır; maç silinmez. */
export const unlinkMeeting = (groupId: number, q: { homeSlotId: number; awaySlotId: number; leg: number }) =>
  del<unknown>(`${G}/${groupId}/fixtures?homeSlotId=${q.homeSlotId}&awaySlotId=${q.awaySlotId}&leg=${q.leg}`);

/** Berabere biten eleme eşleşmesinin galibi; null seçimi kaldırır. */
export const pickMeetingWinner = (
  groupId: number,
  body: { homeSlotId: number; awaySlotId: number; winnerTeamId: number | null }
) => put<unknown>(`${G}/${groupId}/fixtures/winner`, body);

