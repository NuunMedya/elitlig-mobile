import { del, get, patch, post, put } from "../http";

/**
 * Sohbet ve sesli arama uçları — routes/chat.js (docs/chat-api.md).
 *
 * Takım yöneticileri ve oyuncular birbiriyle (birebir / grup / takım grubu) ve
 * ElitLig Yönetimi ile WhatsApp mantığında yazışır. Yönetim sohbetine tüm
 * panel bildirimleri eylem düğmeli mesaj olarak düşer; düğmeler `mobile`
 * alanındaki rotaya götürür.
 */

export type ConversationType = "direct" | "group" | "team" | "management" | "admin";
export type MessageKind =
  | "text"
  | "system"
  | "notification"
  | "call"
  | "audio"
  | "location"
  | "match_offer"
  | "attendance"
  /* WhatsApp benzeri: fotoğraf, belge, anket (elitlig-server services/chat/chatExtras.js) */
  | "image"
  | "file"
  | "poll"
  /* Yönetimin hazır içerikleri (services/chat/chatContent.js) */
  | "matches"
  | "signup"
  | "award_poll";

/** Anket: `votes` seçenek kimliği → oy veren kullanıcı kimlikleri. */
export interface ChatPollMeta {
  question: string;
  multiple: boolean;
  options: { id: string; text: string }[];
  votes: Record<string, number[]>;
}

/** Fotoğraf / belge eki. */
export interface ChatFileMeta {
  url: string;
  name: string;
  mime: string | null;
  size: number;
  width: number | null;
  height: number | null;
}

/** "Günün maçları" kartındaki tek maç. */
export interface ChatMatchItem {
  id: number;
  date: string | null;
  time: string | null;
  home: string | null;
  away: string | null;
  home_score: number | null;
  away_score: number | null;
  field: string | null;
  league: string | null;
  city?: string | null;
}

/** "Ben talibim" görev anketi (spiker, reji…). */
export interface ChatSignupMeta {
  title: string;
  note: string | null;
  deadline: string | null;
  duties: string[];
  slots: {
    id: string;
    match_id: number;
    duty: string;
    duty_label: string;
    match: { home: string | null; away: string | null; time: string | null; date: string | null; field: string | null; league: string | null };
    assigned: { user_id?: number | null; name: string | null } | null;
  }[];
  volunteers: Record<string, { user_id: number; name: string; city?: string | null; at?: string }[]>;
  closed: boolean;
}

/** Emoji tepkisi özeti (services/chat/chatExtras.js summarizeReactions). */
export interface ChatReaction {
  emoji: string;
  count: number;
  mine: boolean;
  users: { user_id: number; name: string | null }[];
}

/** Haftanın Enleri anketi meta'sı (services/chat/chatContent.js sendAwardPoll). */
export interface ChatAwardMeta {
  batch_id?: string | number | null;
  week?: string | null;
  note?: string | null;
  due_at?: string | null;
  categories?: string[];
  coordinator_id?: number | null;
  coordination_task_id?: number | null;
  skipped?: { user_id: number; name: string }[];
  tasks?: Record<string, number>;
}

export interface ChatSender {
  user_id: number | null;
  name: string | null;
  avatar: string | null;
  is_me: boolean;
  is_management: boolean;
}

export interface ChatActionApi {
  method?: "POST" | "PATCH" | "PUT" | "DELETE" | "GET";
  url: string;
  body?: Record<string, unknown>;
  /** Doluysa istekten önce onay sorulur. */
  confirm?: string;
}

export interface ChatAction {
  key: string;
  label: string;
  style?: "primary" | "secondary" | "danger";
  web?: string;
  mobile?: string;
  /** Doğrudan işlem (ör. transfer onayı): istek atılır, kart kapatılır. */
  api?: ChatActionApi;
}

export interface ChatCallMeta {
  id: number;
  status: string;
  caller_user_id: number;
  callee_user_id: number;
  duration_seconds: number;
  recording_url?: string | null;
  recording_duration_ms?: number | null;
}

export interface ChatAudioMeta {
  url: string;
  duration_ms: number;
  mime?: string | null;
}

export interface ChatLocationMeta {
  lat: number | null;
  lng: number | null;
  label: string | null;
  address: string | null;
  venue_public_id?: string | null;
  venue_name?: string | null;
}

export type MatchOfferStatus = "pending" | "accepted" | "rejected";

