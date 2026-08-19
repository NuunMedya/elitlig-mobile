import { del, get, patch, post, put } from "../http";
import type { ApiMatch, MacDurumu } from "../types";

/**
 * Yönetim (admin) uçları — üç sunucu dosyasından derlenmiştir:
 *
 *   routes/adminMessages.js + services/panelMessageService.js
 *     → /api/admin/messages (başvuru kutusu)
 *   routes/matchRequests.js + services/matchRequestService.js
 *     → /api/match-requests/admin/... (saha ve maç talepleri)
 *   routes/Matches.js
 *     → /maclar (maç listesi, skor ve durum güncelleme)
 *
 * Alan adları sunucu serileştiricilerinden birebir alınmıştır; ekranda sabit
 * yazmak yerine buradaki Türkçe sözlükler kullanılır (sunucu meta'sının aynısı).
 */

/* ===================== Türkçe sözlükler ===================== */

/** panelMessageService.STATUSES ile birebir. */
export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  open: "Açık",
  in_review: "İnceleniyor",
  answered: "Yanıtlandı",
  closed: "Kapatıldı",
};

/** panelMessageService.CATEGORIES ile birebir. */
export const MESSAGE_CATEGORY_LABELS: Record<string, string> = {
  genel: "Genel başvuru",
  transfer: "Transfer ve sözleşme",
  disiplin: "Disiplin / ceza",
  fikstur: "Fikstür ve maç",
  kadro: "Kadro ve lisans",
  odeme: "Ödeme ve üyelik",
  teknik: "Teknik sorun / hata",
  oneri: "Öneri ve şikayet",
};

/** panelMessageService.PRIORITIES ile birebir. */
export const MESSAGE_PRIORITY_LABELS: Record<string, string> = {
  low: "Düşük",
  normal: "Normal",
  high: "Yüksek",
  urgent: "Acil",
};

/** constants/matchStatus.js — mac_durumu değerleri. */
export const MATCH_STATUS_LABELS: Record<MacDurumu, string> = {
  taslak: "Taslak",
  zamanlanmis: "Zamanlandı",
  canli: "Canlı",
  yayinlanmis: "Yayınlandı",
};

/** matchRequestService.SLOT_STATUSES — saha hücre durumları. */
export const SLOT_STATUS_LABELS: Record<string, string> = {
  open: "Açık",
  closed: "Kapalı",
  awaiting: "Rakip bekliyor",
  booked: "Maç alındı",
};

/** matchRequestService.REQUEST_STATUSES — talep durumları. */
export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  cancelled: "Geri çekildi",
};

/** Yönetim rolleri — sunucudaki rol adlarının ekran karşılığı. */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Yönetici",
  editor: "Editör",
  il_yoneticisi: "İl Yöneticisi",
  lig_yoneticisi: "Lig Yöneticisi",
  mac_yoneticisi: "Maç Yöneticisi",
  disiplin_kurulu: "Disiplin Kurulu",
  sosyal_medya_yoneticisi: "Sosyal Medya Yöneticisi",
};

/* ===================== Mesaj yönetimi ===================== */

export type MessageStatus = "open" | "in_review" | "answered" | "closed";
export type MessagePriority = "low" | "normal" | "high" | "urgent";

/** panelMessageService.serializeMessage çıktısı. */
export interface AdminThreadMessage {
  id: number;
  thread_id: number;
  parent_id: number | null;
  /** "to_admin" = üyeden gelen, "to_member" = yönetimin yanıtı */
  direction: "to_admin" | "to_member";
  sender: string;
  subject: string;
  body: string;
  category: string | null;
  category_label: string | null;
  status: MessageStatus;
  status_label: string;
  priority: MessagePriority;
  priority_label: string;
  sender_user_id: number | null;
  sender_team_id: number | null;
  sender_player_id: number | null;
  read: boolean;
  admin_read: boolean;
  created_at: string;
  updated_at: string;
}

/** panelMessageService.buildThread (viewer=admin) çıktısı. */
export interface AdminThread {
  id: number;
  subject: string;
  category: string | null;
  category_label: string | null;
  status: MessageStatus;
  status_label: string;
  priority: MessagePriority;
  priority_label: string;
  direction: "to_admin" | "to_member";
  opened_by_member: boolean;
  sender: string;
  sender_user_id: number | null;
  sender_team_id: number | null;
  sender_player_id: number | null;
  created_at: string;
  last_message_at: string;
  last_message_preview: string;
  message_count: number;
  /** Yönetici için okunmamış (üyeden gelen) mesaj sayısı */
  unread: number;
  messages: AdminThreadMessage[];
}

export interface AdminMessageCounts {
  open: number;
  in_review: number;
  answered: number;
  closed: number;
  /** Okunmamış mesaj içeren zincir sayısı */
  unread: number;
}

export interface AdminMessagesResponse {
  threads: AdminThread[];
  counts: AdminMessageCounts;
  categories: Record<string, string>;
  statuses: Record<string, string>;
  priorities: Record<string, string>;
}

