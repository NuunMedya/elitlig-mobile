import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { colors, type } from "@/constants/theme";

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
        options={{
          title: "Genel Bakış",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Maçlar",
          tabBarIcon: ({ color, size }) => <Ionicons name="football" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: "Oyuncular",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="standings"
        options={{
          title: "Puan Tablosu",
          tabBarIcon: ({ color, size }) => <Ionicons name="podium" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menü",
          tabBarIcon: ({ color, size }) => <Ionicons name="menu" size={size} color={color} />,
        }}
      />
      {/* Sekme çubuğunda görünmez; Menü üzerinden ulaşılır. */}
      <Tabs.Screen name="news" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
