import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { colors, type } from "@/constants/theme";

/**
 * Alt menü. Pasif sekmede çizgili (outline), aktif sekmede dolu ikon —
 * kullanıcı hangi sekmede olduğunu ikondan da anlar.
 */
function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  const outline = `${name}-outline` as keyof typeof Ionicons.glyphMap;
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? name : outline} size={size} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.turf,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { ...type.caption, letterSpacing: 0 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.faint,
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
          // ellipsis'in outline çifti yok; iki durumda da aynı ikon kalır.
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
