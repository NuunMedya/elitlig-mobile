/**
 * SEKME ÇUBUĞU — uygulamanın beş ana bölümü.
 *
 * NE: Maçlar · Lig · Yönetim · Mesajlar · Menü. Uygulama MAÇLAR ile açılır
 * (rota adı tarihsel olarak `skorlar`; derin bağlantılar bozulmasın diye korunur).
 *
 * BİLGİ MİMARİSİ — her bölüm tek bir soruyu yanıtlar:
 *   · Maçlar   → "Şu an ve bugün ne oynanıyor?" Üstte Tümü/Canlı/Bitti/
 *     Yaklaşan; altta (alt menünün hemen üstünde) tek satırlık lig seçici
 *     (Tüm Türkiye / Tüm ligler dahil) ve gün gezgini.
 *   · Lig      → "Ligde durum ne?" Puan · Fikstür · Oyuncular · İstatistik ·
 *     Haber. Geçmiş sezonlar lig seçicinin sezon adımında.
 *   · Yönetim  → "Benim işim ne?" (rota `kulubum`) Rolün hızlı araçları,
 *     sıradaki etkinlik, ilgilenilecekler; kulüpsüz üyeye ve misafire akış.
 *   · Mesajlar → "Bana ne geldi?" Sohbetler, istekler, transfer, disiplin,
 *     maç ve yönetim kutuları; Özet hepsinin sayısını tek bakışta verir.
 *   · Menü     → Üye profili, oyunlar, takip ettiklerin, karşılaştırmalar,
 *     kurallar, iletişim, ayarlar.
 *
 * GİZLİ SEKMELER (`href: null`) — eski derin bağlantılar ve kısayollar:
 *   index → skorlar · maclar → skorlar · favoriler → takip · profil → menu ·
 *   takip (Menü ▸ Takip ettiklerin) · takimlar/oyuncular → ligler ·
 *   oyunlar (oyun merkezi). Sekme çubuğu bu ekranlarda da durur.
 *
 * Çubuğun çizimi `components/ui/GlowTabBar.tsx` içindedir.
 *
 * İlk açılışta (karşılama akışı henüz tamamlanmamışsa) sekmeler yerine
 * /sehir ekranına yönlendirilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { GlowTabBar, type GlowTab } from "@/components/ui";
import { useLiveFavoriteCount } from "@/hooks/useLiveFavoriteCount";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { INTRO_SEEN_KEY } from "@/lib/storage";

/** Uygulama Maçlar ile açılır; "/" (index) yalnız yönlendirmedir. */
export const unstable_settings = { initialRouteName: "skorlar" };

export default function TabsLayout() {
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);

  // Rozet kaynakları: ikisi de kendi içinde "girişsizde sorgu açma" ve
  // "uygulama arka plandayken yoklama yapma" kurallarını uygular.
  const live = useLiveFavoriteCount();
  const unread = useUnreadCount();

  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((value) => setIntroSeen(Boolean(value)))
      .catch(() => setIntroSeen(true)); // Depolama okunamazsa girişte takılı kalma.
  }, []);

  if (introSeen === null) return null; // Bayrak okunana dek kısa boşluk.
  if (!introSeen) return <Redirect href="/sehir" />;

  /** Çubukta görünen sekmeler — SIRA BURADAKİ SIRADIR. */
  const tabs: readonly GlowTab[] = [
    { name: "skorlar", label: "Maçlar", icon: "football", badge: live.count, badgeTone: "live" },
    { name: "ligler", label: "Lig", icon: "trophy", accessibilityLabel: "Lig: puan, fikstür, oyuncular, istatistik, haber" },
    { name: "kulubum", label: "Yönetim", icon: "shield", accessibilityLabel: "Yönetim: takımın, kariyerin ve araçların" },
    // Okunmamış bildirim + sohbet mesajı: hepsi Mesajlar'da.
    { name: "mesajlar", label: "Mesajlar", icon: "chatbubbles", badge: unread.total },
    { name: "menu", label: "Menü", icon: "menu", accessibilityLabel: "Menü: üye profili, oyunlar, ayarlar" },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GlowTabBar {...props} tabs={tabs} />}
    >
      <Tabs.Screen name="skorlar" options={{ title: "Maçlar" }} />
      <Tabs.Screen name="ligler" options={{ title: "Lig" }} />
      <Tabs.Screen name="kulubum" options={{ title: "Yönetim" }} />
      <Tabs.Screen name="mesajlar" options={{ title: "Mesajlar" }} />
      <Tabs.Screen name="menu" options={{ title: "Menü" }} />

      {/* — Çubukta yuvası olmayan, ama bu gruba ait ekranlar —
          Kısayollardan ve derin bağlantılardan açılırlar; sekme
          çubuğu ekranda kalır. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="maclar" options={{ href: null }} />
      <Tabs.Screen name="favoriler" options={{ href: null }} />
      <Tabs.Screen name="takip" options={{ href: null }} />
      <Tabs.Screen name="profil" options={{ href: null }} />
      <Tabs.Screen name="takimlar" options={{ href: null }} />
      <Tabs.Screen name="oyuncular" options={{ href: null }} />
      <Tabs.Screen name="oyunlar" options={{ href: null }} />
    </Tabs>
  );
}
