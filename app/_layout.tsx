import { usePushNotifications } from "@/hooks/usePushNotifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { isDark } from "@/constants/theme";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/constants/theme";
import { ApiError } from "@/lib/http";
import { AuthProvider } from "@/providers/AuthProvider";
import { FavoriteProvider } from "@/providers/FavoriteProvider";
import { ScopeProvider } from "@/providers/ScopeProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Canlı skor uygulamasında veri çabuk bayatlar.
      staleTime: 15_000,
      // http katmanı ağ hatalarını zaten yeniden deniyor; burada tekrarlamak
      // yalnızca hatanın ekrana düşmesini geciktirir. 4xx hiç denenmemeli.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.status >= 500 && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PushSetup() {
  // @ts-ignore
  const getToken = () => { try { return require("expo-secure-store").getItemAsync("elitlig_token"); } catch { return null; } };
  usePushNotifications(null);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
            <PushSetup />
            <ScopeProvider>
              <FavoriteProvider>
                <StatusBar style={isDark ? "light" : "dark"} />
                <Stack
                  initialRouteName="hosgeldin"
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.pitch },
                    animation: "fade",
                  }}
                >
                  <Stack.Screen name="favorilerim" />
                  <Stack.Screen name="hosgeldin" options={{ animation: "none" }} />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="giris" options={{ presentation: "modal" }} />
                </Stack>
              </FavoriteProvider>
            </ScopeProvider>
          </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
