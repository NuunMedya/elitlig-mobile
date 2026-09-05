import { del, get, patch, post } from "../http";

/**
 * Sohbet ve sesli arama uçları — routes/chat.js (docs/chat-api.md).
 *
 * Takım yöneticileri ve oyuncular birbiriyle (birebir / grup / takım grubu) ve
 * ElitLig Yönetimi ile WhatsApp mantığında yazışır. Yönetim sohbetine tüm
 * panel bildirimleri eylem düğmeli mesaj olarak düşer; düğmeler `mobile`
 * alanındaki rotaya götürür.
 */

export type ConversationType = "direct" | "group" | "team" | "management";
export type MessageKind = "text" | "system" | "notification" | "call";

export interface ChatSender {
  user_id: number | null;
  name: string | null;
  avatar: string | null;
  is_me: boolean;
  is_management: boolean;
}

export interface ChatAction {
  key: string;
  label: string;
  style?: "primary" | "secondary";
  web?: string;
  mobile?: string;
}

export interface ChatCallMeta {
  id: number;
  status: string;
  caller_user_id: number;
  callee_user_id: number;
  duration_seconds: number;
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
  can_call: boolean;
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
  | { type: "team"; team_id?: number }
  | { type: "direct"; user_id: number }
  | { type: "group"; title: string; user_ids: number[] };

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
export const sendMessage = (id: number, body: { body: string; client_id?: string; reply_to_id?: number | null }) =>
  post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages`, body);
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
  const prefix = message.sender.is_me
    ? "Sen: "
    : conversation.type !== "direct" && conversation.type !== "management" && message.kind === "text" && message.sender.name
      ? `${message.sender.name}: `
      : "";
  return `${prefix}${String(message.body ?? "").split("\n")[0]}`;
}

/** Yeni mesaj için istemci kimliği (çift gönderim önleme). */
export function makeClientId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
