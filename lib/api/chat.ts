import { del, get, patch, post } from "../http";

/**
 * Sohbet ve sesli arama uçları — routes/chat.js (docs/chat-api.md).
 *
 * Takım yöneticileri ve oyuncular birbiriyle (birebir / grup / takım grubu) ve
 * ElitLig Yönetimi ile WhatsApp mantığında yazışır. Yönetim sohbetine tüm
 * panel bildirimleri eylem düğmeli mesaj olarak düşer; düğmeler `mobile`
 * alanındaki rotaya götürür.
 */

export type ConversationType = "direct" | "group" | "team" | "management" | "admin";
export type MessageKind = "text" | "system" | "notification" | "call" | "audio" | "location" | "match_offer";

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
  /** Yalnız istemcide: iyimser gönderim durumu. */
  pending?: boolean;
  failed?: boolean;
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
  kind?: "player" | "manager" | "both" | "member";
  team_name?: string | null;
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
  my_role: "member" | "admin";
  muted: boolean;
  participants: ChatParticipant[];
  last_message: ChatMessage | null;
  unread: number;
  last_message_at: string | null;
  created_at: string;
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
  meta?: { audio?: ChatAudioMeta; location?: Partial<ChatLocationMeta>; match_offer?: MatchOfferInput };
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
}

export interface AdminAudioMessage extends ChatMessage {
  conversation: { id: number; type: ConversationType; title: string } | null;
}

export interface AdminChatStats {
  conversations: number;
  messages: number;
  calls: number;
  recorded_calls: number;
  audio_messages: number;
}

export const adminChat = {
  getConversations: (params: { type?: "management" | "all" | "direct" | "group" | "team"; q?: string; page?: number; limit?: number } = {}) =>
    get<AdminConversationsResponse>("/api/admin/chat/conversations", params),
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
  getCalls: (params: { recorded?: "1"; page?: number; limit?: number } = {}) =>
    get<{ calls: AdminCallRecord[]; page: number; limit: number; total: number }>("/api/admin/chat/calls", params),
  getAudioMessages: (params: { page?: number; limit?: number } = {}) =>
    get<{ messages: AdminAudioMessage[]; page: number; limit: number; total: number }>("/api/admin/chat/audio-messages", params),
  getStats: () => get<AdminChatStats>("/api/admin/chat/stats"),
};
export const markConversationRead = (id: number) => post<{ conversation_id: number }>(`/api/chat/conversations/${id}/read`);
export const deleteMessage = (id: number, messageId: number) =>
  del<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages/${messageId}`);
export const leaveConversation = (id: number) => post<{ left: boolean }>(`/api/chat/conversations/${id}/leave`);
export const muteConversation = (id: number, muted: boolean) =>
  patch<{ muted: boolean }>(`/api/chat/conversations/${id}/mute`, { muted });
export const getDirectory = (q = "") => get<DirectoryResponse>("/api/chat/directory", q ? { q } : undefined);
export const getChatUnread = () => get<{ count: number }>("/api/chat/unread-count");

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
