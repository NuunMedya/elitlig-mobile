/**
 * SOHBET VERİ KANCALARI — liste, mesajlar, okunmamış sayacı.
 *
 * Tek önbellek, iki kaynak: React Query yoklaması doğruluğu, soket olayları
 * anındalığı sağlar. Yoklama soket bağlıyken seyrekleşir (liste 120 sn, oda
 * 60 sn); soket yoksa eski sıklığa (30 / 20 sn) döner. Soket yeniden
 * bağlandığında kopukluk sırasında kaçan mesajlar için liste bir kez tazelenir. Soket `chat:message` getirdiğinde hem listenin
 * hem açık sohbetin önbelleği yerinde güncellenir; ağ isteği atılmaz.
 *
 * Soket aboneliği yalnız oturum açıkken ve uygulama ön plandayken tutulur;
 * arka planda bağlantı kapanır, dönünce yeniden kurulur ve liste tazelenir.
 */

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import {
  adminChat,
  getChatUnread,
  getConversations,
  getMessages,
  getPresence,
  sendMessage,
  type ChatConversation,
  type ChatMessage,
  type ChatPresence,
  type ConversationsResponse,
  type MessagesResponse,
} from "@/lib/api/chat";
import {
  CHAT_EVENTS,
  isChatSocketConnected,
  onChatEvent,
  onChatStatus,
  releaseChatSocket,
  retainChatSocket,
} from "@/lib/chatSocket";
import { loadChatDrafts, outboxAll, outboxRemove } from "@/lib/chatDrafts";
import { markReadUntil, mergeMessages, upsertChat } from "@/lib/chatUtils";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { hasAnyPermission } from "@/lib/admin/access";
import { useAuth } from "@/providers/AuthProvider";

/** Sohbet sayfası boyu (ilk yükleme ve "eski mesajlar"). */
export const PAGE_SIZE = 50;
const LIST_POLL_MS = 30_000;
const ROOM_POLL_MS = 20_000;
/** Soket bağlıyken olaylar zaten anında geliyor; yoklama yalnız doğrulamadır. */
const LIST_POLL_SOCKET_MS = 120_000;
const ROOM_POLL_SOCKET_MS = 60_000;

/** Sohbet soketi şu an bağlı mı — yoklama aralığını seçmek için. */
function useChatSocketConnected(): boolean {
  const [connected, setConnected] = useState(isChatSocketConnected);
  useEffect(() => {
    setConnected(isChatSocketConnected());
    return onChatStatus(setConnected);
  }, []);
  return connected;
}

/** Ön planda değilse yoklama yok; soket bağlıysa seyrek, değilse sık. */
function usePollInterval(fallbackMs: number, socketMs: number): number | false {
  const appActive = useAppActive();
  const socketConnected = useChatSocketConnected();
  if (!appActive) return false;
  return socketConnected ? socketMs : fallbackMs;
}

interface MessageEvent {
  conversation_id: number;
  message: ChatMessage;
}
interface DeletedEvent {
  conversation_id: number;
  message_id: number;
}
interface ReadEvent {
  conversation_id: number;
  user_id: number;
  read_at: string;
}
interface TypingEvent {
  conversation_id: number;
  user_id: number;
  name: string | null;
  typing: boolean;
}

/** Şu an açık olan sohbet; kökteki köprü okunmamış sayacını buna göre işler. */
let activeConversationId: number | null = null;
export function setActiveChatConversation(id: number | null): void {
  activeConversationId = id;
}

const byRecent = (a: ChatConversation, b: ChatConversation) =>
  new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime();

const sumUnread = (list: ChatConversation[]) => list.reduce((sum, item) => sum + item.unread, 0);

/* ---------- önbellek yardımcıları (ekranlar iyimser güncelleme için kullanır) ---------- */

/** Sohbet listesindeki ve açık sohbet önbelleğindeki sohbet özetini yamalar. */
export function patchConversationCache(queryClient: QueryClient, conversationId: number, patch: Partial<ChatConversation>): void {
  queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), (previous) => {
    if (!previous) return previous;
    const conversations = previous.conversations.map((item) => (item.id === conversationId ? { ...item, ...patch } : item));
    return { ...previous, conversations, unread: sumUnread(conversations) };
  });
  queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
    previous ? { ...previous, conversation: { ...previous.conversation, ...patch } } : previous,
  );
}

