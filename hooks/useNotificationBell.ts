/**
 * Üst çubuk ZİLİ — her ana ekranın başlığında bildirimlere giden düğme.
 *
 * TEK MESAJLAŞMA KURALI (web ile aynı): Mesajlar sekmesi yalnız doğrudan
 * yazışmadır; transfer, disiplin, maç, istek ve hesap bildirimleri zilden
 * açılan /bildirimler ekranındadır. Rozet okunmamış bildirim sayısıdır; yönetim
 * kullanıcısında onay bekleyen talepler de eklenir (Talepler kısayolu
 * Bildirimler ekranının tepesindedir).
 *
 * Girişsiz kullanıcıda zil çizilmez (null).
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";

import type { ScreenHeaderAction } from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getRequestsSummary } from "@/lib/api/admin/requests";
import { useAuth } from "@/providers/AuthProvider";

/** Yönetim kullanıcısının bekleyen talep sayısı (Talepler ekranıyla aynı önbellek). */
export function usePendingRequests(): number {
  const auth = useAuth();
  const appActive = useAppActive();
  const query = useQuery({
    queryKey: ["admin", "requests", "summary"],
    queryFn: getRequestsSummary,
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 30_000,
    refetchInterval: appActive ? 60_000 : false,
    retry: false,
  });
  return query.data?.total ?? 0;
}

export function useNotificationBell(): ScreenHeaderAction | null {
  const auth = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const pending = usePendingRequests();
  const count = unread.notifications + pending;
  return useMemo(() => {
    if (!auth.user) return null;
    return {
      icon: count > 0 ? "notifications" : "notifications-outline",
      onPress: () => router.push("/bildirimler"),
      badge: count > 0 ? count : undefined,
      tone: "live",
      accessibilityLabel: count > 0 ? `Bildirimler, ${count} yeni` : "Bildirimler",
    };
  }, [auth.user, count, router]);
}
