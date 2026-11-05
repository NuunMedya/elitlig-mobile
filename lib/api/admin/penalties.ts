import { get, patch, post } from "../../http";

/**
 * Disiplin (ceza) yönetim uçları — elitlig-server routes/penalties.js +
 * services/penalty/index.js. Web karşılığı: src/api/penaltyApi.js.
 *
 *   GET   /api/penalties                       liste (?status=&city_id=&league_id=&season_id=)
 *   POST  /api/penalties                       yeni sevk
 *   GET   /api/penalties/:publicId             detay + süreç (savunma/itiraz dahil)
 *   PATCH /api/penalties/:publicId             aşama / karar / süre güncelle (penalties.update)
 *   GET   /api/penalties/admin/matches         sevk için maç listesi
 *   GET   /api/penalties/admin/matches/:id/players  maç kadrosundaki oyuncular
 *   GET   /api/penalties/admin/submissions     savunma / itiraz kutusu (penalties.review)
 *   POST  /api/penalties/admin/submissions/:eventId/review  başvuruyu sonuçlandır
 *
 * Sunucuda ceza SİLME / İPTAL ucu yoktur; dosya aşama ve karar güncellemesiyle
 * yönetilir (bkz. rapor).
 */

/* ===================== Türkçe sözlükler ===================== */

export type PenaltyStatus = "sevk" | "kurul_karari" | "cas_basvuru" | "cas_karari";
export type DurationType = "mac" | "suresiz";
export type ReviewStatus = "pending" | "accepted" | "rejected" | "noted";
export type SubmissionType = "defense" | "objection";

/** constants/penalty.js PENALTY_STATUS_LABELS ile birebir. */
export const PENALTY_STATUS_LABELS: Record<PenaltyStatus, string> = {
  sevk: "Merkez Disiplin Kuruluna Sevk Edildi",
  kurul_karari: "Merkez Disiplin Kurulu Kararı",
  cas_basvuru: "CAS'a Başvuruldu, Değerlendirme Aşamasında",
  cas_karari: "Elitlig CAS Kararı",
};

/** Liste çipleri için kısa adlar. */
export const PENALTY_STATUS_SHORT: Record<PenaltyStatus, string> = {
  sevk: "Sevk",
  kurul_karari: "Kurul kararı",
  cas_basvuru: "CAS başvurusu",
  cas_karari: "CAS kararı",
};

export const PENALTY_STATUS_ORDER: PenaltyStatus[] = ["sevk", "kurul_karari", "cas_basvuru", "cas_karari"];

/** Web PenaltyCreate STAGE_DESCRIPTIONS. */
export const PENALTY_STAGE_HINTS: Record<PenaltyStatus, string> = {
  sevk: "Oyuncu merkez disiplin kuruluna sevk edilir. Ek bilgi girmeden kaydedebilirsin.",
  kurul_karari: "Kurul kararı açıklandı. Ceza süresi ve disiplin kararı metni girilebilir.",
  cas_basvuru: "Karara itiraz edildi; dosya CAS değerlendirme aşamasında.",
  cas_karari: "CAS sonucu son karar. Ceza süresi ve gerekçe girilebilir.",
};

export const DURATION_LABELS: Record<DurationType, string> = {
  mac: "Maç men cezası",
  suresiz: "Süresiz ihraç",
};

export const DURATION_HINTS: Record<DurationType, string> = {
  mac: "Takım o kadar maç oynayana kadar ya da maç sayısının 2 katı hafta geçene kadar cezalı olur.",
  suresiz: "Süresiz olarak ihraç edilir (2 takvim yılı).",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Değerlendirme bekliyor",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  noted: "Dikkate alındı",
};

export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  defense: "Savunma",
  objection: "İtiraz (CAS)",
};

export const SIDE_LABELS: Record<string, string> = { player: "Oyuncu", team: "Takım", admin: "Disiplin Kurulu", system: "Sistem" };

