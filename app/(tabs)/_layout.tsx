/**
 * SEKME ÇUBUĞU — uygulamanın altı ana bölümü.
 *
 * NE: Genel Bakış · Maçlar · Takımlar · Oyuncular · Profil · Menü.
 *
 * NEDEN GENEL BAKIŞ VAR: beş sekmeli düzende açılış ekranı doğrudan maç
 * listesiydi ve uygulamanın geri kalanı (takım paneli, kadro, maç talepleri,
 * mesajlar, bildirimler) yalnızca Profil sekmesinin altındaki liste
 * satırlarından ulaşılabiliyordu. Takım başkanı için asıl iş orada; her açılışta
 * iki dokunuş öteye düşüyordu. Genel Bakış bu iki dokunuşu sıfırlar: kullanıcının
 * ŞU AN önemsediği maç en üstte, işini yaptığı dört kısayol hemen altında.
 *
 * NEDEN ALTI SEKME: "Takımlar" ile "Oyuncular" eskiden tek "Ligler" sekmesinin
 * segmentleriydi. Segment, sekme çubuğundan bir kademe aşağıdadır: kullanıcı
 * önce doğru sekmeyi, sonra doğru segmenti bulmak zorundaydı ve segment seçimi
 * ekran değişince unutuluyordu. İkisi de uygulamanın birinci sınıf varlıkları
 * olduğu için kendi sekmelerine çıktı.
 *
 * NEDEN OYUNLAR MENÜYE İNDİ: oyunlar günde bir kez, keyif için açılır; maç
 * takibi gün boyu açılır. Kalıcı sekme çubuğundaki bir yuva "günde bir"lik bir
 * işe ayrılamaz. Oyunlar rota olarak DURUYOR (`/(tabs)/oyunlar`), yalnız
 * çubuktan kaldırıldı; Menü'nün en üstünde ilk sırada.
 *
 * GİZLİ SEKMELER (`href: null`): ligler · favoriler · oyunlar. Bu üçü hâlâ bu
 * gruba aittir — böylece açıldıklarında sekme çubuğu ekranda kalır ve kullanıcı
 * tek dokunuşla ana bölüme dönebilir — ama çubukta yuvaları yoktur. Rotaları
 * değişmediği için mevcut derin bağlantılar (bildirimler, haber kartları)
 * olduğu gibi çalışmaya devam eder.
 *
 * ÇUBUĞUN KENDİSİ ARTIK ÖZEL: platformun düz şeridi yerine ekranın altında
 * YÜZEN koyu mor bir hap ve seçili sekmeye YAYLANARAK uzanan bir ışık
 * kullanılır. Çizimin tamamı `components/ui/GlowTabBar.tsx` içindedir; burası
 * yalnız hangi sekmelerin görüneceğini ve rozetlerin nereden geldiğini söyler.
 *
 * NEDEN SEKME LİSTESİ BURADA AÇIKÇA YAZILI: `href: null` ile gizlenen rotalar
 * gezinme durumunda durmaya devam eder ve expo-router onları yalnız bir stil
 * hilesiyle saklar. Özel çubuğun bu iç ayrıntıyı okuması kırılgan olurdu;
 * görünen sekmeler tek bir dizide, sırasıyla tanımlanır.
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
    { name: "index", label: "Genel", icon: "home", accessibilityLabel: "Genel Bakış" },
    { name: "maclar", label: "Maçlar", icon: "football", badge: live.count },
    { name: "takimlar", label: "Takımlar", icon: "shield" },
    { name: "oyuncular", label: "Oyuncular", icon: "people" },
    { name: "profil", label: "Profil", icon: "person-circle", badge: unread.total },
    { name: "menu", label: "Menü", icon: "grid" },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GlowTabBar {...props} tabs={tabs} />}
    >
      <Tabs.Screen name="index" options={{ title: "Genel" }} />
      <Tabs.Screen name="maclar" options={{ title: "Maçlar" }} />
      <Tabs.Screen name="takimlar" options={{ title: "Takımlar" }} />
      <Tabs.Screen name="oyuncular" options={{ title: "Oyuncular" }} />
      <Tabs.Screen name="profil" options={{ title: "Profil" }} />
      <Tabs.Screen name="menu" options={{ title: "Menü" }} />

      {/* — Çubukta yuvası olmayan, ama bu gruba ait ekranlar —
          Menü'den açılırlar; sekme çubuğu ekranda kalır. */}
      <Tabs.Screen name="ligler" options={{ href: null }} />
      <Tabs.Screen name="favoriler" options={{ href: null }} />
      <Tabs.Screen name="oyunlar" options={{ href: null }} />
    </Tabs>
  );
}
