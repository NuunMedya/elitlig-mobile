import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { colors, isDark, type } from "@/constants/theme";
import { INTRO_SEEN_KEY } from "@/lib/storage";

/**
 * Alt menü. Pasif sekmede çizgili (outline), aktif sekmede dolu ikon.
 *
 * İlk açılışta (şehir seçim ekranı henüz görülmemişse) sekmeler yerine
 * /sehir harita ekranına yönlendirilir — web'deki "Haritada şehirleri
 * keşfet" girişinin karşılığı.
 */
function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  const outline = `${name}-outline` as keyof typeof Ionicons.glyphMap;
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? name : outline} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);

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
        // Koyu marka çerçevesi: her iki temada da sitenin koyu moru;
        // aktif sekme mor hap içinde beyaz yanar.
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: isDark ? "#9A8FB8" : colors.muted,
        tabBarActiveBackgroundColor: colors.turf,
        tabBarLabelStyle: { ...type.caption, letterSpacing: 0, fontSize: 10 },
        // Yükseklik cihazın alt güvenli alanına göre hesaplanır; böylece
        // etiketler home göstergesinin altına itilmez.
        tabBarStyle: {
          backgroundColor: isDark ? "#17102B" : colors.surface,
          borderTopWidth: isDark ? 0 : 1,
          borderTopColor: colors.faint,
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
        tabBarItemStyle: {
          borderRadius: 16,
          marginHorizontal: 4,
          overflow: "hidden",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Genel Bakış", tabBarIcon: tabIcon("home") }}
      />
      <Tabs.Screen
        name="matches"
        options={{ title: "Maçlar", tabBarIcon: tabIcon("football") }}
      />
      <Tabs.Screen
        name="players"
        options={{ title: "Oyuncular", tabBarIcon: tabIcon("shirt") }}
      />
      <Tabs.Screen
        name="standings"
        options={{ title: "Puan Tablosu", tabBarIcon: tabIcon("podium") }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menü",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
      {/* Sekme çubuğunda görünmez; Menü üzerinden ulaşılır. */}
      <Tabs.Screen name="news" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
