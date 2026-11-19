import { get, patch, post } from "../http";

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
  founded_at?: string | null;
  colors?: string | null;
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
    /** Takım tarafı: oyuncu revizyon istediğinde yeni sürüm gönder. */
    revise?: boolean;
    /** Takım tarafı: cevap beklenirken teklifi geri çek. */
    withdraw?: boolean;
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
 * Takım itirazları — ceza dosyasından bağımsız başvurular (maç sonucu, hakem
 * kararı, oyuncu uygunluğu…). Takım yetkilisi açar, disiplin kurulu
 * sonuçlandırır. Konu başlığı ve gerekçe yalnız takım ve kurulca görülür;
 * kurulun kararı herkese açık disiplin sayfasında duyurulur.
 * Sözlükler sunucudaki constants/penalty.js ile birebir.
 */
export type AppealStatus = "pending" | "in_review" | "accepted" | "partially_accepted" | "rejected";
export type AppealCategory =
  | "rule_error"
  | "referee_error"
  | "ineligible_player"
  | "suspended_player"
  | "unlicensed_player"
  | "match_result"
  | "forfeit"
  | "unsporting"
  | "organization"
  | "schedule"
  | "other";

export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  pending: "Değerlendirme bekliyor",
  // Başvurunun kararı yoktur; iki sonuç vardır. accepted / partially_accepted
  // eski sunucu yanıtlarından kalmadır.
  in_review: "İnceleme başlatıldı",
  accepted: "İnceleme başlatıldı",
  partially_accepted: "İnceleme başlatıldı",
  rejected: "Değerlendirmeye alınmadı",
};

/**
 * İtiraz nedeni (sunucudaki constants/penalty.js ile birebir). Herkese açık
 * disiplin sayfasında başvurunun yalnızca bu nedeni görünür.
 */
export const APPEAL_CATEGORIES: { key: AppealCategory; label: string }[] = [
  { key: "rule_error", label: "Kural hatası itirazı" },
  { key: "referee_error", label: "Hakem hatası itirazı" },
  { key: "ineligible_player", label: "Kural dışı oyuncu oynatılması" },
  { key: "suspended_player", label: "Cezalı oyuncu oynatılması" },
  { key: "unlicensed_player", label: "Lisanssız / kadroda olmayan oyuncu oynatılması" },
  { key: "match_result", label: "Maç sonucu / skor tesciline itiraz" },
  { key: "forfeit", label: "Hükmen karara itiraz" },
  { key: "unsporting", label: "Sportmenlik dışı davranış / saha olayları" },
  { key: "organization", label: "Saha, ekipman ve organizasyon" },
  { key: "schedule", label: "Maç tarihi / erteleme kararına itiraz" },
  { key: "other", label: "Diğer" },
];

/** Sonucun kime duyurulacağı (kurul karar verirken seçer). */
export type AppealVisibility = "team" | "teams" | "public";
export const APPEAL_VISIBILITY_LABELS: Record<AppealVisibility, string> = {
  team: "Yalnızca itiraz eden takım",
  teams: "Yalnızca ilgili takımlar",
  public: "Herkese açık",
};

/** İtiraz eki: bağlantı ya da yüklenmiş dosya. */
export interface AppealAttachment {
  type: "link" | "image" | "video" | "document";
  url: string;
  name: string | null;
}
export const APPEAL_ATTACHMENT_LIMIT = 10;

export interface Appeal {
  public_id: string;
  city_id: number | null;
  league_id?: number | null;
  season_id?: number | null;
  /** team: takım gönderdi · admin: kurul elle kaydetti (yalnız özel görünümde). */
  source?: "team" | "admin";
  /** Başvuru üzerine açılan ceza dosyası (yalnız kurul görünümünde). */
  linked_penalty_public_id?: string | null;
  /** Kurul başvuruyu arşive aldı (yalnız kurul görünümünde). */
  is_archived?: boolean;
  /** Başvuruda adı geçen oyuncu (varsa). */
  player_id?: number | null;
  player_name?: string | null;
  /** Bu başvurudan başlatılan süreçler (yalnız kurul görünümünde). */
  processes?: AppealProcess[];
  team_id: number;
  team_name: string | null;
  match_id: number | null;
  match_label: string | null;
  match_date: string | null;
  category: AppealCategory;
  category_label: string;
  status: AppealStatus;
  status_label: string;
  is_decided: boolean;
  decision_text: string | null;
  decided_at: string | null;
  createdAt: string;
  opponent_team_name?: string | null;
  visibility?: AppealVisibility;
  /** Karar herkese açık yayımlandı mı (disiplin sayfası + haberler). */
  is_published?: boolean;
  /** false: takım bu itirazda RAKİP; yalnız karar görünür. */
  is_own?: boolean;
  /** Yalnız başvuran takım ve kurul görünümünde döner. */
  subject?: string;
  description?: string;
  attachments?: AppealAttachment[];
}

