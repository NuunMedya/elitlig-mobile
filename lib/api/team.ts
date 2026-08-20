import { del, get, patch, post, put } from "../http";

/**
 * Takım paneli uçları — takım başkanı ve oyuncu tarafı.
 *
 * Kaynak sunucu dosyaları (alan adları birebir oradan alınmıştır):
 *   routes/teamManagement.js  + services/teamRosterService.js + services/teamFinance
 *   routes/teamJoinRequests.js + services/teamJoinRequestService.js
 *   routes/teamRecruitments.js
 *   routes/matchAvailability.js
 *   routes/matchCenter.js     + services/teamMatchCenterService.js
 */

/* ===================== MEVKİ SÖZLÜĞÜ ===================== */

/**
 * Sunucudaki constants/positions.js ile aynı sözlük (11 kısaltma).
 * PlayerTeams.team_position bu kodlardan birini saklar; sunucu başka
 * değer kabul etmez (400 INVALID_POSITION / VALIDATION_ERROR).
 */
export const POSITIONS = [
  { code: "KL", label: "Kaleci", line: "GK" },
  { code: "STP", label: "Stoper", line: "DEF" },
  { code: "SLB", label: "Sol Bek", line: "DEF" },
  { code: "SGB", label: "Sağ Bek", line: "DEF" },
  { code: "DOS", label: "Defansif Orta Saha", line: "MID" },
  { code: "MOS", label: "Merkez Orta Saha", line: "MID" },
  { code: "OOS", label: "Ofansif Orta Saha", line: "MID" },
  { code: "SLK", label: "Sol Kanat", line: "MID" },
  { code: "SGK", label: "Sağ Kanat", line: "MID" },
  { code: "FOR", label: "Forvet", line: "FWD" },
  { code: "SNT", label: "Santrafor", line: "FWD" },
] as const;

export type PositionCode = (typeof POSITIONS)[number]["code"];

export const POSITION_LABELS: Record<string, string> = Object.fromEntries(
  POSITIONS.map((item) => [item.code, item.label])
);

/** Kısaltmayı insan-okur etikete çevirir; tanınmazsa girilen değer korunur. */
export const positionLabel = (value?: string | null): string =>
  value ? POSITION_LABELS[value] ?? String(value) : "";

/* ===================== TAKIM PANELİ (dashboard) ===================== */

/** GET /api/team-management/dashboard — db.Teams satırı aynen döner. */
export interface DashboardTeam {
  id: number;
  team_name: string;
  logo: string | null;
  city: string | null;
  city_id: number | null;
  current_league: string | null;
  current_season: string | null;
  total_matches?: number | null;
  team_wins?: number | null;
  team_draws?: number | null;
  team_losses?: number | null;
  goals_scored?: number | null;
  goals_conceded?: number | null;
  team_points?: number | null;
}

export interface DashboardPlayer {
  id: number;
  player_name: string;
  player_img: string | null;
  player_position: string | null;
}

export interface DashboardContract {
  id: number;
  public_id?: string;
  status: string;
  player_id: number;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
}

export interface TeamDashboardResponse {
  managed: boolean;
  team: DashboardTeam | null;
  roster: { contracted: DashboardPlayer[]; withoutContract: DashboardPlayer[] };
  contracts: DashboardContract[];
  pendingChanges: { id: number; type: string; status: string; created_at?: string }[];
  /** managed=false olduğunda gelir; başkan olmayan hesabın karşılama metni. */
  onboarding?: { title: string; description: string; actions: string[] };
}

export const getTeamDashboard = () =>
  get<TeamDashboardResponse>("/api/team-management/dashboard");

/* ===================== KADRO YÖNETİMİ ===================== */

/** services/teamRosterService.js getRoster — kadro satırı. */
export type SquadRole = "starter" | "substitute" | "reserve";

export interface RosterPlayer {
  id: number;
  player_name: string;
  player_img: string | null;
  /** Kişisel profildeki mevki (yalnızca referans; başkan düzenleyemez). */
  profile_position: string | null;
  jersey_number: number | null;
  /** POSITIONS sözlüğündeki kısaltmalardan biri. */
  team_position: string | null;
  squad_role: SquadRole;
  lineup_slot: string | null;
  sort_order: number;
  has_active_contract: boolean;
  has_linked_account: boolean;
}

export interface TeamRosterResponse {
  managed: boolean;
  team: {
    id: number;
    team_name: string;
    logo: string | null;
    city: string | null;
    colors: string | null;
    current_league: string | null;
    current_season: string | null;
  };
  settings: {
    formation: string;
    home_kit: Record<string, string> | null;
    away_kit: Record<string, string> | null;
  };
  formations: Record<string, string[]>;
  roster: RosterPlayer[];
  contracts: DashboardContract[];
}

