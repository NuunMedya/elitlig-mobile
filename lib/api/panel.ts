import { get } from "../http";

/**
 * Panel uçları — routes/panel.js (girişli üyenin kendi verileri).
 *
 * Tek çağrılık açılış ucu /api/panel/me kullanılır; alan adları sunucu
 * dökümünden birebir alınmıştır. Panel rolü olmayan hesaplarda sunucu
 * 403 PANEL_FORBIDDEN döndürür — ekran bu durumu nazikçe karşılar.
 */

export interface PanelPlayer {
  id: number;
  player_name: string;
  player_img: string | null;
  player_position: string | null;
  nationality: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  city_id: number | null;
  team_id: number | null;
  active: boolean;
}

export interface PanelTeam {
  id: number;
  team_name: string;
  logo: string | null;
  city: string | null;
  city_id: number | null;
  current_league?: string | null;
  current_season?: string | null;
}

export interface PanelStats {
  matches: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  rating: number | null;
  starts: number;
  season?: string | null;
}

export interface PanelRecentMatch {
  id: number;
  date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
}

export interface PanelMessage {
  id: number;
  sender: string;
  subject: string;
  preview: string;
  read: boolean;
  created_at: string;
}

export interface PanelPendingChange {
  id: number;
  type: string;
  target_type: string;
  status: string;
  created_at: string;
}

export interface PanelOnboardingState {
  state?: string;
  title?: string;
  description?: string;
}

export interface PanelMeResponse {
  player: PanelPlayer | null;
  team: PanelTeam | null;
  playerTeam: PanelTeam | null;
  stats: PanelStats | null;
  recentMatches: PanelRecentMatch[];
  messages: PanelMessage[];
  pendingChanges: PanelPendingChange[];
  profileType?: string | null;
  onboarding?: { player?: PanelOnboardingState; team?: PanelOnboardingState };
}

export const getPanelMe = () => get<PanelMeResponse>("/api/panel/me");

/**
 * Maçlarım — routes/matchCenter.js.
 *
 * Oyuncu, takımının tüm maçlarını görür; in_squad kadroda olup olmadığını
 * söyler. upcoming/past ayrımı saate değil maç durumuna bakar. Oyuncu
 * profili bağlı değilse sunucu 403 PLAYER_PROFILE_REQUIRED döndürür.
 */

export interface MyMatch {
  id: number;
  date: string;
  time: string | null;
  first_team_name: string;
  second_team_name: string;
  first_team_score: number | null;
  second_team_score: number | null;
  match_field?: string | null;
  is_home: boolean;
  opponent_team_id: number | null;
  opponent_name: string | null;
  in_squad: boolean;
  can_review: boolean;
}

export interface MyMatchesResponse {
  upcoming: MyMatch[];
  past: MyMatch[];
  player_id: number;
}

export const getMyMatches = () => get<MyMatchesResponse>("/api/match-center/matches");

/**
 * Transfer teklifleri — routes/transferOffers.js.
 *
 * :offerId sayısal id değil public_id (UUID). Her aksiyon gövdesinde
 * teklifin güncel sürümü (expectedVersion) zorunludur; uyuşmazsa sunucu
 * 409 TRANSFER_OFFER_VERSION_CONFLICT döndürür ve teklif yeniden yüklenir.
 */

import { post } from "../http";

export interface Paged<T> {
  items: T[];
  page: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface OfferTeam {
  id: number;
  team_name: string;
  logo: string | null;
}

export interface TransferOffer {
  public_id: string;
  status: string;
  sent_at: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  version: number;
  current_version?: number;
  requires_admin_approval?: boolean;
  admin_status?: string | null;
  awaiting_admin_approval?: boolean;
  team?: OfferTeam;
  actions?: {
    accept?: boolean;
    reject?: boolean;
    requestRevision?: boolean;
  };
  contract?: { public_id: string; status: string } | null;
}

export const getOfferInbox = (page = 1) =>
  get<Paged<TransferOffer>>("/api/transfer-offers/inbox", { page, limit: 50 });

export const getOffer = (offerId: string) =>
  get<{ offer: TransferOffer }>(`/api/transfer-offers/${offerId}`);

export const acceptOffer = (offerId: string, expectedVersion: number) =>
  post<{ contract: { public_id: string; status: string } }>(
    `/api/transfer-offers/${offerId}/accept`,
    { expectedVersion }
  );

export const rejectOffer = (offerId: string, expectedVersion: number, reason: string) =>
  post<{ message?: string }>(`/api/transfer-offers/${offerId}/reject`, {
    expectedVersion,
    reason,
  });

/** Sözleşmeler — routes/contracts.js. scope=player şart (double rolü tuzağı). */

export interface Contract {
  public_id: string;
  status: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
  player?: { id: number; player_name: string; player_img: string | null };
  team?: OfferTeam;
}

export const getMyContracts = (page = 1) =>
  get<Paged<Contract>>("/api/contracts", { scope: "player", page, limit: 50 });

/**
 * Cezalar ve savunmalar — routes/penalties.js.
 *
 * Savunma sevkten sonra 24 saat, itiraz kurul kararından sonra 1 hafta
 * içinde gönderilebilir. side alanı uydurulmaz; kaydın viewer_side /
 * available_sides değerinden alınır (üye hem oyuncu hem yetkili olabilir).
 */

export interface PenaltyEvent {
  id: number;
  event_type: string;
  status_label: string | null;
  title: string | null;
  description: string | null;
  createdAt: string;
  is_submission?: boolean;
  review_status_label?: string | null;
}

export interface Penalty {
  public_id: string;
  status: string;
  status_label: string;
  match_label: string | null;
  match_date: string | null;
  player_name: string | null;
  team_name: string | null;
  disiplin_karari: string | null;
  duration_type: string | null;
  match_count: number | null;
  ban_start_at: string | null;
  ban_end_at: string | null;
  defense_deadline_at: string | null;
  objection_deadline_at: string | null;
  ban_state: string | null;
  events: PenaltyEvent[];
  available_sides: string[];
  viewer_side: string | null;
  is_own_penalty: boolean;
}

export const getMyPenalties = () => get<{ items: Penalty[] }>("/api/penalties/mine");

export const submitDefense = (publicId: string, text: string, side: string) =>
  post<{ message: string }>(`/api/penalties/${publicId}/defense`, { text, side });

export const submitObjection = (publicId: string, text: string, side: string) =>
  post<{ message: string }>(`/api/penalties/${publicId}/objection`, { text, side });

/**
 * Mesajlar — panel başvuru sistemi (thread'li).
 *
 * categories/statuses/priorities sözlükleri yanıtla gelir; ekranda sabit
 * Türkçe yazılmaz, bu sözlüklerden okunur (sunucu dökümündeki uyarı).
 */

export interface PanelThreadMessage {
  id: number;
  thread_id: number;
  direction: string;
  sender: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface PanelThread {
  id: number;
  subject: string;
  category_label: string;
  status: string;
  status_label: string;
  last_message_at: string;
  last_message_preview: string;
  unread: number;
  messages: PanelThreadMessage[];
}

export interface PanelMessagesResponse {
  threads: PanelThread[];
  unread: number;
  categories: Record<string, string>;
  statuses: Record<string, string>;
}

export const getMyMessages = () => get<PanelMessagesResponse>("/api/panel/me/messages");

export const sendPanelMessage = (subject: string, body: string, category: string) =>
  post<{ item: unknown }>("/api/panel/me/messages", { subject, body, category });

export const replyPanelThread = (threadId: number, body: string) =>
  post<{ item: unknown }>(`/api/panel/me/messages/${threadId}/reply`, { body });
