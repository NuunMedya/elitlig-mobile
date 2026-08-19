import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useEffect, useState } from "react";
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

const ONBOARDING_KEY = "elitlig.onboarding.done.v1";

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setShowOnboarding(!val);
      setReady(true);
    });
  }, []);

  if (!ready) return null;
  if (showOnboarding) {
    const { Redirect } = require("expo-router");
    return (
      <>
        {children}
        <Redirect href="/hosgeldin" />
      </>
    );
  }
  return <>{children}</>;
}

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
        <OnboardingGate>
          <AuthProvider>
            <PushSetup />
            <ScopeProvider>
              <FavoriteProvider>
                <StatusBar style={isDark ? "light" : "dark"} />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.pitch },
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="hosgeldin" />
                  <Stack.Screen name="giris" options={{ presentation: "modal" }} />
                </Stack>
              </FavoriteProvider>
            </ScopeProvider>
          </AuthProvider>
        </OnboardingGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