export const getTeamRoster = () => get<TeamRosterResponse>("/api/team-management/roster");

/**
 * PATCH /api/team-management/roster/:playerId — takıma özgü alanlar.
 * DİKKAT: squad_role "starter" bu uçtan seçilemez; İlk 8'i diziliş ekranı
 * (PUT /lineup) belirler. Sunucu starter denemesini 400 ile reddeder.
 */
export interface RosterPlayerPatch {
  jersey_number?: number | null;
  team_position?: string | null;
  squad_role?: Exclude<SquadRole, "starter">;
}

export const updateRosterPlayer = (playerId: number, body: RosterPlayerPatch) =>
  patch<{ message: string; player: Partial<RosterPlayer> }>(
    `/api/team-management/roster/${playerId}`,
    body
  );

export interface ReleasePlayerResult {
  message: string;
  player_id: number;
  player_name: string;
  team_id: number;
  terminated_contracts: number;
  season_roster_removals: number;
  withdrawn_offers: number;
}

/**
 * DELETE /api/team-management/roster/:playerId — kadrodan çıkar.
 * Aktif sözleşme varsa sunucu 409 PLAYER_HAS_ACTIVE_CONTRACT döndürür;
 * kullanıcı fesih onayı verirse force=true ile tekrar çağrılır.
 */
export const releaseRosterPlayer = (playerId: number, force = false) =>
  del<ReleasePlayerResult>(
    `/api/team-management/roster/${playerId}${force ? "?force=true" : ""}`
  );

/** PUT /api/team-management/lineup — ideal kadro (diziliş + ilk 8). */
export const saveLineup = (formation: string, assignments: { playerId: number; slot: string }[]) =>
  put<TeamRosterResponse & { message: string }>("/api/team-management/lineup", {
    formation,
    assignments,
  });

/** PATCH /api/team-management/settings — forma renkleri, diziliş. */
export const updateTeamSettings = (body: {
  formation?: string;
  home_kit?: Record<string, string> | null;
  away_kit?: Record<string, string> | null;
}) => patch<{ message: string; settings: TeamRosterResponse["settings"] }>(
  "/api/team-management/settings",
  body
);

/* ===================== KULÜP KASASI ===================== */

/** constants/teamFinance.js — kayıt tipleri ve FFP durumları. */
export type FinanceEntryType =
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "ADJUSTMENT_INCOME"
  | "ADJUSTMENT_EXPENSE";

export type FfpStatus = "DISABLED" | "COMPLIANT" | "WARNING" | "BREACH";

export interface FinanceSquadPlayer {
  id: number;
  playerName: string;
  position: string | null;
  image: string | null;
  marketValue: number | null;
  marketScore: number | null;
  globalRank: number | null;
}

export interface FinanceLedgerEntry {
  id: number;
  entryType: FinanceEntryType;
  amount: number | string;
  currency: string;
  playerId: number | null;
  contractId: number | null;
  counterpartyTeamId: number | null;
  description: string | null;
  createdAt: string;
  playerName: string | null;
  counterpartyTeamName: string | null;
}

export interface FfpCheck {
  key: string;
  limit: number;
  value: number;
  usagePct: number;
  status: FfpStatus;
}

export interface TeamFinanceResponse {
  team: {
    id: number;
    teamName: string;
    logo: string | null;
    city: string | null;
    league: string | null;
    season: string | null;
  };
  squad: FinanceSquadPlayer[];
  squadValue: number;
  playerCount: number;
  entries: FinanceLedgerEntry[];
  totals: { income: number; expense: number; netSpend: number };
  ffp: { enabled: boolean; status: FfpStatus; netSpend: number; checks: FfpCheck[] };
}

export const getTeamFinance = () => get<TeamFinanceResponse>("/api/team-management/finance");

/** Gelir sayılan kayıt tipleri (constants/teamFinance.js INCOME_TYPES). */
export const FINANCE_INCOME_TYPES: FinanceEntryType[] = ["TRANSFER_OUT", "ADJUSTMENT_INCOME"];

export const FINANCE_ENTRY_LABELS: Record<FinanceEntryType, string> = {
  TRANSFER_IN: "Transfer (oyuncu alımı)",
  TRANSFER_OUT: "Transfer (oyuncu satışı)",
  ADJUSTMENT_INCOME: "Yönetici düzeltmesi (gelir)",
  ADJUSTMENT_EXPENSE: "Yönetici düzeltmesi (gider)",
};

