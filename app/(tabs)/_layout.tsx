/**
 * SEKME ÇUBUĞU — uygulamanın beş ana bölümü.
 *
 * NE: Maçlar · Favoriler · Ligler · Oyunlar · Profil. Eski altı sekmeli
 * ("Genel Bakış / Maçlar / Oyuncular / Puan Tablosu / Menü" + gizli
 * news/profile) düzenin yerini alır.
 *
 * NEDEN BÖYLE: eski düzende "Genel Bakış" hiçbir şeyin gerçek evi değildi ve
 * beş ekranın özetini kopyalıyordu; "Oyuncular" ile "Puan Tablosu" ise aynı
 * kapsama (şehir → lig → sezon) bağlı iki ayrı sekmeydi, kullanıcı kapsamı
 * her sekmede yeniden doğrulamak zorunda kalıyordu. Artık lig verisinin
 * tamamı tek "Ligler" sekmesinin segmentlerinde yaşar, açılış ekranı doğrudan
 * maç listesidir ve boşalan yuvaya uygulamanın gerçek ayrışma noktası olan
 * "Oyunlar" gelir.
 *
 * GÖRSEL KARAR: eski çubuk aktif sekmeyi mor bir hapla dolduruyordu. Mor bu
 * tasarımda geniş yüzey doldurmaz; aktif sekme yalnızca `brandAccent` renkli
 * ikon + etikettir (SofaScore/Maçkolik kalıbı). Rozetler React Navigation'ın
 * `tabBarBadge`'i yerine `TabBarIcon` içinde çizilir — çünkü platform
 * varsayılanı tema paletine uymuyor ve rozetin ikondan ayrılması için gereken
 * zemin rengi halkayı çizemiyor.
 *
 * İlk açılışta (şehir seçim ekranı henüz görülmemişse) sekmeler yerine /sehir
 * harita ekranına yönlendirilir — web'deki "Haritada şehirleri keşfet"
 * girişinin karşılığı.
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
        // Mor hap kaldırıldı: aktif sekmenin zemini de diğerleriyle aynı.
        tabBarActiveBackgroundColor: colors.tabBar,
        tabBarLabelStyle: { ...type.caption, letterSpacing: 0 },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.tabBarBorder,
          // Yükseklik cihazın alt güvenli alanına göre büyür; etiketler home
          // göstergesinin altına itilmez.
          height: layout.tabBarHeight + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
        },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Maçlar", tabBarIcon: tabIcon("football") }} />
      <Tabs.Screen
        name="favoriler"
        options={{ title: "Favoriler", tabBarIcon: tabIcon("star", live.count) }}
      />
      <Tabs.Screen name="ligler" options={{ title: "Ligler", tabBarIcon: tabIcon("trophy") }} />
      <Tabs.Screen
        name="oyunlar"
        options={{ title: "Oyunlar", tabBarIcon: tabIcon("game-controller") }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: "Profil", tabBarIcon: tabIcon("person-circle", unread.total) }}
      />
    </Tabs>
  );
}
