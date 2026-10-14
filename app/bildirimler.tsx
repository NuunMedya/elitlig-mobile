/**
 * /bildirimler — ESKİ ROTA, yönlendirme.
 *
 * Bildirim merkezi Mesajlar sekmesinin kutularına taşındı
 * (app/(tabs)/mesajlar.tsx); yönlendirme /gelen-kutusu üstünden kutuyu çözer
 * (içerik components/inbox/NotificationsPane.tsx).
 * Rota silinmez: lib/notifications.ts bazı bildirim türlerini (MEMBERSHIP_,
 * ACCOUNT_REQUEST_, çözümlenemeyen MATCH_*) buraya gönderir ve eski derin
 * bağlantılar yaşar. Eski süzgeç `?tab=` (okunmamis, mac, takim…) yeni
 * ekranda `?filtre=` olarak taşınır.
 */

import { Redirect, useLocalSearchParams } from "expo-router";

export default function NotificationsRedirect() {
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const filter = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  return (
    <Redirect
      href={{
        pathname: "/gelen-kutusu",
        params: filter ? { tab: "bildirimler", filtre: filter } : { tab: "bildirimler" },
      }}
    />
  );
}