/** Başvurudan başlatılan süreç: oyuncu sevki, maç ya da konu incelemesi. */
export interface AppealProcess {
  type: "player" | "match" | "topic";
  public_id: string;
  title: string;
  status_label: string;
  is_decided: boolean;
  createdAt: string;
}

/** Başvuruda "ilgili oyuncu" seçimi: maçın iki takımının kadrosu. */
export interface AppealPlayer {
  player_id: number;
  player_name: string;
  team_name: string | null;
}

/**
 * İnceleme: oyuncu sevki dışındaki disiplin süreçleri (maç / konu).
 * Açılış açıklaması ve karar herkese açıktır.
 */
export type InquiryStatus = "open" | "interim" | "objected" | "decided";
export const INQUIRY_STAGES: { key: InquiryStatus; label: string }[] = [
  { key: "open", label: "İnceleme" },
  { key: "interim", label: "Disiplin Kurulu kararı" },
  { key: "objected", label: "İtiraz" },
  { key: "decided", label: "CAS kararı" },
];

/** Sürecin (oyuncu dosyası / inceleme) kime açık yürütüldüğü. */
export type ProcessVisibility = "public" | "teams" | "team";
export const PROCESS_VISIBILITY_OPTIONS: { value: ProcessVisibility; label: string; hint: string }[] = [
  { value: "public", label: "Herkese açık", hint: "Disiplin sayfasında, duyurularda ve haberlerde yer alır." },
  { value: "teams", label: "Yalnızca ilgili taraflar", hint: "Genel kitleye kapalıdır; yalnızca taraflar ve başvuran takım görür." },
  { value: "team", label: "Yalnızca başvuran takım", hint: "Diğer taraflar süreci görmez; savunmalarını onlar adına kurul girebilir." },
];

export interface Inquiry {
  public_id: string;
  kind: "match" | "topic";
  kind_label: string;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  match_id: number | null;
  match_label: string | null;
  match_date: string | null;
  subject: string | null;
  subject_date: string | null;
  title: string;
  headline: string;
  description: string | null;
  /** inceleme → Disiplin Kurulu kararı → karara itiraz (CAS başvurusu) → CAS kararı */
  status: InquiryStatus;
  status_label: string;
  stage?: number;
  is_decided: boolean;
  /** Disiplin Kurulu kararı (açıklandıysa). */
  interim_text?: string | null;
  interim_at?: string | null;
  has_objection?: boolean;
  decision_text: string | null;
  decided_at: string | null;
  visibility?: ProcessVisibility;
  visibility_label?: string;
  createdAt: string;
  source_appeal_public_id?: string | null;
  /** Süreç bir başvurudan açıldı ("yalnızca başvuran takım" seçilebilir). */
  has_source_team?: boolean;
  /** Kurulun taraf adına kayıt girerken seçeceği liste. */
  parties?: { side: "team" | "player"; team_id: number | null; name: string; is_source: boolean }[];
  is_archived?: boolean;
  /** Taraflar ve savunmalar (yalnız kurul görünümünde). */
  party_team_names?: string[];
  party_player_name?: string | null;
  defenses?: InquiryDefense[];
  pending_defense_count?: number;
}

/** İncelemeye tarafın yazdığı savunma ve kurulun değerlendirmesi. */
export interface InquiryDefense {
  id: number;
  /** defense: savunma · objection: karara itiraz (CAS başvurusu) */
  kind?: "defense" | "objection";
  kind_label?: string;
  /** Kurul, taraf adına elle girdi. */
  entered_by_admin?: boolean;
  side: "team" | "player";
  team_name: string | null;
  player_name: string | null;
  text: string;
  review_status: "pending" | "accepted" | "rejected" | "noted";
  review_status_label: string;
  review_note: string | null;
  reviewed_at: string | null;
  createdAt: string;
}

/** Üyenin taraf olduğu inceleme: kendi savunmalarıyla. */
export interface MyInquiry extends Inquiry {
  viewer_side: "team" | "player";
  viewer_party_name: string | null;
  can_defend: boolean;
  /** CAS başvurusu (itiraz) edilebilir (Disiplin Kurulu kararından CAS kararına dek). */
  can_object?: boolean;
  my_defenses: InquiryDefense[];
}

