import { del, get, patch, post, put } from "../../http";
import type { AccountRequest } from "../playerProfile";

/**
 * ÜYE PANELİ — OYUNCU KAPSAMI (web: PlayerTeamPanel `player` menüsü).
 *
 * NE: web üye panelinin oyuncu tarafında olup mobilde karşılığı olmayan
 * uçlar. Her biri elitlig-client'taki çağrıyla ve elitlig-server rotasıyla
 * birebir doğrulandı; uydurma uç yok:
 *
 *   GET    /api/panel/me/overview?scope=player   özet (form, piyasa değeri, sözleşme, puan durumu)
 *                                                 routes/panel.js → services/panelOverviewService.js
 *   GET    /api/panel/me/sponsors?scope=player   sponsorluk alanları (3 slot)
 *   PUT    /api/panel/me/sponsors/:i?scope=player   alanı güncelle (onaylı talep, premium şart)
 *   POST   /api/panel/me/sponsors/:i/image?scope=player   görsel (onaylı talep, premium şart)
 *   DELETE /api/panel/me/sponsors/:i?scope=player   alanı temizle (onaylı talep)
 *   PATCH  /api/users/me/profile-type            profil modu (oyuncu | takim_baskani | double)
 *   POST   /api/users/request-player-unlink      "Bu oyuncu ben değilim"
 *   DELETE /api/users/account-requests/:id       bekleyen talebi geri çek
 *   GET    /api/match-center/matches/:id/my-review   maç değerlendirmem
 *   PUT    /api/match-center/matches/:id/review      maç değerlendirmesi (kadrodaysan)
 *
 * NEDEN AYRI KLASÖR: `lib/api/panel.ts`, `team.ts` başka ekranların ortak
 * dosyaları; oyuncu tarafının eksikleri onlara dokunmadan burada toplanır.
 */

/* ══════════════════════════════ ÖZET ══════════════════════════════ */

export type FormLetter = "W" | "D" | "L";

export interface OverviewRecentRow {
  match_id: number;
  date: string;
  opponent: string | null;
  score: string;
  result: FormLetter;
  goals: number;
  assists: number;
  rating: number | null;
  started: boolean;
}

export interface OverviewFixture {
  id: number;
  date: string;
  time: string | null;
  field: string | null;
  is_home: boolean;
  opponent: string | null;
  opponent_team_id: number | null;
  score: string;
  result: FormLetter;
  status: string | null;
}

export interface OverviewStanding {
  position: number | null;
  team_count: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  last5: string;
}

export interface PlayerOverview {
  scope: "player";
  linked: boolean;
  player?: {
    id: number;
    name: string;
    image: string | null;
    position: string | null;
    city: string | null;
    nationality: string | null;
    birth_date: string | null;
  };
  team?: { id: number; name: string; logo: string | null; league: string | null; season: string | null } | null;
  season?: { id: number | null; name: string | null };
  totals?: {
    matches: number;
    starts: number;
    goals: number;
    assists: number;
    contributions: number;
    yellow_cards: number;
    red_cards: number;
    rating: number | null;
  };
  per_match?: { goals: number; assists: number; contributions: number; start_ratio: number };
  recent_form?: OverviewRecentRow[];
  next_match?: OverviewFixture | null;
  team_form?: OverviewFixture[];
  standings?: OverviewStanding | null;
  market_value?: { current: number; currency: string } | null;
  contracts?: { total: number; active: { status: string; start: string | null; end: string | null } | null };
  offers?: { active: number };
  discipline?: { total: number; open: number; pending_reviews: number };
}

export const getPlayerOverview = () =>
  get<PlayerOverview>("/api/panel/me/overview", { scope: "player" }, { retry: false });

/** Önbellek anahtarları — iki ekran aynı veriyi ikinci kez istemesin. */
export const memberKeys = {
  overview: ["panel", "overview", "player"] as const,
  sponsors: ["panel", "sponsors", "player"] as const,
  accountRequests: ["account-requests"] as const,
  review: (matchId: number) => ["panel", "my-review", matchId] as const,
};

/* ═════════════════════════ /api/panel/me ek alanları ═════════════════════════ */

/**
 * `lib/api/panel.ts` → `PanelMeResponse` bu alanları tanımlamıyor ama sunucu
 * (routes/panel.js GET /me) gönderiyor. Ortak dosyaya dokunmamak için oyuncu
 * ekranları yanıtı bu tiple genişletip okur.
 */
export interface PanelMeExtras {
  profileType?: string | null;
  profileScopes?: { player: boolean; team: boolean } | null;
  capabilities?: { team: boolean; player: boolean };
  membership?: { player?: { available: boolean; isPremium: boolean }; team?: { available: boolean; isPremium: boolean } };
  stats?: { scope?: "season" | "career" | "none"; season?: string | null } | null;
}

/* ══════════════════════════ PROFİL MODU ══════════════════════════ */

export type ProfileType = "oyuncu" | "takim_baskani" | "double";

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  oyuncu: "Oyuncu",
  takim_baskani: "Takım Başkanı",
  double: "Oyuncu + Takım Başkanı",
};

export const scopesForProfileType = (type: string | null | undefined) => ({
  player: type === "oyuncu" || type === "double",
  team: type === "takim_baskani" || type === "double",
});

export const profileTypeFromScopes = ({ player, team }: { player: boolean; team: boolean }): ProfileType =>
  player && team ? "double" : team ? "takim_baskani" : "oyuncu";