export interface AdminMessagesQuery {
  status?: MessageStatus;
  category?: string;
  priority?: MessagePriority;
  search?: string;
  limit?: number;
}

/** GET /api/admin/messages — yönetim kutusu (filtreler sunucuda uygulanır). */
export const getAdminMessages = (query: AdminMessagesQuery = {}) =>
  get<AdminMessagesResponse>("/api/admin/messages", {
    status: query.status,
    category: query.category,
    priority: query.priority,
    search: query.search,
    limit: query.limit,
  });

/** GET /api/admin/messages/meta — filtre etiket sözlükleri. */
export const getAdminMessagesMeta = () =>
  get<{
    categories: Record<string, string>;
    statuses: Record<string, string>;
    priorities: Record<string, string>;
  }>("/api/admin/messages/meta");

/** POST /api/admin/messages/:threadId/reply — yanıt + isteğe bağlı yeni durum. */
export const replyAdminThread = (threadId: number, body: string, status?: MessageStatus) =>
  post<{ message: string; thread: AdminThread }>(`/api/admin/messages/${threadId}/reply`, {
    body,
    ...(status ? { status } : {}),
  });

/** PATCH /api/admin/messages/:threadId — durum / öncelik / kategori. */
export const updateAdminThread = (
  threadId: number,
  updates: { status?: MessageStatus; priority?: MessagePriority; category?: string }
) => patch<{ message: string; thread: AdminThread }>(`/api/admin/messages/${threadId}`, updates);

/** PATCH /api/admin/messages/:threadId/read — zinciri okundu işaretle. */
export const markAdminThreadRead = (threadId: number) =>
  patch<{ thread: AdminThread }>(`/api/admin/messages/${threadId}/read`);

/** POST /api/admin/messages — yönetimin doğrudan üyeye mesajı. */
export const composeAdminMessage = (input: {
  recipientUserId: number;
  subject: string;
  body: string;
  category?: string;
  priority?: MessagePriority;
}) => post<{ message: string; item: AdminThreadMessage }>("/api/admin/messages", input);

/** DELETE /api/admin/messages/:threadId — zinciri çöp kutusuna taşı. */
export const deleteAdminThread = (threadId: number) =>
  del<{ message: string; deleted: boolean; threadId: number }>(`/api/admin/messages/${threadId}`);

/* ===================== Saha yönetimi ===================== */

export type SlotStatus = "open" | "closed" | "awaiting" | "booked";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface VenueGridDay {
  date: string;
  /** 1 = Pazartesi … 7 = Pazar */
  day: number;
  label: string;
  date_label: string;
  is_today: boolean;
  is_past: boolean;
  is_bookable: boolean;
}

export interface VenueGridTime {
  hour: number;
  minute: number;
  label: string;
}

export interface VenueGrid {
  week_start: string;
  week_end: string;
  days: VenueGridDay[];
  times: VenueGridTime[];
}

export interface WeekOption {
  start: string;
  end: string;
  label: string;
}

/** matchRequestService.serializeVenue çıktısı. */
export interface AdminVenue {
  id: number;
  public_id: string;
  name: string;
  location: string;
  description: string;
  city_id: number | null;
  city: string;
  open_hour: number;
  open_minute: number;
  close_hour: number;
  close_minute: number;
  slot_minutes: number;
  open_label: string;
  close_label: string;
  active_days: number[];
  status: "active" | "passive";
  sort_order: number;
  grid: VenueGrid;
  created_at: string;
  updated_at: string;
}

export interface SlotTeamSide {
  team_id: number;
  team_name: string;
  team_logo: string;
}

export interface RequestSlot {
  date: string;
  day: number;
  hour: number;
  minute: number;
  label: string;
  status: "pending" | "approved" | "rejected";
}

/** Hücreye düşen takım talebi (admin board içinde). */
export interface CellRequest {
  public_id: string;
  team_id: number;
  team_name: string;
  team_logo: string;
  note: string;
  status: RequestStatus;
  slot_status: "pending" | "approved" | "rejected";
  created_at: string;
  slots: RequestSlot[];
}

/** buildBoard (scope=admin) hücresi. */
export interface AdminBoardCell {
  date: string;
  day: number;
  hour: number;
  minute: number;
  label: string;
  is_today: boolean;
  is_past: boolean;
  is_bookable: boolean;
  status: SlotStatus;
  note: string;
  home: SlotTeamSide | null;
  away: SlotTeamSide | null;
  pending_count: number;
  league_id: number | null;
  season_id: number | null;
  match_id: number | null;
  requests: CellRequest[];
}

export interface AdminBoardResponse {
  venue: AdminVenue;
  cells: AdminBoardCell[];
  weeks: WeekOption[];
  week_start: string;
  today: string;
  booking_window: { start: string; end: string };
}

export interface AdminVenuesResponse {
  items: AdminVenue[];
  weeks: WeekOption[];
  today: string;
}