/** Açık sohbetin mesaj listesini dönüştürür (değişmediyse aynı dizi dönmeli: yeniden çizim olmaz). */
export function updateMessagesCache(queryClient: QueryClient, conversationId: number, fn: (messages: ChatMessage[]) => ChatMessage[]): void {
  queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) => {
    if (!previous) return previous;
    const messages = fn(previous.messages);
    return messages === previous.messages ? previous : { ...previous, messages };
  });
}

/** Tek mesajı yamalar: `key` sunucu kimliği ya da `client_id`. */
export function patchMessageCache(
  queryClient: QueryClient,
  conversationId: number,
  key: number | string,
  patch: Partial<ChatMessage> | ((message: ChatMessage) => Partial<ChatMessage>),
): void {
  updateMessagesCache(queryClient, conversationId, (messages) => {
    let changed = false;
    const next = messages.map((item) => {
      if (item.id !== key && item.client_id !== key) return item;
      changed = true;
      return { ...item, ...(typeof patch === "function" ? patch(item) : patch) };
    });
    return changed ? next : messages;
  });
}

/**
 * Yoklamadan gelen son sayfayı önbellekle birleştirir. Yukarı kaydırılarak
 * yüklenmiş eski mesajlar ve henüz gönderilmemiş (bekleyen / başarısız)
 * balonlar KORUNUR — eskiden her yoklama listeyi son 50 mesaja indirip
 * kaydırma konumunu sıfırlıyordu. Kopukluk sırasında bir sayfadan fazla mesaj
 * kaçtıysa (arada boşluk kalır) eski sayfalar bırakılır.
 */
function mergeFresh(previous: MessagesResponse | undefined, fresh: MessagesResponse): MessagesResponse {
  if (!previous || !previous.messages.length) return fresh;
  const oldestFresh = fresh.messages.find((item) => item.id > 0)?.id ?? 0;
  const known = previous.messages.filter((item) => item.id > 0);
  const newestKnown = known.length ? known[known.length - 1].id : 0;
  const local = previous.messages.filter((item) => item.id <= 0);
  if (fresh.has_more && oldestFresh && newestKnown && newestKnown < oldestFresh) {
    return { ...fresh, messages: mergeMessages(fresh.messages, local) };
  }
  const hasOlder = known.length > 0 && oldestFresh > 0 && known[0].id < oldestFresh;
  return { ...fresh, has_more: hasOlder ? previous.has_more : fresh.has_more, messages: mergeMessages(previous.messages, fresh.messages) };
}

/* ---------- yazıyor… ---------- */

const TYPING_TTL_MS = 6_000;
const typingState = new Map<number, Map<number, { name: string; until: number }>>();
const typingSnapshots = new Map<number, string>();
const typingListeners = new Set<() => void>();
let typingTimer: ReturnType<typeof setTimeout> | null = null;

function refreshTyping() {
  const now = Date.now();
  let next = 0;
  let changed = false;
  typingState.forEach((users, conversationId) => {
    users.forEach((entry, userId) => {
      if (entry.until <= now) users.delete(userId);
      else next = next ? Math.min(next, entry.until) : entry.until;
    });
    const snapshot = [...users.values()].map((entry) => entry.name).join("\u0001");
    if ((typingSnapshots.get(conversationId) ?? "") !== snapshot) {
      changed = true;
      if (snapshot) typingSnapshots.set(conversationId, snapshot);
      else typingSnapshots.delete(conversationId);
    }
    if (!users.size) typingState.delete(conversationId);
  });
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = next ? setTimeout(refreshTyping, Math.max(250, next - now + 50)) : null;
  if (changed) typingListeners.forEach((fn) => fn());
}

function setTyping(conversationId: number, userId: number, name: string | null, typing: boolean) {
  let users = typingState.get(conversationId);
  if (!typing) users?.delete(userId);
  else {
    if (!users) typingState.set(conversationId, (users = new Map()));
    users.set(userId, { name: name || "Üye", until: Date.now() + TYPING_TTL_MS });
  }
  refreshTyping();
}

const subscribeTyping = (fn: () => void) => {
  typingListeners.add(fn);
  return () => {
    typingListeners.delete(fn);
  };
};