export interface ChatMatchOfferMeta {
  opponent_team_id: number | null;
  opponent_team_name: string | null;
  home_team_id: number | null;
  home_team_name: string | null;
  venue_public_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  date: string;
  time: string;
  note: string | null;
  status: MatchOfferStatus;
  responded_by: number | null;
  responded_by_name?: string | null;
  responded_at: string | null;
  response_note?: string | null;
}

export interface MatchOfferInput {
  opponent_team_id?: number | null;
  opponent_team_name?: string | null;
  home_team_id?: number | null;
  home_team_name?: string | null;
  venue_public_id?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  date: string;
  time: string;
  note?: string | null;
}

export interface ChatMessageMeta {
  actions?: ChatAction[];
  notification?: {
    id: number | null;
    type: string | null;
    category: string;
    title: string | null;
    entity_type: string | null;
    entity_public_id: string | null;
  };
  panel_message?: { id: number | null; thread_id: number | null; subject: string | null };
  call?: ChatCallMeta;
  audio?: ChatAudioMeta;
  location?: ChatLocationMeta;
  match_offer?: ChatMatchOfferMeta;
  /** Maç yoklaması kartı (services/matchAttendanceService.js). */
  attendance?: import("./team").AttendanceMeta;
  poll?: ChatPollMeta;
  file?: ChatFileMeta;
  caption?: string | null;
  matches?: { date: string | null; note: string | null; items: ChatMatchItem[] };
  signup?: ChatSignupMeta;
  award?: ChatAwardMeta;
  /** @bahsetme: bahsedilen kullanıcı kimlikleri. */
  mentions?: number[];
  /** İletilen mesaj işareti. */
  forwarded?: boolean;
  /** Eylem kartı tamamlandı (Onayla/Reddet sonrası). */
  resolved?: { key: string; user_id: number; at: string; label?: string | null };
  admin_user_id?: number;
  admin_name?: string;
}

export interface ChatMessage {
  id: number;
  public_id: string;
  conversation_id: number;
  kind: MessageKind;
  body: string | null;
  meta: ChatMessageMeta | null;
  client_id: string | null;
  sender: ChatSender;
  reply_to: { id: number; body: string | null; kind: MessageKind; sender_name: string | null } | null;
  deleted: boolean;
  edited_at: string | null;
  created_at: string;
  /* — WhatsApp ekleri: sunucu `decorateMessages` ile doldurur (yönetim görünümünde gelmez) — */
  reactions?: ChatReaction[];
  starred?: boolean;
  forwarded?: boolean;
  /** Yalnız kendi mesajımda: "read" = karşı taraftaki herkes okudu. */
  status?: "sent" | "read";
  read_count?: number;
  recipient_count?: number;
  /** Yalnız istemcide: iyimser gönderim durumu. */
  pending?: boolean;
  failed?: boolean;
  /** Yalnız istemcide: gönderilemedi, bağlantı gelince kendiliğinden yeniden denenecek. */
  queued?: boolean;
  /** Yalnız istemcide: yüklenmekte olan fotoğraf / ses dosyasının cihazdaki adresi. */
  local_uri?: string | null;
  /** Yalnız istemcide: yeniden denemede kullanılacak gönderim girdisi. */
  retry?: ChatRetry | null;
}

/** Başarısız gönderimi yeniden kurmak için gerekenler. */
export interface ChatRetry {
  input: SendMessageInput;
  /** Henüz yüklenmemiş dosya (fotoğraf, video, sesli mesaj). */
  upload?: { field: "file" | "audio"; uri: string; name: string; type: string; width?: number | null; height?: number | null; duration_ms?: number } | null;
}

export interface ChatParticipant {
  user_id: number;
  name: string;
  avatar: string | null;
  subtitle: string;
  role: "member" | "admin";
  is_me: boolean;
}

export interface ChatUser {
  user_id: number;
  name: string;
  avatar: string | null;
  subtitle: string;
  /** staff: başka bir yönetim hesabı (ekip sohbeti). */
  kind?: "player" | "manager" | "both" | "member" | "staff";
  team_name?: string | null;
  managed_team_id?: number | null;
  manager_name?: string | null;
}

