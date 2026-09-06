/**
 * SOHBET VERİ KANCALARI — liste, mesajlar, okunmamış sayacı.
 *
 * Tek önbellek, iki kaynak: React Query yoklaması (30 sn) doğruluğu, soket
 * olayları anındalığı sağlar. Soket `chat:message` getirdiğinde hem listenin
 * hem açık sohbetin önbelleği yerinde güncellenir; ağ isteği atılmaz.
 *
 * Soket aboneliği yalnız oturum açıkken ve uygulama ön plandayken tutulur;
 * arka planda bağlantı kapanır, dönünce yeniden kurulur ve liste tazelenir.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import {
  adminChat,
  getChatUnread,
  getConversations,
  getMessages,
  type ChatConversation,
  type ChatMessage,
  type ConversationsResponse,
  type MessagesResponse,
} from "@/lib/api/chat";
import { CHAT_EVENTS, onChatEvent, releaseChatSocket, retainChatSocket } from "@/lib/chatSocket";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";

const LIST_POLL_MS = 30_000;
const ROOM_POLL_MS = 20_000;

interface MessageEvent {
  conversation_id: number;
  message: ChatMessage;
}
interface DeletedEvent {
  conversation_id: number;
  message_id: number;
}

/** Şu an açık olan sohbet; kökteki köprü okunmamış sayacını buna göre işler. */
let activeConversationId: number | null = null;
export function setActiveChatConversation(id: number | null): void {
  activeConversationId = id;
}

const byRecent = (a: ChatConversation, b: ChatConversation) =>
  new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime();

/**
 * Soket olaylarını önbelleğe işler. Uygulamada BİR kez (app/_layout.tsx,
 * ChatRealtimeSetup) çalıştırılır; ekranlar yalnız sorguları okur.
 */
export function useChatRealtime(): void {
  const auth = useAuth();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const enabled = Boolean(auth.user) && appActive;

  useEffect(() => {
    if (!enabled) return;
    retainChatSocket();

    const offMessage = onChatEvent<MessageEvent>(CHAT_EVENTS.MESSAGE, ({ conversation_id, message }) => {
      const isActive = activeConversationId === conversation_id;
      void queryClient.invalidateQueries({ queryKey: ["chat", "admin", "conversations"] });
      queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), (previous) => {
        if (!previous) return previous;
        const exists = previous.conversations.some((item) => item.id === conversation_id);
        if (!exists) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
          return previous;
        }
        const conversations = previous.conversations
          .map((item) =>
            item.id === conversation_id
              ? {
                  ...item,
                  last_message: message,
                  last_message_at: message.created_at,
                  unread: isActive || message.sender.is_me ? 0 : item.unread + 1,
                }
              : item,
          )
          .sort(byRecent);
        return { conversations, unread: conversations.reduce((sum, item) => sum + item.unread, 0) };
      });
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversation_id), (previous) => {
        if (!previous) return previous;
        if (previous.messages.some((item) => item.id === message.id)) return previous;
        const pendingIndex = message.client_id
          ? previous.messages.findIndex((item) => item.client_id === message.client_id)
          : -1;
        const messages = previous.messages.slice();
        if (pendingIndex >= 0) messages[pendingIndex] = message;
        else messages.push(message);
        return { ...previous, messages };
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() });
    });

    const offDeleted = onChatEvent<DeletedEvent>(CHAT_EVENTS.DELETED, ({ conversation_id, message_id }) => {
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversation_id), (previous) =>
        previous
          ? {
              ...previous,
              messages: previous.messages.map((item) =>
                item.id === message_id ? { ...item, deleted: true, body: null, meta: null } : item,
              ),
            }
          : previous,
      );
    });

    const offConversation = onChatEvent(CHAT_EVENTS.CONVERSATION, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
      void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
    });

    // Mesaj meta'sı değişti (maç teklifi yanıtı, eylem kartı kapandı).
    const offUpdated = onChatEvent<MessageEvent>(CHAT_EVENTS.UPDATED, ({ conversation_id, message }) => {
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversation_id), (previous) =>
        previous
          ? { ...previous, messages: previous.messages.map((item) => (item.id === message.id ? { ...item, ...message, sender: item.sender } : item)) }
          : previous,
      );
    });

    // Yönetim kutusuna üye mesajı düştü: yönetici listesi tazelenir.
    const offAdminInbox = onChatEvent(CHAT_EVENTS.ADMIN_INBOX, () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
    });

    return () => {
      offMessage();
      offDeleted();
      offConversation();
      offUpdated();
      offAdminInbox();
      releaseChatSocket();
    };
  }, [enabled, queryClient]);
}