/**
 * Bu sohbette şu an yazanların adları. Yalnız KENDİ sohbetinin durumu
 * değişince yeniden çizer: liste satırları ve sohbet başlığı ayrı ayrı abone
 * olur, mesaj listesi yazma olayında hiç çizilmez.
 */
export function useTypingNames(conversationId: number): string[] {
  const snapshot = useSyncExternalStore(subscribeTyping, () => typingSnapshots.get(conversationId) ?? "");
  return useMemo(() => (snapshot ? snapshot.split("\u0001") : []), [snapshot]);
}

/* ---------- çevrimiçi / son görülme ---------- */

/** Birebir sohbetlerin karşı tarafları için çevrimiçi / son görülme (30 sn'de bir). */
export function usePresence(userIds: number[]): Record<string, ChatPresence> {
  const auth = useAuth();
  const appActive = useAppActive();
  const ids = useMemo(() => [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b).slice(0, 150), [userIds]);
  const key = ids.join(",");
  const query = useQuery({
    queryKey: ["chat", "presence", key] as const,
    queryFn: () => getPresence(ids),
    enabled: Boolean(auth.user) && ids.length > 0,
    staleTime: 20_000,
    refetchInterval: appActive ? 30_000 : false,
    retry: false,
    placeholderData: (previous) => previous,
  });
  return query.data ?? EMPTY_PRESENCE;
}
const EMPTY_PRESENCE: Record<string, ChatPresence> = {};

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

    const patchLast = (conversationId: number, fn: (last: ChatMessage, conversation: ChatConversation) => ChatMessage | null) => {
      queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), (previous) => {
        if (!previous) return previous;
        let changed = false;
        const conversations = previous.conversations.map((item) => {
          if (item.id !== conversationId || !item.last_message) return item;
          const next = fn(item.last_message, item);
          if (!next) return item;
          changed = true;
          return { ...item, last_message: next };
        });
        return changed ? { ...previous, conversations } : previous;
      });
    };

    const offMessage = onChatEvent<MessageEvent>(CHAT_EVENTS.MESSAGE, ({ conversation_id, message }) => {
      if (!message) return;
      const isActive = activeConversationId === conversation_id;
      if (message.sender?.user_id) setTyping(conversation_id, message.sender.user_id, null, false);
      void queryClient.invalidateQueries({ queryKey: ["chat", "admin", "conversations"] });
      queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), (previous) => {
        if (!previous) return previous;
        const exists = previous.conversations.some((item) => item.id === conversation_id);
        if (!exists) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
          return previous;
        }
        const fromOther = !message.sender.is_me && message.kind !== "system";
        const conversations = previous.conversations
          .map((item) =>
            item.id === conversation_id
              ? {
                  ...item,
                  last_message: message,
                  last_message_at: message.created_at,
                  unread: isActive || message.sender.is_me ? 0 : fromOther ? item.unread + 1 : item.unread,
                  // Kendi mesajım "okunmadı" işaretini kaldırır.
                  marked_unread: message.sender.is_me ? false : item.marked_unread,
                }
              : item,
          )
          .sort(byRecent);
        return { ...previous, conversations, unread: sumUnread(conversations) };
      });
      updateMessagesCache(queryClient, conversation_id, (messages) => mergeMessages(messages, [message]));
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() });
    });

    const offDeleted = onChatEvent<DeletedEvent>(CHAT_EVENTS.DELETED, ({ conversation_id, message_id }) => {
      patchMessageCache(queryClient, conversation_id, Number(message_id), { deleted: true, body: null, meta: null, reactions: [], starred: false });
      patchLast(conversation_id, (last) => (last.id === Number(message_id) ? { ...last, deleted: true, body: null, meta: null } : null));
    });

    const offConversation = onChatEvent<{ conversation?: ChatConversation }>(CHAT_EVENTS.CONVERSATION, (payload) => {
      const conversation = payload?.conversation;
      void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
      if (!conversation?.id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
        return;
      }
      const known = queryClient.getQueryData<ConversationsResponse>(queryKeys.chatConversations());
      if (!known) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
      } else {
        // Yayın, sohbeti bu kullanıcının gözünden taşır (ad, üyeler, grup ayarları, sabit mesaj).
        const isActive = activeConversationId === conversation.id;
        const conversations = upsertChat(known.conversations, isActive ? { ...conversation, unread: 0 } : conversation).sort(byRecent);
        queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), { ...known, conversations, unread: sumUnread(conversations) });
      }
      if (conversation.removed) {
        queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversation.id), (previous) =>
          previous ? { ...previous, conversation: { ...previous.conversation, removed: true, can_write: false } } : previous,
        );
        return;
      }
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversation.id), (previous) => {
        if (!previous) return previous;
        const [merged] = upsertChat([previous.conversation], conversation);
        return { ...previous, conversation: merged };
      });
      void queryClient.invalidateQueries({ queryKey: ["chat", "group", conversation.id] });
    });

    // Mesaj değişti: tepki, düzenleme, anket oyu, teklif yanıtı, kart kapandı.
    // Sunucu her alıcıya KENDİ gözünden zenginleştirilmiş mesajı yollar.
    const offUpdated = onChatEvent<MessageEvent>(CHAT_EVENTS.UPDATED, ({ conversation_id, message }) => {
      if (!message) return;
      // Gönderen bilgisi önbellektekinden korunur: yönetim hesaplarına giden
      // ikinci yayın "izleyicisiz" serileştirilir ve is_me taşımaz.
      updateMessagesCache(queryClient, conversation_id, (messages) => {
        const known = messages.find((item) => item.id === message.id);
        return known ? mergeMessages(messages, [{ ...message, sender: known.sender }]) : messages;
      });
      patchLast(conversation_id, (last) => (last.id === message.id ? { ...last, body: message.body, meta: message.meta, edited_at: message.edited_at } : null));
    });

    // Karşı taraf okudu: kendi mesajlarımın tikleri maviye döner.
    const offRead = onChatEvent<ReadEvent>(CHAT_EVENTS.READ, ({ conversation_id, user_id, read_at }) => {
      if (!conversation_id || Number(user_id) === Number(auth.user?.id)) return;
      const list = queryClient.getQueryData<ConversationsResponse>(queryKeys.chatConversations());
      const open = queryClient.getQueryData<MessagesResponse>(queryKeys.chatMessages(conversation_id));
      const type = list?.conversations.find((item) => item.id === conversation_id)?.type ?? open?.conversation.type;
      const group = type === "group" || type === "team";
      updateMessagesCache(queryClient, conversation_id, (messages) => markReadUntil(messages, read_at || new Date(), group));
      patchLast(conversation_id, (last) => {
        if (!last.sender.is_me || last.status === "read") return null;
        const [next] = markReadUntil([last], read_at || new Date(), group);
        return next === last ? null : next;
      });
    });

    const offTyping = onChatEvent<TypingEvent>(CHAT_EVENTS.TYPING, ({ conversation_id, user_id, name, typing }) => {
      if (!conversation_id || !user_id) return;
      setTyping(conversation_id, user_id, name, typing !== false);
    });

    // Yönetim kutusuna üye mesajı düştü: yönetici listesi tazelenir; açık üye
    // sohbeti de yoklanır (sunucu yönetime yalnız sohbet kimliğini yollar).
    const offAdminInbox = onChatEvent<{ conversation_id?: number }>(CHAT_EVENTS.ADMIN_INBOX, (payload) => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
      if (payload?.conversation_id && activeConversationId === payload.conversation_id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(payload.conversation_id) });
      }
    });

    // Soket (yeniden) bağlandı: kopukken kaçan olaylar için listeler bir kez
    // tazelenir — seyrek yoklamanın bıraktığı boşluğu kapatır.
    let wasConnected = isChatSocketConnected();
    const offStatus = onChatStatus((connected) => {
      if (connected && !wasConnected) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
        void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
        if (activeConversationId) void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(activeConversationId) });
        void flushOutbox();
      }
      wasConnected = connected;
    });

    // Giden kutusu: bağlantı yokken yazılan metinler. Açık sohbetinkini oda
    // kendisi gönderir (balonunu günceller); diğer sohbetlerinki burada gider.
    let flushing = false;
    const flushOutbox = async () => {
      if (flushing) return;
      flushing = true;
      try {
        await loadChatDrafts();
        for (const item of outboxAll()) {
          if (item.conversation_id === activeConversationId) continue;
          try {
            const input = { kind: "text" as const, body: item.body, reply_to_id: item.reply_to_id, client_id: item.client_id, ...(item.mentions?.length ? { mentions: item.mentions } : {}) };
            // eslint-disable-next-line no-await-in-loop
            const { message } = await (item.admin ? adminChat.sendMessage(item.conversation_id, input) : sendMessage(item.conversation_id, input));
            outboxRemove(item.client_id);
            updateMessagesCache(queryClient, item.conversation_id, (messages) => mergeMessages(messages, [message]));
          } catch (error) {
            // Sunucu reddettiyse (4xx) yeniden denemek anlamsız; bağlantı hatasında sırada kalır.
            if (error instanceof ApiError && error.status >= 400 && error.status < 500) outboxRemove(item.client_id);
            else break;
          }
        }
      } finally {
        flushing = false;
      }
    };
    if (wasConnected) void flushOutbox();

    return () => {
      offStatus();
      offMessage();
      offDeleted();
      offConversation();
      offUpdated();
      offRead();
      offTyping();
      offAdminInbox();
      releaseChatSocket();
    };
  }, [auth.user?.id, enabled, queryClient]);
}

