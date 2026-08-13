import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { colors } from "@/constants/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.turf,
        tabBarInactiveTintColor: colors.muted,
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="football" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="standings"
        options={{
          title: "Puan Durumu",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="podium" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: "Takımlar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-half" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
