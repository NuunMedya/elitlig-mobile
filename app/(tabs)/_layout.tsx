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
          title: "Maçlar",
          tabBarIcon: ({ color, size }) => <Ionicons name="football" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="standings"
        options={{
          title: "Puan Durumu",
          tabBarIcon: ({ color, size }) => <Ionicons name="podium" size={size} color={color} />,
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
        name="news"
        options={{
          title: "Haberler",
          tabBarIcon: ({ color, size }) => <Ionicons name="newspaper" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