/** Sohbet soketi bağlı mı — "bağlanıyor…" şeridi ve giden kutusu için. */
export function useChatConnected(): boolean {
  return useChatSocketConnected();
}

/* ---------- yönetim modu ---------- */

export interface AdminInboxFilters {
  kind?: string;
  /** false: sorgu kapalı (sekme görünmüyorken). */
  enabled?: boolean;
}

export function useAdminConversations(filters: AdminInboxFilters = {}) {
  const auth = useAuth();
  const pollMs = usePollInterval(LIST_POLL_MS, LIST_POLL_SOCKET_MS);
  const kind = filters.kind || "";
  const canView = hasAnyPermission(auth.user, ["messages.view"]);
  return useQuery({
    queryKey: ["chat", "admin", "conversations", kind] as const,
    // ÜYE MESAJLARI: üyelerin "ElitLig Yönetimi" yazışmaları (web Mesajlar ▸
    // Üye mesajları). Yöneticinin kendi sohbetleri ve grupları burada DEĞİL,
    // Mesajlar ▸ Sohbetlerim'dedir; bildirim ve talep kartları sohbete düşmez.
    queryFn: () => adminChat.getConversations({ limit: 100, ...(kind ? { kind } : {}) }),
    enabled: Boolean(auth.user) && auth.isManagement && canView && filters.enabled !== false,
    staleTime: 5_000,
    refetchInterval: pollMs,
    retry: false,
  });
}

