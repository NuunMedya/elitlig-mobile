/**
 * SEKME ÇUBUĞU — uygulamanın altı ana bölümü.
 *
 * NE: Genel Bakış · Maçlar · Takımlar · Oyuncular · Profil · Menü.
 *
 * NEDEN GENEL BAKIŞ GERİ GELDİ: beş sekmeli düzende açılış ekranı doğrudan maç
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
 * GÖRSEL KARAR: altı yuvada etiket 10px'e iner ve ikon 21px olur; aktif sekme
 * `brandAccent` ikon + etiket ve ikonun 2px üstünde `brand` gösterge çizgisidir
 * (dolgu hap yok — mor geniş yüzey doldurmaz).
 *
 * İlk açılışta (şehir seçim ekranı henüz görülmemişse) sekmeler yerine /sehir
 * harita ekranına yönlendirilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBarIcon } from "@/components/ui";
import { useLiveFavoriteCount } from "@/hooks/useLiveFavoriteCount";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { INTRO_SEEN_KEY } from "@/lib/storage";
import { colors, layout, type } from "@/theme";

/** Sekme ikonu üreticisi — rozet yalnız verildiğinde çizilir. */
function tabIcon(name: React.ComponentProps<typeof TabBarIcon>["name"], badge?: number) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <TabBarIcon
      name={name}
      color={color}
      focused={focused}
      size={21}
      indicator
      badge={badge && badge > 0 ? badge : undefined}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandAccent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarActiveBackgroundColor: colors.tabBar,
        /* Altı yuvada bir sekmeye ~65px düşüyor. En uzun etiket "Oyuncular";
           10px punto + NEGATİF harf aralığı + sıfır yatay dolgu ile tek satıra
           sığar. Varsayılan `micro` aralığı (+0.4) ile son harf kırpılıyordu. */
        tabBarLabelStyle: {
          ...type.micro,
          letterSpacing: -0.4,
          marginTop: 2,
          marginBottom: 0,
          marginHorizontal: 0,
          paddingHorizontal: 0,
        },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.tabBarBorder,
          /* ÖLÇÜ: ikon kutusu 21px glif, etiket 13px satır yüksekliği,
             aralarında 2px = 43px içerik (ikon kutusu glifin kendisinden
             büyüktür: yazı tipi satır kutusu ~28px). Çubuk 60px ve dikey iç
             boşluk 4+4 → 52px kullanılabilir alan. Öğe başına gelen 5px varsayılan
             dolgu etiketin alt kesimini kırptığı için sıfırlanır. */
          height: layout.tabBarHeight + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 4,
        },
        tabBarItemStyle: { paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Genel", tabBarIcon: tabIcon("home"), tabBarAccessibilityLabel: "Genel Bakış" }}
      />
      <Tabs.Screen
        name="maclar"
        options={{ title: "Maçlar", tabBarIcon: tabIcon("football", live.count) }}
      />
      <Tabs.Screen name="takimlar" options={{ title: "Takımlar", tabBarIcon: tabIcon("shield") }} />
      <Tabs.Screen name="oyuncular" options={{ title: "Oyuncular", tabBarIcon: tabIcon("people") }} />
      <Tabs.Screen
        name="profil"
        options={{ title: "Profil", tabBarIcon: tabIcon("person-circle", unread.total) }}
      />
      <Tabs.Screen name="menu" options={{ title: "Menü", tabBarIcon: tabIcon("grid") }} />

      {/* — Çubukta yuvası olmayan, ama bu gruba ait ekranlar —
          Menü'den açılırlar; sekme çubuğu ekranda kalır. */}
      <Tabs.Screen name="ligler" options={{ href: null }} />
      <Tabs.Screen name="favoriler" options={{ href: null }} />
      <Tabs.Screen name="oyunlar" options={{ href: null }} />
    </Tabs>
  );
}
