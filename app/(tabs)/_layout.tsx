/**
 * SEKME ÇUBUĞU — uygulamanın beş ana bölümü.
 *
 * NE: Ana Sayfa · Maçlar · Lig · Kulübüm · Profil.
 *
 * BİLGİ MİMARİSİ (bu turun kararı) — her bölüm tek bir soruyu yanıtlar:
 *   · Ana Sayfa → "Şu an ne oluyor?" Kapsam şeridi, canlı ve yaklaşan maç
 *     kartları, takip ettiğin takımlar, puan özeti, haberler.
 *   · Maçlar    → "Hangi gün kim kiminle?" Gün şeridi + lig gruplu maç kartları.
 *   · Lig       → "Ligde durum ne?" İl · lig · sezon şeridi ve yedi sekme:
 *     Puan · Fikstür · Takımlar · Oyuncular · İstatistik · Haber · Arşiv.
 *     Eskiden Takımlar ve Oyuncular ayrı sekmelerdi, Ligler ise Profil →
 *     Menü'nün altında gizliydi; üçü de aynı kapsama bağlı olduğu için tek
 *     bölümde birleşti.
 *   · Kulübüm   → "Benim işim ne?" Takım başkanı, oyuncu ve lig yönetimi
 *     araçları rol bazlı ızgaralarda; takip ettiğin takımlar.
 *   · Profil    → "Hesabım ve tercihlerim." Takip, bildirim yönetimi,
 *     oyunlar, bilgi ve ayarlar.
 *
 * GİZLİ SEKMELER (`href: null`): takimlar · oyuncular (Lig'e yönlendirir),
 * favoriler · oyunlar · menu. Bu gruba ait kalırlar ki açıldıklarında sekme
 * çubuğu ekranda dursun; eski derin bağlantılar çalışmaya devam eder.
 *
 * Çubuğun çizimi `components/ui/GlowTabBar.tsx` içindedir.
 *
 * İlk açılışta (şehir seçim ekranı henüz görülmemişse) sekmeler yerine /sehir
 * harita ekranına yönlendirilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { GlowTabBar, type GlowTab } from "@/components/ui";
import { useLiveFavoriteCount } from "@/hooks/useLiveFavoriteCount";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { INTRO_SEEN_KEY } from "@/lib/storage";

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
    { name: "index", label: "Ana Sayfa", icon: "home" },
    { name: "maclar", label: "Maçlar", icon: "football", badge: live.count },
    { name: "ligler", label: "Lig", icon: "trophy", accessibilityLabel: "Lig: puan, fikstür, takımlar, oyuncular" },
    { name: "kulubum", label: "Kulübüm", icon: "shield", badge: unread.total },
    { name: "profil", label: "Profil", icon: "person-circle" },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GlowTabBar {...props} tabs={tabs} />}
    >
      <Tabs.Screen name="index" options={{ title: "Ana Sayfa" }} />
      <Tabs.Screen name="maclar" options={{ title: "Maçlar" }} />
      <Tabs.Screen name="ligler" options={{ title: "Lig" }} />
      <Tabs.Screen name="kulubum" options={{ title: "Kulübüm" }} />
      <Tabs.Screen name="profil" options={{ title: "Profil" }} />

      {/* — Çubukta yuvası olmayan, ama bu gruba ait ekranlar —
          Kısayollardan ve derin bağlantılardan açılırlar; sekme
          çubuğu ekranda kalır. */}
      <Tabs.Screen name="menu" options={{ href: null }} />
      <Tabs.Screen name="takimlar" options={{ href: null }} />
      <Tabs.Screen name="oyuncular" options={{ href: null }} />
      <Tabs.Screen name="favoriler" options={{ href: null }} />
      <Tabs.Screen name="oyunlar" options={{ href: null }} />
    </Tabs>
  );
}
