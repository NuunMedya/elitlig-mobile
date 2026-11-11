/**
 * Yönetim sayaçları — yönetim modunun rozetleri tek yerden.
 *
 * Alt menü (İşler rozeti, orta düğme), uygulama çekmecesi ve yönetim ana
 * ekranı AYNI sorgu anahtarlarını okur; sayaçlar her yerde aynı sayıyı
 * gösterir ve ağ isteği çoğalmaz (React Query aynı anahtarı paylaşır).
 *
 * Her uç bağımsızdır ve `retry: false` çalışır: rolün o yetkisi yoksa (403)
 * sayaç sessizce `null` kalır, ekran düşmez. Yönetim modu kapalıyken
 * (`enabled=false`) hiç sorgu açılmaz.
 */

import { useQuery } from "@tanstack/react-query";

import { useAdminInboxSummary } from "@/hooks/useChat";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getRequestsSummary } from "@/lib/api/admin/requests";
import { getTodoSummary, todoKeys, type TodoSummary } from "@/lib/api/todos";
import { useAuth } from "@/providers/AuthProvider";

const POLL_MS = 45_000;

export interface AdminCounters {
  todo: TodoSummary | null;
  /** Açık görev sayısı (bilinmiyorsa null). */
  openTodos: number | null;
  overdueTodos: number;
  /** Onay bekleyen talep. */
  requests: number | null;
  /** Kendi sohbetlerindeki okunmamış mesaj. */
  chatUnread: number;
  /** Üyelerin "ElitLig Yönetimi" yazışmalarındaki okunmamış. */
  memberUnread: number | null;
  /** Mesajlar uygulamasının toplam rozeti. */
  messages: number;
  /** Bildirim zili. */
  notifications: number;
  loading: boolean;
}

export function useAdminCounters(enabled = true): AdminCounters {
  const auth = useAuth();
  const appActive = useAppActive();
  const on = enabled && Boolean(auth.user) && auth.isManagement;
  const poll = on && appActive ? POLL_MS : false;

  const todoQuery = useQuery({
    queryKey: todoKeys.summary(),
    queryFn: getTodoSummary,
    enabled: on,
    staleTime: 15_000,
    refetchInterval: poll,
    retry: false,
  });

  const requestsQuery = useQuery({
    queryKey: ["admin", "requests", "summary"],
    queryFn: getRequestsSummary,
    enabled: on,
    staleTime: 15_000,
    refetchInterval: poll,
    retry: false,
  });

  const inbox = useAdminInboxSummary();
  const unread = useUnreadCount();

  const memberUnread = on ? (inbox.data?.unread ?? null) : null;

  return {
    todo: todoQuery.data ?? null,
    openTodos: todoQuery.data?.open ?? null,
    overdueTodos: todoQuery.data?.overdue ?? 0,
    requests: requestsQuery.data?.total ?? null,
    chatUnread: unread.messages,
    memberUnread,
    messages: unread.messages + (memberUnread ?? 0),
    notifications: unread.notifications,
    loading: on && (todoQuery.isLoading || requestsQuery.isLoading),
  };
}