/** Web DefenseInbox DECISIONS. */
export const REVIEW_DECISIONS: { value: Exclude<ReviewStatus, "pending">; label: string; hint: string }[] = [
  { value: "accepted", label: "Savunmayı kabul et", hint: "Başvuru haklı bulundu; ceza kaldırılacak ya da hafifletilecek." },
  { value: "rejected", label: "Savunmayı reddet", hint: "Başvuru yeterli görülmedi; ceza aynen uygulanır." },
  { value: "noted", label: "Dikkate al", hint: "Başvuru kayda geçti; karar ilerideki aşamada verilecek." },
];

/** Sunucu hata kodlarının Türkçesi (web mapPenaltyError). */
export const PENALTY_ERROR_TEXT: Record<string, string> = {
  PLAYER_REQUIRED: "Cezalandırılacak oyuncu seçilmelidir.",
  PLAYER_NOT_FOUND: "Oyuncu bulunamadı.",
  PENALTY_NOT_FOUND: "Ceza kaydı bulunamadı.",
  INVALID_STATUS: "Geçersiz ceza durumu.",
  INVALID_DURATION: "Geçersiz ceza süresi türü.",
  SUBMISSION_NOT_FOUND: "Savunma kaydı bulunamadı.",
  INVALID_REVIEW_STATUS: "Geçersiz değerlendirme sonucu.",
};

/* ===================== tipler ===================== */

export interface BanState {
  duration_type: DurationType | null;
  active: boolean | null;
  summary?: string;
  matches_required?: number;
  matches_played?: number;
  matches_remaining?: number;
  ban_start_at?: string | null;
  ban_end_at?: string | null;
}

/** services/penalty serializeEvent. */
export interface PenaltyEvent {
  id: number;
  event_type: string;
  status: PenaltyStatus | null;
  status_label: string | null;
  title: string | null;
  description: string | null;
  disiplin_karari: string | null;
  duration_type: DurationType | null;
  match_count: number | null;
  actor_side: string | null;
  createdAt: string;
  is_submission: boolean;
  submitted_by_side: string | null;
  review_status: ReviewStatus | null;
  review_status_label: string | null;
  review_note: string | null;
  reviewed_at: string | null;
}

/** services/penalty serializePenalty. */
export interface Penalty {
  public_id: string;
  status: PenaltyStatus;
  status_label: string;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  match_id: number | null;
  match_label: string | null;
  match_date: string | null;
  player_id: number | null;
  player_name: string | null;
  player_img: string | null;
  team_id: number | null;
  team_name: string | null;
  duration_type: DurationType | null;
  match_count: number | null;
  disiplin_karari: string | null;
  ban_start_at: string | null;
  ban_end_at: string | null;
  defense_deadline_at: string | null;
  objection_deadline_at: string | null;
  ban_state: BanState | null;
  createdAt: string;
  updatedAt: string;
  submission_summary?: { total: number; pending: number; last_submitted_at: string | null };
  events?: PenaltyEvent[];
}

export interface PenaltySubmission extends PenaltyEvent {
  penalty: Penalty | null;
}

export interface PenaltyMatch {
  id: number;
  label: string;
  first_team_name: string;
  second_team_name: string;
  home_team_id: number | null;
  away_team_id: number | null;
  date: string | null;
  status: string | null;
}

export interface PenaltyMatchPlayer {
  player_id: number;
  player_name: string;
  player_img: string | null;
  player_position: string | null;
  team_id: number | null;
  team_name: string | null;
}

export interface PenaltyListParams {
  status?: PenaltyStatus | "";
  city_id?: number | null;
  league_id?: number | null;
  season_id?: number | null;
  limit?: number;
}

export interface PenaltyUpdate {
  status?: PenaltyStatus;
  duration_type?: DurationType;
  match_count?: number;
  disiplin_karari?: string | null;
  note?: string;
}

export interface PenaltyCreate {
  city_id: number;
  league_id: number;
  season_id: number;
  match_id: number | null;
  match_label: string | null;
  player_id: number;
  team_id: number | null;
  team_name: string | null;
  disiplin_karari: string | null;
}