/**
 * Web `resolveProfileType` ile aynı kural (sunucudaki resolveProfileType'ın
 * yedeği): kayıtlı tip yoksa bağlantılardan türetilir; yönetilen takım
 * varken takım kapsamı her koşulda açık kalır.
 */
export function resolveProfileType(source: {
  profile_type?: string | null;
  player_id?: number | null;
  managed_team_id?: number | null;
}): ProfileType {
  const raw = source.profile_type;
  const stored = raw === "oyuncu" || raw === "takim_baskani" || raw === "double" ? raw : null;
  const hasPlayer = Boolean(source.player_id);
  const hasTeam = Boolean(source.managed_team_id);
  const type = stored ?? profileTypeFromScopes({ player: hasPlayer, team: hasTeam });
  if (hasTeam && !scopesForProfileType(type).team) return hasPlayer ? "double" : "takim_baskani";
  return type;
}

export const updateProfileType = (profileType: ProfileType) =>
  patch<{ message: string; user?: Record<string, unknown> }>("/api/users/me/profile-type", { profileType });

/* ══════════════════════════ TALEPLER ══════════════════════════ */

/** Web REQUEST_TYPE_LABELS ile aynı sözlük. */
export const REQUEST_TYPE_LABELS: Record<string, string> = {
  player_claim: "Oyuncu profilini sahiplenme",
  player_create: "Yeni oyuncu profili",
  player_unlink: "Oyuncu bağlantısını koparma",
  team_management: "Takım yönetimi yetkisi",
  team_create: "Yeni takım",
  team_resign: "Takımdan istifa",
  team_transfer: "Takımı devretme",
};

export const REQUEST_STATUS: Record<string, { label: string; tone: "warn" | "win" | "danger" | "neutral" }> = {
  pending: { label: "Onay bekliyor", tone: "warn" },
  approved: { label: "Onaylandı", tone: "win" },
  rejected: { label: "Reddedildi", tone: "danger" },
  cancelled: { label: "Geri çekildi", tone: "neutral" },
};

/** Sunucu listeyi `{ requests }` olarak döndürür; eski biçimler de okunur. */
export function accountRequestList(
  data: AccountRequest[] | { requests?: AccountRequest[]; accountRequests?: AccountRequest[] } | undefined,
): (AccountRequest & { adminNote?: string | null; admin_note?: string | null; reviewNote?: string | null; created_at?: string })[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.requests ?? data.accountRequests ?? [];
}

export const requestPlayerUnlink = (note?: string) =>
  post<{ message: string; request?: AccountRequest }>("/api/users/request-player-unlink", note ? { note } : {});

export const cancelAccountRequest = (id: number) =>
  del<{ message: string }>(`/api/users/account-requests/${id}`);

/* ══════════════════════════ SPONSORLUK ══════════════════════════ */

export interface SponsorSlot {
  slot_index: number;
  sponsor_name: string | null;
  placement: string | null;
  image_url: string | null;
  link_url: string | null;
  active: boolean;
}

export interface SponsorsResponse {
  scope: "player" | "team";
  sponsors: SponsorSlot[];
  slotCount: number;
  isPremium: boolean;
}

/** elitlig-client constants/membership.js SPONSOR_PLACEMENTS ile aynı. */
export const SPONSOR_PLACEMENTS: { value: string; label: string }[] = [
  { value: "header", label: "Sayfa üstü" },
  { value: "hero", label: "Profil kartı" },
  { value: "sidebar", label: "Yan panel" },
  { value: "footer", label: "Sayfa altı" },
  { value: "jersey", label: "Forma sponsoru" },
];

export const getMySponsors = () =>
  get<SponsorsResponse>("/api/panel/me/sponsors", { scope: "player" }, { retry: false });

export const saveSponsor = (
  index: number,
  body: { sponsor_name: string | null; placement: string | null; link_url: string | null; active: boolean },
) => put<{ message: string }>(`/api/panel/me/sponsors/${index}?scope=player`, body);

export const clearSponsor = (index: number) =>
  del<{ message: string }>(`/api/panel/me/sponsors/${index}?scope=player`);

export function uploadSponsorImage(index: number, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır.
  form.append("image", file as unknown as Blob);
  return post<{ message: string }>(`/api/panel/me/sponsors/${index}/image?scope=player`, form, { timeout: 120_000 });
}

/* ══════════════════════════ MAÇ DEĞERLENDİRMESİ ══════════════════════════ */

/** Web MatchCenter REVIEW_FIELDS — sunucu altı alanın hepsini 1–10 ister. */
export const REVIEW_FIELDS = [
  { key: "announcer_score", label: "Spiker", icon: "mic" },
  { key: "director_score", label: "Reji", icon: "videocam" },
  { key: "referee_score", label: "Hakem", icon: "flag" },
  { key: "photographer_score", label: "Fotoğrafçı", icon: "camera" },
  { key: "medic_score", label: "Sağlıkçı", icon: "medkit" },
  { key: "opponent_score", label: "Rakip takım", icon: "people" },
] as const;

export type ReviewKey = (typeof REVIEW_FIELDS)[number]["key"];
export type ReviewScores = Record<ReviewKey, number>;

export const getMyReview = (matchId: number) =>
  get<{ review: (Partial<ReviewScores> & { comment?: string | null }) | null }>(
    `/api/match-center/matches/${matchId}/my-review`,
    undefined,
    { retry: false },
  );

export const saveMyReview = (matchId: number, scores: ReviewScores, comment: string) =>
  put<{ message: string }>(`/api/match-center/matches/${matchId}/review`, { ...scores, comment });