/* ---------- yönetim modu ---------- */

export interface AdminInboxFilters {
  category?: string;
  kind?: string;
}

export function useAdminConversations(filters: AdminInboxFilters = {}) {
  const auth = useAuth();
  const appActive = useAppActive();
  const category = filters.category || "";
  const kind = filters.kind || "";
  return useQuery({
    queryKey: ["chat", "admin", "conversations", category, kind] as const,
    queryFn: async () => {
      // Varlık bazlı yönetim sohbetleri (talep kartları burada) + yöneticinin
      // katıldığı gruplar tek listede. Eski kişisel bildirim akışı listelenmez;
      // üyelerin kendi aralarındaki sohbetler yönetime görünmez.
      const filtered = Boolean(category || kind);
      const [own, managed] = await Promise.all([
        filtered ? Promise.resolve({ conversations: [], unread: 0 } as ConversationsResponse) : getConversations().catch(() => ({ conversations: [], unread: 0 }) as ConversationsResponse),
        adminChat.getConversations({ limit: 100, ...(category ? { category } : {}), ...(kind ? { kind } : {}) }),
      ]);
      const ownList = own.conversations.filter((item) => item.type !== "admin");
      const seen = new Set(ownList.map((item) => item.id));
      const merged = [...ownList, ...managed.conversations.filter((item) => !seen.has(item.id))];
      return { conversations: merged, unread: ownList.reduce((sum, item) => sum + item.unread, 0) + managed.unread, total: managed.total } as ConversationsResponse;
    },
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 5_000,
    refetchInterval: appActive ? LIST_POLL_MS : false,
    retry: false,
  });
}

/** Gelen kutusu özeti (rozetler ve kategori filtreleri). */
export function useAdminInboxSummary() {
  const auth = useAuth();
  const appActive = useAppActive();
  return useQuery({
    queryKey: ["chat", "admin", "summary"] as const,
    queryFn: () => adminChat.getSummary(),
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 5_000,
    refetchInterval: appActive ? LIST_POLL_MS : false,
    retry: false,
  });
}

export function useAdminConversationMessages(conversationId: number) {
  const auth = useAuth();
  const appActive = useAppActive();
  return useQuery({
    queryKey: queryKeys.chatMessages(conversationId),
    queryFn: () => adminChat.getMessages(conversationId, { limit: 50 }),
    enabled: Boolean(auth.user) && auth.isManagement && Number.isInteger(conversationId) && conversationId > 0,
    staleTime: 4_000,
    refetchInterval: appActive ? ROOM_POLL_MS : false,
    retry: false,
  });
}

export function useConversations() {
  const auth = useAuth();
  const appActive = useAppActive();
  return useQuery({
    queryKey: queryKeys.chatConversations(),
    queryFn: getConversations,
    enabled: Boolean(auth.user),
    staleTime: 5_000,
    refetchInterval: appActive ? LIST_POLL_MS : false,
    retry: false,
  });
}

export function useConversationMessages(conversationId: number) {
  const auth = useAuth();
  const appActive = useAppActive();
  return useQuery({
    queryKey: queryKeys.chatMessages(conversationId),
    queryFn: () => getMessages(conversationId, { limit: 50 }),
    enabled: Boolean(auth.user) && Number.isInteger(conversationId) && conversationId > 0,
    staleTime: 4_000,
    refetchInterval: appActive ? ROOM_POLL_MS : false,
    retry: false,
  });
}

/** Sohbet okunmamış toplamı — Profil rozeti ve mesaj balonu için. */
export function useChatUnread(): number {
  const auth = useAuth();
  const enabled = Boolean(auth.user);
  const query = useQuery({
    queryKey: queryKeys.chatUnread(),
    queryFn: getChatUnread,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    retry: false,
  });
  return enabled ? query.data?.count ?? 0 : 0;
}