export interface ChatConversation {
  id: number;
  public_id: string;
  type: ConversationType;
  title: string;
  avatar: string | null;
  subtitle: string;
  other_user: ChatUser | null;
  team_id: number | null;
  is_management: boolean;
  is_admin_feed?: boolean;
  can_call: boolean;
  can_write?: boolean;
  /** Yazılamayan eski sohbetin sebebi (ör. başka takımın oyuncusuyla birebir). */
  restricted_reason?: string | null;
  /** Birebir: karşı tarafı engelledim (composer yerine "engelledin" şeridi). */
  blocked_by_me?: boolean;
  /** Birebir: karşı taraf beni engelledi (gönderim 403 USER_BLOCKED döner). */
  blocked_me?: boolean;
  my_role: "member" | "admin";
  muted: boolean;
  participants: ChatParticipant[];
  last_message: ChatMessage | null;
  unread: number;
  last_message_at: string | null;
  created_at: string;
  /** Grup kurarken mesaj tercihi nedeniyle dışarıda kalanlar (yalnızca açılış yanıtında). */
  skipped_members?: { user_id: number; name: string }[];
  /** Yönetim gelen kutusu: sohbetin ait olduğu varlık (takım / oyuncu / üye / genel). */
  entity?: { kind: "team" | "player" | "member" | "general" | "staff"; id: number | null; name: string; avatar: string | null; user_id?: number | null } | null;
  /** Yönetim gelen kutusu: bekleyen talep kartları (kategori → adet). */
  pending?: { total: number; categories: Record<string, number>; latest_category?: string | null };
  /* — kişisel durum ve grup ayarları (chatExtras.decorateConversations; yönetim listesinde gelmez) — */
  pinned?: boolean;
  pinned_at?: string | null;
  archived?: boolean;
  marked_unread?: boolean;
  description?: string | null;
  only_admins_send?: boolean;
  only_admins_edit?: boolean;
  pinned_message_id?: number | null;
  /** chat:conversation yayını: gruptan çıkarıldım. */
  removed?: boolean;
}

export interface InboxCategory {
  key: string;
  label: string;
  icon?: string;
  pending: number;
}

export interface InboxSummary {
  unread: number;
  unread_conversations: number;
  pending: number;
  categories: InboxCategory[];
  kinds: Record<string, number>;
}

export interface ConversationsResponse {
  conversations: ChatConversation[];
  unread: number;
  total?: number;
}

export interface MessagesResponse {
  messages: ChatMessage[];
  has_more: boolean;
  conversation: ChatConversation;
}

export interface DirectoryResponse {
  management: { type: "management"; name: string; subtitle: string } | null;
  teams: { type: "team"; team_id: number; name: string; avatar: string | null; subtitle: string }[];
  managers: (ChatUser & { type: "direct" })[];
  players: (ChatUser & { type: "direct" })[];
  /** Yönetim hesapları: diğer yönetim hesapları (ekip sohbeti). Üyede boş. */
  staff?: (ChatUser & { type: "direct" })[];
}

export type OpenConversationInput =
  | { type: "management" }
  | { type: "admin" }
  | { type: "team"; team_id?: number }
  | { type: "direct"; user_id: number }
  | { type: "member"; user_id: number }
  | { type: "group"; title: string; user_ids: number[] };

export interface SendMessageInput {
  kind?: MessageKind;
  body?: string;
  meta?: {
    audio?: ChatAudioMeta;
    location?: Partial<ChatLocationMeta>;
    match_offer?: MatchOfferInput;
    /** Anket: soru + 2–12 seçenek (sunucu kimlikleri kendisi verir). */
    poll?: { question: string; multiple?: boolean; options: string[] };
    /** Fotoğraf / belge: `uploadFile` yanıtı (+ varsa boyutlar). */
    file?: { url: string; name?: string | null; mime?: string | null; size?: number | null; width?: number | null; height?: number | null };
  };
  /** @bahsetme: bahsedilen kullanıcı kimlikleri (grup). */
  mentions?: number[];
  client_id?: string;
  reply_to_id?: number | null;
  /** Yönetim modu: katılımcı olunan grupta bile "ElitLig Yönetimi" adına yaz. */
  as_management?: boolean;
}