export const getMyInquiries = () => get<{ items: MyInquiry[] }>("/api/penalties/inquiries/mine").then((d) => d.items ?? []);

export const submitInquiryDefense = (publicId: string, text: string) =>
  post<{ message: string }>(`/api/penalties/inquiries/${publicId}/defense`, { text });

/** CAS başvurusu (itiraz); itiraz üzerine verilen karar nihaidir. */
export const submitInquiryObjection = (publicId: string, text: string) =>
  post<{ message: string }>(`/api/penalties/inquiries/${publicId}/objection`, { text });

/** Herkese açık ceza dosyası (oyuncu sevki). */
export interface PublicPenalty {
  public_id: string;
  status: string;
  status_label: string;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  player_name: string | null;
  team_name: string | null;
  match_label: string | null;
  match_date: string | null;
  disiplin_karari: string | null;
  match_count: number | null;
  ban_state: { duration_type?: string | null; active?: boolean | null; matches_required?: number; matches_remaining?: number; summary?: string } | null;
  createdAt: string;
}

export const getPublicPenalties = (cityId: number) =>
  get<{ items: PublicPenalty[] }>("/api/penalties/public", { city_id: cityId }).then((d) => d.items ?? []);

export const getPublicInquiries = (cityId: number) =>
  get<{ items: Inquiry[] }>("/api/penalties/public/inquiries", { city_id: cityId }).then((d) => d.items ?? []);

export const getAppealMatchPlayers = (matchId: number) =>
  get<{ players: AppealPlayer[] }>(`/api/penalties/appeals/matches/${matchId}/players`).then((d) => d.players ?? []);

export interface AppealMatch {
  id: number;
  label: string;
  date: string | null;
}

/** Herkese açık başvuru: yalnız neden, taraflar ve aşama (metin ve ekler gelmez). */
export interface PublicAppeal {
  public_id: string;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  team_name: string | null;
  opponent_team_name: string | null;
  match_label: string | null;
  match_date: string | null;
  category: AppealCategory;
  category_label: string;
  /** Sonuç yayımlanmadıysa "decided" (kabul / ret bilgisi gizlidir). */
  status: AppealStatus | "decided";
  status_label: string;
  is_decided: boolean;
  decision_text: string | null;
  decided_at: string | null;
  createdAt: string;
}

export const getPublicAppeals = (cityId: number) =>
  get<{ items: PublicAppeal[] }>("/api/penalties/public/appeals", { city_id: cityId }).then((d) => d.items ?? []);

export const getMyAppeals = () => get<{ items: Appeal[]; can_submit: boolean }>("/api/penalties/appeals/mine");

export const getAppealMatches = () =>
  get<{ matches: AppealMatch[] }>("/api/penalties/appeals/matches").then((d) => d.matches ?? []);

/** İtiraza eklenecek fotoğraf / video / belge (≤25 MB); dönen adres başvuruyla gönderilir. */
export function uploadAppealFile(file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır.
  form.append("file", file as unknown as Blob);
  return post<{ url: string; name: string | null; mime: string | null; type: AppealAttachment["type"] }>("/api/penalties/appeals/uploads", form, {
    timeout: 180_000,
  });
}

export const createAppeal = (body: {
  category: AppealCategory;
  match_id: number | null;
  player_id?: number | null;
  subject: string;
  description: string;
  attachments?: AppealAttachment[];
}) =>
  post<{ appeal: Appeal; message: string }>("/api/penalties/appeals", body);

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
  /** Sunucu otomatik mesajlarda null gönderir; ekranlar null'a dayanmalı. */
  category_label: string | null;
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

/**
 * Panel bildirimleri — routes/panelNotifications.js.
 * Girişli kullanıcının okunmamış bildirim sayısı ve listesi.
 */

export interface PanelNotification {
  id: number;
  type: string;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_public_id: string | null;
  is_read: boolean;
  read_at: string | null;
  createdAt: string;
}

export interface PanelNotificationsResponse {
  items: PanelNotification[];
  page: number;
  totalItems: number;
}

export const getPanelNotifications = (page = 1) =>
  get<PanelNotificationsResponse>("/api/panel-notifications", { page, limit: 50 });

export const getUnreadNotifCount = () =>
  get<{ count: number }>("/api/panel-notifications/unread-count");

export const markNotifRead = (id: number) =>
  patch<{ success: boolean }>(`/api/panel-notifications/${id}/read`);

export const markAllNotifsRead = () =>
  patch<{ success: boolean }>("/api/panel-notifications/read-all");
