import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/constants/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Canlı skor uygulamasında veri çabuk bayatlar
      staleTime: 15_000,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.pitch },
        }}
      />
    </QueryClientProvider>
  );
}