export interface ChatVenue {
  public_id: string;
  name: string;
  address: string | null;
  city: string | null;
  description?: string | null;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ChatCall {
  id: number;
  public_id: string;
  conversation_id: number;
  caller_user_id: number;
  callee_user_id: number;
  status: "ringing" | "accepted" | "rejected" | "missed" | "cancelled" | "busy" | "ended" | "failed";
  outgoing: boolean | null;
  other_user: ChatUser | { user_id: number };
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  label: string | null;
  to_management?: boolean;
  recording_url?: string | null;
  recording_duration_ms?: number | null;
}

export interface SdpPayload {
  type: string;
  sdp: string;
}

export const getConversations = () => get<ConversationsResponse>("/api/chat/conversations");
export const openConversation = (input: OpenConversationInput) =>
  post<{ conversation: ChatConversation }>("/api/chat/conversations", input);
export const getConversation = (id: number) =>
  get<{ conversation: ChatConversation }>(`/api/chat/conversations/${id}`);
export const getMessages = (id: number, params: { before?: number; after?: number; limit?: number } = {}) =>
  get<MessagesResponse>(`/api/chat/conversations/${id}/messages`, params);
export const sendMessage = (id: number, body: SendMessageInput) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages`, body);
export const respondMatchOffer = (id: number, messageId: number, body: { response: "accepted" | "rejected"; note?: string }) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages/${messageId}/respond`, body);
export const resolveAction = (id: number, messageId: number, body: { key: string; label?: string }) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages/${messageId}/resolve`, body);
/** Ankete oy ver: tek seçimlide `option_id`, çok seçimlide `option_ids` (boş dizi oyu geri alır). */
export const votePoll = (id: number, messageId: number, body: { option_id?: string; option_ids?: string[] }) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages/${messageId}/vote`, body);
/** "Ben talibim" satırına talip ol / vazgeç. */
export const toggleSignup = (id: number, messageId: number, body: { slot_id: string; on: boolean }) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages/${messageId}/signup`, body);

export interface ChatSearchHit extends ChatMessage {
  conversation_title: string | null;
  conversation_type: ConversationType | null;
}
/** Katıldığım sohbetlerde mesaj araması (en az 2 harf, son 60 eşleşme). */
export const searchMessages = (q: string, conversationId?: number) =>
  get<{ items: ChatSearchHit[] }>("/api/chat/search", conversationId ? { q, conversation_id: conversationId } : { q }).then((d) => d.items ?? []);

export const getVenues = (q = "") => get<{ venues: ChatVenue[] }>("/api/chat/venues", q ? { q } : undefined);

/** Sesli mesaj dosyasını yükler; dönen url mesaj meta'sına yazılır. */
export function uploadAudio(file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır.
  form.append("audio", file as unknown as Blob);
  return post<{ url: string; mime: string | null; size: number | null }>("/api/chat/uploads/audio", form, {
    timeout: 120_000,
  });
}

/** Fotoğraf / belge / video yükler (≤25 MB); dönen bilgi `meta.file`'a yazılır. */
export function uploadFile(file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  form.append("file", file as unknown as Blob);
  return post<{ url: string; name: string | null; mime: string | null; size: number | null; is_image: boolean }>("/api/chat/uploads/file", form, {
    timeout: 180_000,
  });
}

/* ---------- WhatsApp ekleri (services/chat/chatExtras.js) ---------- */

const msgPath = (id: number, messageId: number) => `/api/chat/conversations/${id}/messages/${messageId}`;

/** Emoji tepkisi: aynı emoji ya da boş dize tepkiyi kaldırır. */
export const reactToMessage = (id: number, messageId: number, emoji: string) =>
  post<{ message: ChatMessage }>(`${msgPath(id, messageId)}/reactions`, { emoji });
/** Kendi metin mesajını düzenle (gönderimden sonra 15 dk). */
export const editMessage = (id: number, messageId: number, body: string) =>
  patch<{ message: ChatMessage }>(msgPath(id, messageId), { body });
export const starMessage = (id: number, messageId: number, on: boolean) =>
  on
    ? put<{ message_id: number; starred: boolean }>(`${msgPath(id, messageId)}/star`, {})
    : del<{ message_id: number; starred: boolean }>(`${msgPath(id, messageId)}/star`);

export interface StarredMessage extends ChatMessage {
  starred_at?: string | null;
  conversation_title: string | null;
  conversation_type: ConversationType | null;
}
export const getStarred = () => get<{ items: StarredMessage[] }>("/api/chat/starred").then((d) => d.items ?? []);

export interface MessageInfoPerson {
  user_id: number;
  name: string;
  avatar: string | null;
  read_at: string | null;
}
export interface MessageInfo {
  message_id: number;
  sent_at: string;
  read_by: MessageInfoPerson[];
  not_read: MessageInfoPerson[];
}
export const getMessageInfo = (id: number, messageId: number) => get<MessageInfo>(`${msgPath(id, messageId)}/info`);

/** İlet: en çok 30 mesaj, 20 sohbet. */
export const forwardMessages = (messageIds: number[], conversationIds: number[]) =>
  post<{ sent: number; messages: ChatMessage[] }>("/api/chat/forward", { message_ids: messageIds, conversation_ids: conversationIds });

export interface ConversationState {
  conversation_id: number;
  pinned: boolean;
  archived: boolean;
  marked_unread: boolean;
}
/** Kişisel sohbet durumu: sabitle (en çok 3), arşivle, okunmadı olarak işaretle. */
export const setConversationState = (id: number, body: { pinned?: boolean; archived?: boolean; marked_unread?: boolean }) =>
  patch<ConversationState>(`/api/chat/conversations/${id}/state`, body);
/** Mesajı sohbete sabitle; `null` sabitlemeyi kaldırır. */
export const pinMessage = (id: number, messageId: number | null) =>
  put<{ pinned_message_id: number | null }>(`/api/chat/conversations/${id}/pin`, { message_id: messageId });

export interface GroupMember {
  user_id: number;
  role: "member" | "admin";
  name: string;
  subtitle: string | null;
  avatar: string | null;
  joined_at: string | null;
  is_me: boolean;
}
export interface GroupInfo {
  conversation: ChatConversation;
  description: string | null;
  only_admins_send: boolean;
  only_admins_edit: boolean;
  is_admin: boolean;
  members: GroupMember[];
}
export interface GroupPatch {
  title?: string;
  description?: string;
  avatar_url?: string;
  only_admins_send?: boolean;
  only_admins_edit?: boolean;
}
export const getGroupInfo = (id: number) => get<GroupInfo>(`/api/chat/conversations/${id}/group`);
export const updateGroup = (id: number, body: GroupPatch) => patch<GroupInfo>(`/api/chat/conversations/${id}/group`, body);
export const addGroupMembers = (id: number, userIds: number[]) =>
  post<{ added: number[]; skipped: number[] }>(`/api/chat/conversations/${id}/members`, { user_ids: userIds });
export const removeGroupMember = (id: number, userId: number) =>
  del<{ removed: number }>(`/api/chat/conversations/${id}/members/${userId}`);
export const setGroupMemberRole = (id: number, userId: number, role: "admin" | "member") =>
  patch<{ user_id: number; role: "admin" | "member" }>(`/api/chat/conversations/${id}/members/${userId}`, { role });

export interface ConversationMedia {
  images: { id: number; url: string; created_at: string }[];
  files: { id: number; url: string; name: string; mime: string | null; size: number; created_at: string }[];
  links: { id: number; urls: string[]; body: string | null; created_at: string }[];
}
export const getConversationMedia = (id: number) => get<ConversationMedia>(`/api/chat/conversations/${id}/media`);

export interface ChatPresence {
  online: boolean;
  last_seen: string | null;
}
/** Çevrimiçi / son görülme (en çok 200 kimlik). */
export const getPresence = (userIds: number[]) =>
  get<{ presence: Record<string, ChatPresence> }>("/api/chat/presence", { user_ids: userIds.join(",") }).then((d) => d.presence ?? {});

/* ---------- hazır içerikler (services/chat/chatContent.js; yalnız yönetim hesapları) ---------- */

export interface ContentMatch extends ChatMatchItem {
  /** Göreve atanmış kişiler: görev anahtarı → kişi. */
  crew?: Record<string, { user_id?: number | null; name: string | null }>;
}
export const getContentMatches = (date: string) =>
  get<{ date: string; items: ContentMatch[] }>("/api/chat/content/matches", { date });
export const sendContentMatches = (id: number, body: { match_ids: number[]; date?: string; note?: string | null }) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/content/matches`, body);
export const sendContentSignup = (
  id: number,
  body: { title?: string | null; match_ids: number[]; duties: string[]; note?: string | null; deadline?: string | null },
) => post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/content/signup`, body);
export interface AwardPollInput {
  week?: string | null;
  categories: string[];
  league_id: number;
  season_id: number;
  start_date: string;
  end_date: string;
  squad_size: number;
  due_at?: string | null;
  note?: string | null;
}
export const sendContentAward = (id: number, body: AwardPollInput) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/content/award`, body);
/** Görevlendir (staff.assign): `user_id: null` görevi boşaltır. */
export const assignSignup = (id: number, messageId: number, body: { slot_id: string; user_id: number | null }) =>
  post<{ message: ChatMessage }>(`${msgPath(id, messageId)}/signup/assign`, body);
