import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/constants/theme";
import { ApiError } from "@/lib/http";
import { AuthProvider } from "@/providers/AuthProvider";
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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ScopeProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.pitch },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="giris" options={{ presentation: "modal" }} />
            </Stack>
          </ScopeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
