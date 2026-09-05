import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CallScreen } from "@/components/CallScreen";
import { MessageSticker } from "@/components/MessageSticker";
import { ScopeSheet } from "@/components/ScopeSheet";
import { ToastProvider } from "@/components/ui";
import { useNotificationBridge } from "@/hooks/useNotificationBridge";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useChatRealtime } from "@/hooks/useChat";
import { CallProvider } from "@/providers/CallProvider";
import { ApiError } from "@/lib/http";
import { AuthProvider } from "@/providers/AuthProvider";
import { FavoriteProvider } from "@/providers/FavoriteProvider";
import { ScopeProvider } from "@/providers/ScopeProvider";
import { colors } from "@/theme";

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
 * TEK ÖRNEK KURALI — iki kaplama burada BİR KEZ mount edilir:
 *   `<ScopeSheet />`     Beş ekranın her birinin kendi modalını yaratması hem
 *                        belleği hem de "hangi sayfa açık" durumunu
 *                        çoğaltıyordu; açma/kapama ScopeProvider üstünden.
 *   `<MessageSticker />` Yüzen mesaj balonu her ekranda görünmeli ama ekran
 *                        değiştikçe yeniden yaratılmamalı — kullanıcının
 *                        sürüklediği konum ekranlar arasında korunuyor.
 * İkisi de Stack'in DIŞINDA ve SONRASINDA durur: yığındaki hiçbir ekran
 * bunların üstünü örtemez.
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

/**
 * Bildirim altyapısı — iki bağımsız yol, tek yerde.
 *
 *   usePushNotifications  Uzak push: token kaydı, dokunma yönlendirmesi,
 *                         soğuk açılış yanıtı.
 *   useNotificationBridge Yerel köprü: push zinciri kurulu olmasa bile
 *                         bildirimleri telefonda gösterir (bkz. o dosyanın
 *                         başlığı). İkisi `lib/notificationLedger.ts` üstünden
 *                         haberleşir ve aynı bildirimi iki kez göstermez.
 *
 * Hiçbir şey çizmez; yalnız kancaları kökte bir kez çalıştırmak içindir.
 */
function NotificationSetup() {
  usePushNotifications();
  useNotificationBridge();
  return null;
}

/** Sohbet soketi → React Query önbelleği köprüsü (tek örnek). */
function ChatRealtimeSetup() {
  useChatRealtime();
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationSetup />
          <ChatRealtimeSetup />
          <ScopeProvider>
            <FavoriteProvider>
              <ToastProvider>
               <CallProvider>
                {/* DAİMA AÇIK: her ekranın tepesinde koyu mor blok var (bkz.
                    components/ui/ScreenHeader.tsx), tema ne olursa olsun
                    durum çubuğu simgeleri o bloğun üstünde duruyor. */}
                <StatusBar style="light" />
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
                  <Stack.Screen name="hesap-sil" />

                  {/* Takım paneli alt ekranları — detay geçişi. */}
                  <Stack.Screen name="takimim/mac-al" />
                  <Stack.Screen name="takimim/mac/[matchId]" />

                  {/* Kariyer belgeleri ve oyuncu paneli.
                      Bunlar bildirimden DERİN BAĞLANTIYLA açılır (TRANSFER_*,
                      CONTRACT_*, PENALTY_* → lib/notifications.ts), bu yüzden
                      yığında adlarıyla anılırlar. Rota adı dosya yolunun
                      kendisidir: klasör altındaki `index.tsx` "klasör/index"
                      olarak kaydolur. */}
                  <Stack.Screen name="oyuncum/index" />
                  <Stack.Screen name="teklif/[id]" />
                  <Stack.Screen name="sozlesme/[id]" />
                  <Stack.Screen name="ceza/[id]" />

                  {/* Sohbet: WhatsApp mantığında mesajlaşma + sesli arama.
                      Bildirim ve push derin bağlantıları (CHAT_MESSAGE,
                      CALL_INCOMING) doğrudan sohbete iner. */}
                  <Stack.Screen name="sohbet/index" />
                  <Stack.Screen name="sohbet/[id]" />
                  <Stack.Screen name="sohbet/yeni" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="yonetim/sohbet/index" />
                  <Stack.Screen name="yonetim/sohbet/[id]" />
                  <Stack.Screen name="yonetim/sohbet/yeni" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="yonetim/kayitlar" />

                  {/* Modal olanlar: bir görevi bitirip kapanan, yığına ait olmayan ekranlar. */}
                  <Stack.Screen name="ara" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="giris" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                </Stack>

                {/* Kapsam seçici — uygulamada TEK örnek. */}
                <ScopeSheet />

                {/* Mesaj balonu — her ekranın üstünde duran tek örnek.
                    Stack'in DIŞINDA ve SONRASINDA mount edilir: ekran değişse
                    de yeniden yaratılmaz, konumu ve sürükleme durumu korunur. */}
                <MessageSticker />

                {/* Sesli arama katmanı: gelen arama hangi ekranda olunursa
                    olunsun üstte açılır (CallProvider kökte). */}
                <CallScreen />
               </CallProvider>
              </ToastProvider>
            </FavoriteProvider>
          </ScopeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