/** Anketi kapat / yeniden aç (yalnız gönderen). */
export const closeSignup = (id: number, messageId: number, closed: boolean) =>
  post<{ message: ChatMessage }>(`${msgPath(id, messageId)}/signup/close`, { closed });
export interface AwardStatus {
  my_task_id: number | null;
  coordination_task_id: number | null;
  people: { user_id: number; name: string; task_id: number; submitted: boolean }[];
  submitted: number;
  total: number;
}
export const getAwardStatus = (id: number, messageId: number) => get<AwardStatus>(`${msgPath(id, messageId)}/award`);
/** Haftanın Enleri kapsamı: lig ve sezon listeleri (masaüstü AwardScope ile aynı uçlar). */
export interface AwardScopeOption {
  id: number;
  label?: string | null;
  name?: string | null;
  seasonName?: string | null;
}
export const getAwardLeagues = () => get<{ items: AwardScopeOption[] }>("/api/admin/weekly-awards/leagues").then((d) => d.items ?? []);
export const getAwardSeasons = (leagueId: number) =>
  get<{ items: AwardScopeOption[] }>("/api/admin/weekly-awards/seasons", { leagueId }).then((d) => d.items ?? []);

/** Bildirim kartı düğmesinin isteğini atar (api: { method, url, body }). */
export function callAction(action: ChatAction) {
  const method = (action.api?.method ?? "POST").toUpperCase();
  const url = action.api?.url ?? "";
  const body = action.api?.body;
  if (method === "GET") return get<unknown>(url);
  if (method === "PATCH") return patch<unknown>(url, body ?? {});
  if (method === "DELETE") return del<unknown>(url);
  return post<unknown>(url, body ?? {});
}