/* ===================== DAVET & BAŞVURULAR ===================== */

/** services/teamJoinRequestService.js shape() çıktısı. */
export type JoinRequestType = "invite" | "application";
export type JoinRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface JoinRequest {
  id: number;
  type: JoinRequestType;
  status: JoinRequestStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  team: { id: number; name?: string; logo?: string | null };
  player: { id: number; name?: string; image?: string | null; position?: string | null };
}

export interface JoinRequestsResponse {
  /** Yanıtlaması bekleneni: oyuncuya davetler, başkana başvurular. */
  inbox: JoinRequest[];
  /** Üyenin kendi başlattıkları. */
  outbox: JoinRequest[];
}

export const getJoinRequests = () => get<JoinRequestsResponse>("/api/team-join-requests");

/** Başkan → serbest oyuncuya davet. */
export const createInvite = (playerId: number, message?: string) =>
  post<{ message: string; request: JoinRequest }>("/api/team-join-requests/invites", {
    playerId,
    message,
  });

/** Oyuncu → takıma katılım başvurusu (yalnızca serbest oyuncular). */
export const createApplication = (teamId: number, message?: string) =>
  post<{ message: string; request: JoinRequest }>("/api/team-join-requests/applications", {
    teamId,
    message,
  });

export const acceptJoinRequest = (id: number) =>
  post<{ message: string; request: JoinRequest }>(`/api/team-join-requests/${id}/accept`);

export const rejectJoinRequest = (id: number) =>
  post<{ message: string; request: JoinRequest }>(`/api/team-join-requests/${id}/reject`);

export const cancelJoinRequest = (id: number) =>
  post<{ message: string; request: JoinRequest }>(`/api/team-join-requests/${id}/cancel`);

/* ===================== OYUNCU ARIYORUZ İLANLARI ===================== */

/** routes/teamRecruitments.js shape() çıktısı. */
export interface Recruitment {
  id: number;
  teamId: number;
  /** POSITIONS sözlüğündeki kısaltmalar. */
  positions: string[];
  note: string | null;
  status: "open" | "closed";
  created_at: string;
  team: {
    id: number;
    name: string;
    logo: string | null;
    city: string | null;
    league: string | null;
  } | null;
}

export const getRecruitments = (teamId?: number) =>
  get<{ items: Recruitment[] }>("/api/team-recruitments", { teamId });

export const getMyRecruitments = () =>
  get<{ items: Recruitment[] }>("/api/team-recruitments/mine");

export const createRecruitment = (positions: string[], note?: string) =>
  post<{ message: string; item: Recruitment }>("/api/team-recruitments", { positions, note });

export const closeRecruitment = (id: number) =>
  post<{ message: string; item: Recruitment }>(`/api/team-recruitments/${id}/close`);

/* ===================== MAÇ MÜSAİTLİK YOKLAMASI ===================== */

/** routes/matchAvailability.js — coming | not_coming | maybe. */
export type AvailabilityStatus = "coming" | "not_coming" | "maybe";

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  coming: "Geliyorum",
  maybe: "Belirsiz",
  not_coming: "Gelemiyorum",
};

export const getMyAvailability = (matchId: number) =>
  get<{ status: AvailabilityStatus | null }>(`/api/match-availability/${matchId}/mine`);

export const setMyAvailability = (matchId: number, status: AvailabilityStatus) =>
  post<{ message: string; status: AvailabilityStatus }>(`/api/match-availability/${matchId}`, {
    status,
  });

export interface TeamAvailabilityResponse {
  matchId: number;
  counts: { coming: number; not_coming: number; maybe: number; unanswered: number };
  players: { id: number; name: string; status: AvailabilityStatus | null }[];
}

/** Başkana özel: takımın yoklama dağılımı. */
export const getTeamAvailability = (matchId: number) =>
  get<TeamAvailabilityResponse>(`/api/match-availability/${matchId}/team`);

/* ===================== MAÇ MERKEZİ ===================== */

/** services/teamMatchCenterService.js serializeMatch — Matches satırı + ek alanlar. */
export interface TeamMatch {
  id: number;
  date: string;
  time: string | null;
  first_team_name: string;
  second_team_name: string;
  first_team_score: number | null;
  second_team_score: number | null;
  match_field?: string | null;
  mac_durumu: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  is_home: boolean;
  opponent_team_id: number | null;
  opponent_name: string | null;
}

export interface TeamMatchesResponse {
  upcoming: TeamMatch[];
  past: TeamMatch[];
}

export const getTeamMatches = () => get<TeamMatchesResponse>("/api/match-center/team/matches");

