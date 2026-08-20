/**
 * Okunmamış sayacı — Profil sekmesinin rozeti (§1.2).
 *
 * NEDEN İKİ SORGU BİRLEŞTİRİLİYOR: kullanıcı için "beni bekleyen bir şey var"
 * tek bir histir; panel bildirimi mi panel mesajı mı olduğu sekmeye basmadan
 * önemli değil. Sunucuda tek uç olmadığı için iki hafif uç toplanır.
 *
 * NEDEN YOKLAMA (polling): mesaj ve bildirim için soket YOK (sunucu sözleşmesi);
 * uyandırma push ile, tazeleme yoklama ile yapılır. 60 saniye, pil ile
 * tazelik arasındaki denge.
 *
 * Girişsiz kullanıcıda hiç sorgu açılmaz ve rozet çizilmez — misafire "0
 * bildirim" göstermek bile yanlış bir vaattir.
 */

import { useQuery } from "@tanstack/react-query";
import { getMyMessages, getUnreadNotifCount } from "@/lib/api/panel";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";

export interface UnreadCount {
  /** Rozette gösterilen toplam. */
  total: number;
  notifications: number;
  messages: number;
  /** İlk yükleme — rozet yerine hiçbir şey çizilmemeli (0 ile aynı davranış). */
  loading: boolean;
}

export function useUnreadCount(): UnreadCount {
  const auth = useAuth();
  const enabled = Boolean(auth.user);

  const notifQuery = useQuery({
    queryKey: queryKeys.unreadNotifCount(),
    queryFn: getUnreadNotifCount,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    // Panel rolü olmayan hesapta 403 gelir; rozet sessizce yok sayılır.
    retry: false,
  });

  const messagesQuery = useQuery({
    queryKey: queryKeys.panelMessages(),
    queryFn: getMyMessages,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    retry: false,
  });

  const notifications = enabled ? notifQuery.data?.count ?? 0 : 0;
  const messages = enabled ? messagesQuery.data?.unread ?? 0 : 0;

  return {
    total: notifications + messages,
    notifications,
    messages,
    loading: enabled && (notifQuery.isLoading || messagesQuery.isLoading),
  };
}

/** Rozet metni — 99'dan sonrası "99+". 0'da rozet HİÇ çizilmez (undefined). */
export function unreadBadgeLabel(total: number): string | undefined {
  if (total <= 0) return undefined;
  return total > 99 ? "99+" : String(total);
}