/* ---------- Yönetim tarafı (/api/admin/chat) ---------- */

export interface AdminConversationsResponse extends ConversationsResponse {
  page: number;
  limit: number;
  total: number;
}

export interface AdminCallRecord extends ChatCall {
  caller: ChatUser | { user_id: number; name: string };
  callee: ChatUser | { user_id: number; name: string };
  /** Kayıt var ama dinleme yetkisi yoksa recording_url boş gelir. */
  has_recording?: boolean;
}

export interface AdminChatStats {
  conversations: number;
  calls: number;
  recorded_calls: number;
}

export const adminChat = {
  /** Yalnızca üyelerin yönetimle yaptığı yazışmalar; üyeler arası sohbetler yönetime kapalıdır. */
  getConversations: (params: { q?: string; page?: number; limit?: number; category?: string; kind?: string; pending?: "1" } = {}) =>
    get<AdminConversationsResponse>("/api/admin/chat/conversations", params),
  /** Gelen kutusu özeti: okunmamış / bekleyen talep sayıları, kategori dökümü. */
  getSummary: () => get<InboxSummary>("/api/admin/chat/summary"),
  openConversation: (input: OpenConversationInput) =>
    post<{ conversation: ChatConversation }>("/api/admin/chat/conversations", input),
  getConversation: (id: number) => get<{ conversation: ChatConversation }>(`/api/admin/chat/conversations/${id}`),
  getMessages: (id: number, params: { before?: number; after?: number; limit?: number } = {}) =>
    get<MessagesResponse>(`/api/admin/chat/conversations/${id}/messages`, params),
  sendMessage: (id: number, body: SendMessageInput) =>
    post<{ message: ChatMessage }>(`/api/admin/chat/conversations/${id}/messages`, body),
  markRead: (id: number) => post<{ conversation_id: number }>(`/api/admin/chat/conversations/${id}/read`),
  respondMatchOffer: (id: number, messageId: number, body: { response: "accepted" | "rejected"; note?: string }) =>
    post<{ message: ChatMessage }>(`/api/admin/chat/conversations/${id}/messages/${messageId}/respond`, body),
  resolveAction: (id: number, messageId: number, body: { key: string; label?: string }) =>
    post<{ message: ChatMessage }>(`/api/admin/chat/conversations/${id}/messages/${messageId}/resolve`, body),
  getDirectory: (q = "") => get<DirectoryResponse>("/api/admin/chat/directory", q ? { q } : undefined),
  /** Yalnızca yönetimle yapılan aramalar; can_listen "messages.listen" yetkisini yansıtır. */
  getCalls: (params: { recorded?: "1"; page?: number; limit?: number } = {}) =>
    get<{ calls: AdminCallRecord[]; can_listen: boolean; page: number; limit: number; total: number }>("/api/admin/chat/calls", params),
  getStats: () => get<AdminChatStats>("/api/admin/chat/stats"),
  /** Sohbeti yönetim tarafından gizler; kayıt çöp kutusuna düşer. */
  deleteConversation: (id: number) => del<{ message: string; conversation_id: number }>(`/api/admin/chat/conversations/${id}`),
};
export const markConversationRead = (id: number) => post<{ conversation_id: number }>(`/api/chat/conversations/${id}/read`);
export const deleteMessage = (id: number, messageId: number) =>
  del<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages/${messageId}`);
export const leaveConversation = (id: number) => post<{ left: boolean }>(`/api/chat/conversations/${id}/leave`);
/** Sohbeti kendi tarafımdan sil: karşı taraf görmeye devam eder, kayıt çöp kutusuna düşer. */
export const deleteConversation = (id: number) => del<{ message: string; conversation_id: number }>(`/api/chat/conversations/${id}`);

/* ---------- Kimden mesaj kabul ederim ---------- */

export type AcceptFrom = "everyone" | "teams" | "players" | "teammates";

export const ACCEPT_FROM_OPTIONS: { key: AcceptFrom; label: string; hint: string }[] = [
  { key: "everyone", label: "Herkesten", hint: "Tüm takım yöneticileri ve oyuncular sana yazabilir." },
  { key: "teams", label: "Takım yöneticilerinden", hint: "Yalnızca takım yöneticileri." },
  { key: "players", label: "Oyunculardan", hint: "Yalnızca oyuncular." },
  { key: "teammates", label: "Takım arkadaşlarımdan", hint: "Kendi takımının yöneticisi ve oyuncuları." },
];

export interface ChatPreferences {
  accept_from: AcceptFrom[];
  options: { key: AcceptFrom; label: string }[];
  /** Yönetimden gelen mesaj her koşulda kabul edilir. */
  management_always: boolean;
}

export const getChatPreferences = () => get<ChatPreferences>("/api/chat/preferences");
export const setChatPreferences = (acceptFrom: AcceptFrom[]) =>
  patch<ChatPreferences & { message?: string }>("/api/chat/preferences", { accept_from: acceptFrom });
export const muteConversation = (id: number, muted: boolean) =>
  patch<{ muted: boolean }>(`/api/chat/conversations/${id}/mute`, { muted });
export const getDirectory = (q = "") => get<DirectoryResponse>("/api/chat/directory", q ? { q } : undefined);
export const getChatUnread = () => get<{ count: number }>("/api/chat/unread-count");

/* ---------- engelleme & şikayet (App Store 1.2 / Google Play UGC) ----------
   Mağazalar, üyelerin birbirine yazıp arayabildiği her uygulamadan kötüye
   kullanan üyeyi engelleme ve içeriği şikayet etme ister. Sunucu:
   services/chat/safetyService.js (docs/chat-api.md, 4. aşama). */

export interface BlockedUser {
  user_id: number;
  name: string;
  avatar: string | null;
  subtitle: string;
  blocked_at: string | null;
}

export type ReportReason = "harassment" | "spam" | "inappropriate" | "threat" | "impersonation" | "other";

/** Sunucudaki REPORT_REASONS ile aynı sıra ve anahtarlar. */
export const REPORT_REASONS: { key: ReportReason; label: string; hint: string }[] = [
  { key: "harassment", label: "Taciz veya hakaret", hint: "Küfür, aşağılama, ısrarlı rahatsız etme" },
  { key: "spam", label: "Spam veya reklam", hint: "İstenmeyen tanıtım, tekrarlayan mesajlar" },
  { key: "inappropriate", label: "Uygunsuz içerik", hint: "Müstehcen, nefret söylemi, yasa dışı içerik" },
  { key: "threat", label: "Tehdit veya şiddet", hint: "Fiziksel tehdit, şiddete çağrı" },
  { key: "impersonation", label: "Sahte hesap", hint: "Başka biri ya da kurum gibi davranma" },
  { key: "other", label: "Diğer", hint: "Aşağıda kısaca açıkla" },
];

export interface ReportInput {
  reason: ReportReason;
  details?: string;
  user_id?: number;
  conversation_id?: number;
  message_id?: number;
  call_id?: number;
  /** Şikayetle birlikte üyeyi de engelle. */
  block?: boolean;
}

export interface ReportResult {
  message: string;
  report: { id: number; public_id: string | null; status: string; reason: string };
  blocked: boolean;
}

export const getBlockedUsers = () => get<{ blocks: BlockedUser[] }>("/api/chat/blocks");
export const blockUser = (userId: number) => post<{ blocked: true; user_id: number; created: boolean }>("/api/chat/blocks", { user_id: userId });
export const unblockUser = (userId: number) => del<{ blocked: false; user_id: number }>(`/api/chat/blocks/${userId}`);
export const reportAbuse = (body: ReportInput) => post<ReportResult>("/api/chat/reports", body);

export const getIceServers = () => get<{ ice_servers: IceServer[] }>("/api/chat/ice-servers");
export const getActiveCall = () => get<{ call: ChatCall | null; ice_servers: IceServer[] }>("/api/chat/calls/active");
export const startCall = (body: { conversation_id: number; sdp?: SdpPayload }) =>
  post<{ call: ChatCall; ice_servers: IceServer[] }>("/api/chat/calls", body);
export const acceptCall = (callId: number, body: { sdp?: SdpPayload }) =>
  post<{ call: ChatCall; ice_servers: IceServer[] }>(`/api/chat/calls/${callId}/accept`, body);
export const rejectCall = (callId: number) => post<{ call: ChatCall }>(`/api/chat/calls/${callId}/reject`);
export const endCall = (callId: number, reason?: string) =>
  post<{ call: ChatCall }>(`/api/chat/calls/${callId}/end`, reason ? { reason } : undefined);
export const sendIceCandidate = (callId: number, candidate: unknown) =>
  post<{ relayed: boolean }>(`/api/chat/calls/${callId}/ice`, { candidate });

/** Liste satırındaki önizleme metni. */
export function conversationPreview(conversation: ChatConversation): string {
  const message = conversation.last_message;
  if (!message) {
    return conversation.type === "management" ? "Bildirimler ve duyurular burada" : "Henüz mesaj yok";
  }
  if (message.kind === "call") return message.body ?? "Sesli arama";
  if (message.deleted) return "Bu mesaj silindi";
  if (message.kind === "audio") return `${message.sender.is_me ? "Sen: " : ""}Sesli mesaj`;
  // Zengin türlerde sunucu gövdesi simgeyle başlar; listede düz Türkçe etiket gösterilir.
  const rich: Partial<Record<MessageKind, string>> = {
    image: message.meta?.caption ? `Fotoğraf: ${message.meta.caption}` : "Fotoğraf",
    file: `Belge: ${message.meta?.file?.name ?? "dosya"}`,
    poll: `Anket: ${message.meta?.poll?.question ?? ""}`.trim(),
    matches: "Günün maçları",
    signup: message.meta?.signup?.title ?? "Görev anketi",
    award_poll: "Haftanın Enleri: aday önerisi",
  };
  const richLabel = rich[message.kind];
  if (richLabel) return `${message.sender.is_me ? "Sen: " : ""}${richLabel}`;
  const prefix = message.sender.is_me
    ? "Sen: "
    : conversation.type !== "direct" && conversation.type !== "management" && message.kind === "text" && message.sender.name
      ? `${message.sender.name}: `
      : "";
  return `${prefix}${String(message.body ?? "").split("\n")[0]}`;
}

/** Yeni mesaj için istemci kimliği (çift gönderim önleme). */
/** Konum mesajı için harita bağlantısı. */
export function mapLinkFor(location: ChatLocationMeta | null | undefined): string | null {
  if (!location) return null;
  if (location.lat != null && location.lng != null) return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  const q = [location.venue_name ?? location.label, location.address].filter(Boolean).join(" ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function formatDurationMs(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function makeClientId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