export const getTeamMatchDetail = (matchId: number) =>
  get<{ match: TeamMatch; team_id: number; plan: unknown; lineup: unknown[] }>(
    `/api/match-center/team/matches/${matchId}`
  );

/**
 * Maç karnesi — 6 puan alanı, hepsi 1-10 arası tam sayı (sunucu hepsini
 * zorunlu tutar: INVALID_SCORE). Alan adları matchCenter servisinden.
 */
export interface MatchReviewScores {
  announcer_score: number;
  director_score: number;
  referee_score: number;
  photographer_score: number;
  medic_score: number;
  opponent_score: number;
}

export interface MatchReview extends MatchReviewScores {
  id?: number;
  match_id?: number;
  comment: string | null;
}

export const REVIEW_SCORE_FIELDS: { key: keyof MatchReviewScores; label: string }[] = [
  { key: "announcer_score", label: "Spiker" },
  { key: "director_score", label: "Reji" },
  { key: "referee_score", label: "Hakem" },
  { key: "photographer_score", label: "Fotoğrafçı" },
  { key: "medic_score", label: "Sağlıkçı" },
  { key: "opponent_score", label: "Rakip" },
];

export const getMyMatchReview = (matchId: number) =>
  get<{ review: MatchReview | null }>(`/api/match-center/matches/${matchId}/my-review`);

export const submitMatchReview = (
  matchId: number,
  scores: MatchReviewScores,
  comment?: string
) =>
  put<{ message: string; review: MatchReview }>(`/api/match-center/matches/${matchId}/review`, {
    ...scores,
    comment,
  });

/* ═════════════════════ MAÇ AL — SAHA TALEBİ ═════════════════════
 *
 * routes/matchRequests.js üye tarafı. Başkan saha panosundan boş saatleri
 * seçip talep gönderir; yönetici onaylayınca slot "dolu" olur ve takıma
 * MATCH_REQUEST bildirimi düşer (services/matchRequestService.js → notify).
 *
 * Pano hücrelerinin şekli yönetim tarafıyla AYNIDIR; tipler admin.ts'ten
 * yeniden kullanılır ki iki taraf birbirinden ayrışmasın.
 */

import type { AdminBoardCell, AdminVenue, WeekOption } from "./admin";

export interface TeamVenuesResponse {
  items: AdminVenue[];
  weeks: WeekOption[];
  today: string;
}

export interface TeamBoardResponse {
  venue: AdminVenue;
  cells: AdminBoardCell[];
  weeks: WeekOption[];
  week_start: string;
  today: string;
  booking_window: { start: string; end: string };
  /** Panoyu isteyen başkanın takımı — kendi taleplerini ayırt etmek için. */
  teamId: number | null;
}

export type MatchRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface MatchRequestSlot {
  date: string;
  hour: number;
  minute: number;
  label?: string;
  status?: string;
}

export interface MyMatchRequest {
  public_id: string;
  status: MatchRequestStatus;
  note: string | null;
  admin_note: string | null;
  created_at: string;
  venue_name: string;
  venue_public_id: string | null;
  venue_location: string;
  slots: MatchRequestSlot[];
}

export interface MyMatchRequestsResponse {
  items: MyMatchRequest[];
}

export const MATCH_REQUEST_STATUS_LABELS: Record<MatchRequestStatus, string> = {
  pending: "Yanıt bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  cancelled: "Geri çekildi",
};

/** GET /api/match-requests/venues — üyenin ilindeki aktif sahalar. */
export const getVenues = () => get<TeamVenuesResponse>("/api/match-requests/venues");

/** GET /api/match-requests/venues/:publicId/board?weekStart= */
export const getVenueBoard = (publicId: string, weekStart?: string) =>
  get<TeamBoardResponse>(`/api/match-requests/venues/${publicId}/board`, { weekStart });

/** GET /api/match-requests/mine — takımın gönderdiği talepler. */
export const getMyMatchRequests = (status?: MatchRequestStatus | "all") =>
  get<MyMatchRequestsResponse>("/api/match-requests/mine", { status });

/**
 * POST /api/match-requests — seçilen saatler için talep gönder.
 * Sunucu saatleri ızgara içinde ve rezervasyon penceresinde olmaya zorlar.
 */
export const createMatchRequest = (body: {
  venueId: string;
  slots: { date: string; hour: number; minute: number }[];
  note?: string;
}) => post<{ message: string; item: MyMatchRequest }>("/api/match-requests", body);

/** DELETE /api/match-requests/:publicId — bekleyen talebi geri çek. */
export const cancelMatchRequest = (publicId: string) =>
  del<{ message: string; cancelled: boolean }>(`/api/match-requests/${publicId}`);

