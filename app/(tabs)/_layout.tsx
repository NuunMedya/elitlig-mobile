/**
 * SEKME ÇUBUĞU — uygulamanın beş ana bölümü.
 *
 * NE: Skorlar · Takip · Lig · Kulübüm · Profil. Uygulama SKORLAR ile açılır.
 *
 * BİLGİ MİMARİSİ — her bölüm tek bir soruyu yanıtlar:
 *   · Skorlar → "Şu an ve bugün ne oynanıyor?" Tek lig seçici, gün şeridi,
 *     Tümü/Canlı/Bitti/Yaklaşan; en üstte takip ettiklerin, sonra sabitlenen
 *     ligler. Takip edilen takımın canlı/bugünkü maçı varsa grafit vitrin.
 *     (Eski Ana Sayfa'nın vitrin ve canlı/bugün bölümleri, eski /canli.)
 *   · Takip   → "Benim takımlarım ne yapıyor?" Takımlarım şeridi, sıradaki/son
 *     maç kartları, takip edilenlere süzülmüş haber akışı, ligler ve maçlar.
 *     Her öğede zil: o takibin bildirim türleri. (Eski Favoriler.)
 *   · Lig     → "Ligde durum ne?" Puan · Fikstür · Oyuncular · İstatistik ·
 *     Haber. Geçmiş sezonlar lig seçicinin sezon adımında.
 *   · Kulübüm → "Benim işim ne?" Sıradaki etkinlik, rol araçları, takım
 *     sohbeti; kulüpsüz üyeye ve misafire eylem akışı.
 *   · Profil  → "Hesabım." Gelen kutusu (Bildirimler | Mesajlar), oyunlar,
 *     tek Ayarlar ekranı.
 *
 * GİZLİ SEKMELER (`href: null`) — eski derin bağlantılar için yönlendirme:
 *   index → skorlar · maclar → skorlar · favoriler → takip ·
 *   takimlar/oyuncular → ligler · menu → profil · oyunlar (oyun merkezi).
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

/** Uygulama Skorlar ile açılır; "/" (index) yalnız yönlendirmedir. */
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
    { name: "skorlar", label: "Skorlar", icon: "football", badge: live.count },
    { name: "takip", label: "Takip", icon: "star", accessibilityLabel: "Takip: takımların, ligler ve maçlar" },
    { name: "ligler", label: "Lig", icon: "trophy", accessibilityLabel: "Lig: puan, fikstür, oyuncular, istatistik, haber" },
    { name: "kulubum", label: "Kulübüm", icon: "shield" },
    // Okunmamış bildirim + mesaj: gelen kutusu Profil'de.
    { name: "profil", label: "Profil", icon: "person-circle", badge: unread.total },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GlowTabBar {...props} tabs={tabs} />}
    >
      <Tabs.Screen name="skorlar" options={{ title: "Skorlar" }} />
      <Tabs.Screen name="takip" options={{ title: "Takip" }} />
      <Tabs.Screen name="ligler" options={{ title: "Lig" }} />
      <Tabs.Screen name="kulubum" options={{ title: "Kulübüm" }} />
      <Tabs.Screen name="profil" options={{ title: "Profil" }} />

      {/* — Çubukta yuvası olmayan, ama bu gruba ait ekranlar —
          Kısayollardan ve derin bağlantılardan açılırlar; sekme
          çubuğu ekranda kalır. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="maclar" options={{ href: null }} />
      <Tabs.Screen name="favoriler" options={{ href: null }} />
      <Tabs.Screen name="menu" options={{ href: null }} />
      <Tabs.Screen name="takimlar" options={{ href: null }} />
      <Tabs.Screen name="oyuncular" options={{ href: null }} />
      <Tabs.Screen name="oyunlar" options={{ href: null }} />
    </Tabs>
  );
}