/** Gelen kutusu özeti (rozetler ve kategori filtreleri). */
export function useAdminInboxSummary() {
  const auth = useAuth();
  const pollMs = usePollInterval(LIST_POLL_MS, LIST_POLL_SOCKET_MS);
  return useQuery({
    queryKey: ["chat", "admin", "summary"] as const,
    queryFn: () => adminChat.getSummary(),
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 5_000,
    refetchInterval: pollMs,
    retry: false,
  });
}

export function useAdminConversationMessages(conversationId: number) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const pollMs = usePollInterval(ROOM_POLL_MS, ROOM_POLL_SOCKET_MS);
  return useQuery({
    queryKey: queryKeys.chatMessages(conversationId),
    queryFn: async () => mergeFresh(queryClient.getQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId)), await adminChat.getMessages(conversationId, { limit: PAGE_SIZE })),
    enabled: Boolean(auth.user) && auth.isManagement && Number.isInteger(conversationId) && conversationId > 0,
    staleTime: 4_000,
    refetchInterval: pollMs,
    retry: false,
  });
}

export function useConversations() {
  const auth = useAuth();
  const pollMs = usePollInterval(LIST_POLL_MS, LIST_POLL_SOCKET_MS);
  return useQuery({
    queryKey: queryKeys.chatConversations(),
    queryFn: getConversations,
    enabled: Boolean(auth.user),
    staleTime: 5_000,
    refetchInterval: pollMs,
    retry: false,
  });
}

export function useConversationMessages(conversationId: number) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const pollMs = usePollInterval(ROOM_POLL_MS, ROOM_POLL_SOCKET_MS);
  return useQuery({
    queryKey: queryKeys.chatMessages(conversationId),
    queryFn: async () => mergeFresh(queryClient.getQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId)), await getMessages(conversationId, { limit: PAGE_SIZE })),
    enabled: Boolean(auth.user) && Number.isInteger(conversationId) && conversationId > 0,
    staleTime: 4_000,
    refetchInterval: pollMs,
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