/* ===================== uçlar ===================== */

const enc = (value: string | number) => encodeURIComponent(String(value));

export const listPenalties = (params: PenaltyListParams = {}) =>
  get<{ items: Penalty[] }>("/api/penalties", { ...params, limit: params.limit ?? 500 }).then((d) => d.items ?? []);

export const getPenalty = (publicId: string) =>
  get<{ penalty: Penalty }>(`/api/penalties/${enc(publicId)}`).then((d) => d.penalty);

export const createPenalty = (body: PenaltyCreate) =>
  post<{ penalty: Penalty }>("/api/penalties", body).then((d) => d.penalty);

export const updatePenalty = (publicId: string, body: PenaltyUpdate) =>
  patch<{ penalty: Penalty }>(`/api/penalties/${enc(publicId)}`, body).then((d) => d.penalty);

export const listPenaltyMatches = (scope: { city_id: number; league_id: number; season_id: number }) =>
  get<{ matches: PenaltyMatch[] }>("/api/penalties/admin/matches", scope).then((d) => d.matches ?? []);

export const listPenaltyMatchPlayers = (matchId: number) =>
  get<{ players: PenaltyMatchPlayer[] }>(`/api/penalties/admin/matches/${enc(matchId)}/players`).then((d) => d.players ?? []);

export const listSubmissions = (params: { review_status?: ReviewStatus | ""; type?: SubmissionType | "" } = {}) =>
  get<{ items: PenaltySubmission[] }>("/api/penalties/admin/submissions", params).then((d) => d.items ?? []);

export const reviewSubmission = (
  eventId: number,
  body: { review_status: Exclude<ReviewStatus, "pending">; review_note?: string | null; penalty?: PenaltyUpdate }
) => post<{ penalty: Penalty; message?: string }>(`/api/penalties/admin/submissions/${enc(eventId)}/review`, body);

/* ===================== yardımcılar ===================== */

/** Kart altındaki tek cümle (web formatBanSummary). */
export function banSummary(penalty: Pick<Penalty, "ban_state"> | null | undefined): string {
  const state = penalty?.ban_state;
  if (!state || !state.duration_type) return "Ceza süresi henüz belirlenmedi.";
  return state.summary || "";
}

/** Süre özeti: "3 maç men" / "Süresiz ihraç" / "Belirlenmedi". */
export function durationText(penalty: Pick<Penalty, "duration_type" | "match_count">): string {
  if (penalty.duration_type === "suresiz") return "Süresiz ihraç";
  if (penalty.duration_type === "mac") return `${penalty.match_count ?? 1} maç men`;
  return "Belirlenmedi";
}

/**
 * Süreci "4 durum" görünümüne indirger (web collapsePenaltyEvents): aynı
 * durumdaki karar güncellemeleri o durumun tek kaydında EN SON hâliyle durur.
 */
export function collapseEvents(events: PenaltyEvent[] = []): PenaltyEvent[] {
  const sorted = [...events].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const out: PenaltyEvent[] = [];
  let lastIndex = -1;
  let lastStatus: string | null = null;
  for (const event of sorted) {
    const isState = event.event_type === "created" || event.event_type === "status_change" || event.event_type === "decision_update";
    if (event.event_type === "decision_update" && lastIndex >= 0 && lastStatus === event.status) {
      const prev = out[lastIndex];
      out[lastIndex] = {
        ...prev,
        duration_type: event.duration_type ?? prev.duration_type,
        match_count: event.match_count ?? prev.match_count,
        disiplin_karari: event.disiplin_karari ?? prev.disiplin_karari,
        description: event.description ?? prev.description,
        createdAt: event.createdAt,
      };
      continue;
    }
    out.push({ ...event });
    if (isState) {
      lastIndex = out.length - 1;
      lastStatus = event.status;
    }
  }
  return out;
}