/** GET /api/match-requests/admin/venues — pasifler dahil saha listesi. */
export const getAdminVenues = () =>
  get<AdminVenuesResponse>("/api/match-requests/admin/venues");

/** GET /api/match-requests/admin/venues/:publicId/board?weekStart= */
export const getAdminBoard = (publicId: string, weekStart?: string) =>
  get<AdminBoardResponse>(`/api/match-requests/admin/venues/${publicId}/board`, {
    weekStart,
  });

/** PATCH .../slots — hücreyi kapat / aç (yalnızca open | closed). */
export const setSlotStatus = (
  publicId: string,
  input: { date: string; hour: number; minute: number; status: "open" | "closed"; note?: string }
) =>
  patch<{ message: string; venue: AdminVenue; slot: { date: string; hour: number; minute: number; status: SlotStatus } }>(
    `/api/match-requests/admin/venues/${publicId}/slots`,
    input
  );

/** PUT .../slots/teams — saate takım(ları) yaz; iki takım = maç alındı. */
export const setSlotTeams = (
  publicId: string,
  input: {
    date: string;
    hour: number;
    minute: number;
    homeTeamId?: number | null;
    awayTeamId?: number | null;
    leagueId?: number | null;
    seasonId?: number | null;
    note?: string;
  }
) =>
  put<{
    message: string;
    venue: AdminVenue;
    slot: { date: string; hour: number; minute: number; status: SlotStatus };
    match_id: number | null;
    fixture_pending: boolean;
  }>(`/api/match-requests/admin/venues/${publicId}/slots/teams`, input);

/** DELETE .../slots — hücreyi tamamen boşalt (fikstür maçı da geri alınır). */
export const releaseSlot = (
  publicId: string,
  input: { date: string; hour: number; minute: number }
) =>
  del<{ message: string; released: boolean; slot: { date: string; hour: number; minute: number; status: SlotStatus } }>(
    `/api/match-requests/admin/venues/${publicId}/slots`,
    input
  );

/** adminListRequests kaydı: serializeRequest + saha adı. */
export interface AdminMatchRequest {
  id: number;
  public_id: string;
  venue_id: number;
  team_id: number;
  team_name: string;
  team_logo: string;
  note: string;
  status: RequestStatus;
  admin_note: string;
  reviewed_at: string | null;
  created_at: string;
  slots: RequestSlot[];
  venue_name: string;
  venue_public_id: string | null;
}

/** GET /api/match-requests/admin/requests?status=&venueId= */
export const getAdminRequests = (query: { status?: RequestStatus | "all"; venueId?: string } = {}) =>
  get<{ items: AdminMatchRequest[] }>("/api/match-requests/admin/requests", {
    status: query.status,
    venueId: query.venueId,
  });

/** PATCH /api/match-requests/admin/requests/:publicId — onayla / reddet. */
export const reviewMatchRequest = (
  publicId: string,
  input: {
    decision: "approve" | "reject";
    adminNote?: string;
    /** Onayda yalnızca seçilen saatler; boşsa talebin tamamı onaylanır. */
    slots?: { date: string; hour: number; minute: number }[];
    leagueId?: number;
    seasonId?: number;
  }
) =>
  patch<{ message: string; item: AdminMatchRequest & { fixture_pending?: boolean } }>(
    `/api/match-requests/admin/requests/${publicId}`,
    input
  );

/* ===================== Maç yönetimi ===================== */

export interface AdminMatchQuery {
  leagueId?: number;
  seasonId?: number;
  /** Sunucu durum adı (mac_durumu); boşsa tüm durumlar. */
  status?: MacDurumu;
  limit?: number;
}

/**
 * GET /maclar?includeDraft=1 — public uçların gizlediği taslaklar dahil.
 * routes/Matches.js aynı listede league_id + season_id filtresini destekler.
 */
export const getAdminMatches = (query: AdminMatchQuery = {}) =>
  get<ApiMatch[]>("/maclar", {
    league_id: query.leagueId,
    season_id: query.seasonId,
    mac_durumu: query.status,
    limit: query.limit ?? 300,
    includeDraft: 1,
  });

/** PATCH /maclar/:id/status — durum değiştir (matches.publish yetkisi). */
export const patchMatchStatus = (id: number, status: MacDurumu) =>
  patch<{ message: string; match: ApiMatch }>(`/maclar/${id}/status`, { mac_durumu: status });

/** PATCH /maclar/:id/score — skor gir (matches.live yetkisi). */
export const patchMatchScore = (id: number, home: number, away: number) =>
  patch<{ message: string; match: ApiMatch }>(`/maclar/${id}/score`, {
    first_team_score: home,
    second_team_score: away,
  });

/** PATCH /maclar/:id — temel alan düzenlemeleri (tarih, saat, saha vb.). */
export const patchMatch = (id: number, updates: Partial<ApiMatch>) =>
  patch<{ message: string; match: ApiMatch }>(`/maclar/${id}`, updates);