/* ═════════════════════ MAÇ KADROSU (MAÇ BAZLI) ═════════════════════
 *
 * "İdeal kadro" (PUT /api/team-management/lineup) takımın genel dizilişidir;
 * BURASI tek bir maçın kadrosudur ve maça özeldir: kim ilk 11'de, kim yedek,
 * kaptan kim, misafir oyuncu var mı. Maç canlı akışa geçtikten sonra sunucu
 * 409 MATCH_ALREADY_LIVE döndürür — o noktadan sonra kadro reji tarafındadır.
 */

export interface MatchPlanPlayer {
  playerId: number | null;
  isGuest: boolean;
  guestName: string | null;
  jerseyNumber: number | null;
  position: string | null;
  starter: boolean;
  captain: boolean;
  slot: string | null;
}

export interface MatchPlan {
  formation: string | null;
  kit_color: string | null;
  kit_secondary_color: string | null;
  goal_music_url: string | null;
  tactics: string | null;
  lineup: MatchPlanPlayer[] | null;
  status: string | null;
}

/** GET /api/match-center/team/matches/:matchId */
export interface TeamMatchDetailResponse {
  match: TeamMatch;
  team_id: number;
  plan: MatchPlan | null;
  /** Sunucudaki kadro satırları (mac_kadrolari) — plan yoksa buradan türetilir. */
  lineup: {
    id: number;
    oyuncu_id: number | null;
    oyuncu_adi?: string | null;
    forma_no: number | null;
    ilk11_mi: boolean | number | null;
    mevki?: string | null;
  }[];
}

export const getTeamMatchPlan = (matchId: number) =>
  get<TeamMatchDetailResponse>(`/api/match-center/team/matches/${matchId}`);

/**
 * PUT /api/match-center/team/matches/:matchId/plan
 *
 * Sunucu doğrulaması: diziliş geçerli olmalı, forma renkleri #RRGGBB,
 * kadro 1-20 oyuncu, forma numaraları benzersiz, aynı oyuncu iki kez olamaz,
 * en fazla bir kaptan.
 */
export const saveTeamMatchPlan = (
  matchId: number,
  body: {
    formation: string;
    kitColor: string;
    kitSecondaryColor?: string;
    goalMusicUrl?: string;
    tactics?: string;
    lineup: MatchPlanPlayer[];
  }
) => put<{ message: string; plan: MatchPlan }>(`/api/match-center/team/matches/${matchId}/plan`, body);

/** POST .../guest-players — kadroya takımsız misafir oyuncu ekler. */
export const createGuestPlayer = (matchId: number, body: { name: string; position?: string }) =>
  post<{ message: string; player: { id: number; player_name: string } }>(
    `/api/match-center/team/matches/${matchId}/guest-players`,
    body
  );

/**
 * Diziliş sözlüğü — sunucudaki constants/formations.js ile BİREBİR aynı.
 * Ayrışırsa başkan burada seçtiği dizilişte 400 INVALID_FORMATION alır.
 * Saha düzeni 8 kişiliktir (1 kaleci + 7 saha oyuncusu).
 */
export const FORMATIONS: Record<string, string[]> = {
  "3-3-1": ["GK", "DEF1", "DEF2", "DEF3", "MID1", "MID2", "MID3", "FWD1"],
  "3-2-2": ["GK", "DEF1", "DEF2", "DEF3", "MID1", "MID2", "FWD1", "FWD2"],
  "2-3-2": ["GK", "DEF1", "DEF2", "MID1", "MID2", "MID3", "FWD1", "FWD2"],
  "2-2-3": ["GK", "DEF1", "DEF2", "MID1", "MID2", "FWD1", "FWD2", "FWD3"],
  "3-1-3": ["GK", "DEF1", "DEF2", "DEF3", "MID1", "FWD1", "FWD2", "FWD3"],
  "2-4-1": ["GK", "DEF1", "DEF2", "MID1", "MID2", "MID3", "MID4", "FWD1"],
  "4-2-1": ["GK", "DEF1", "DEF2", "DEF3", "DEF4", "MID1", "MID2", "FWD1"],
  "4-1-2": ["GK", "DEF1", "DEF2", "DEF3", "DEF4", "MID1", "FWD1", "FWD2"],
  "1-3-3": ["GK", "DEF1", "MID1", "MID2", "MID3", "FWD1", "FWD2", "FWD3"],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = "3-3-1";
/** Sahaya çıkabilecek en fazla oyuncu (kaleci dahil). */
export const MAX_STARTERS = 8;
