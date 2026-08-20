import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ScopeSheet } from "@/components/ScopeSheet";
import { ToastProvider } from "@/components/ui";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { ApiError } from "@/lib/http";
import { AuthProvider } from "@/providers/AuthProvider";
import { FavoriteProvider } from "@/providers/FavoriteProvider";
import { ScopeProvider } from "@/providers/ScopeProvider";
import { colors, isDark } from "@/theme";

/**
 * Uygulamanın kökü: sağlayıcı sırası ve gezinme yığını.
 *
 * SAĞLAYICI SIRASI NEDEN BÖYLE:
 *   SafeAreaProvider → Toast ve BottomSheet güvenli alan ölçüsü okur.
 *   QueryClient      → altındaki her sağlayıcı sorgu açabilsin.
 *   Auth             → kapsam ve favori senkronu oturuma bağlı.
 *   Scope            → ScopeSheet ve ekranlar kapsamı okur.
 *   Favorite         → rozetler (canlı favori sayısı) favorileri okur.
 *   Toast            → en altta: her ekranın üstünde tek katman.
 *
 * TEK ÖRNEK KURALI: `<ScopeSheet />` burada BİR KEZ mount edilir. Beş ekranın
 * her birinin kendi modalını yaratması hem belleği hem de "hangi sayfa açık"
 * durumunu çoğaltıyordu; artık açma/kapama ScopeProvider üstünden yapılır.
 */

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
  usePushNotifications();
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
              <ToastProvider>
                <StatusBar style={isDark ? "light" : "dark"} />
                <Stack
                  initialRouteName="hosgeldin"
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bg },
                    // Varsayılan: detay ekranı sağdan girer, geri tuşu sola çıkar —
                    // "içeri girdim / geri çıktım" hissi yığın derinliğini anlatır.
                    animation: "slide_from_right",
                  }}
                >
                  {/* Kök: sekme çubuğu. Yığının dibi olduğu için kaydırma değil, sönüm. */}
                  <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />

                  {/* Karşılama — animasyonsuz açılır, arkasında bir şey yok. */}
                  <Stack.Screen name="hosgeldin" options={{ animation: "none" }} />

                  {/* Canlı maç merkezi: sürekli değişen akış, geri dönüşü sık. */}
                  <Stack.Screen name="canli" />

                  {/* Ayar ve hesap ekranları — klasik detay geçişi. */}
                  <Stack.Screen name="bildirim-tercihleri" />
                  <Stack.Screen name="hesabim" />

                  {/* Modal olanlar: bir görevi bitirip kapanan, yığına ait olmayan ekranlar. */}
                  <Stack.Screen name="ara" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="giris" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                </Stack>

                {/* Kapsam seçici — uygulamada TEK örnek. */}
                <ScopeSheet />
              </ToastProvider>
            </FavoriteProvider>
          </ScopeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
