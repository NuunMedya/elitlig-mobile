import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CallScreen } from "@/components/CallScreen";
import { CrashCatcher } from "@/components/CrashCatcher";
import { ScopeSheet } from "@/components/ScopeSheet";
import { ToastProvider } from "@/components/ui";
import { useNotificationBridge } from "@/hooks/useNotificationBridge";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useChatRealtime } from "@/hooks/useChat";
import { CallProvider } from "@/providers/CallProvider";
import { ApiError } from "@/lib/http";
import { AuthProvider } from "@/providers/AuthProvider";
import { FavoriteProvider } from "@/providers/FavoriteProvider";
import { FollowFlowProvider } from "@/providers/FollowFlowProvider";
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
 *   FollowFlow       → "Takip et" sonrası bildirim türleri alt sayfası; toast
 *                      ve favorileri okuduğu için ikisinin altında.
 *
 * TEK ÖRNEK KURALI — kaplamalar burada BİR KEZ mount edilir:
 *   `<ScopeSheet />`     Lig seçicinin (LeaguePicker) alt sayfası; açma/kapama
 *                        ScopeProvider üstünden.
 *   Takip alt sayfası    FollowFlowProvider'ın kendi içinde.
 * Stack'in DIŞINDA ve SONRASINDA dururlar: yığındaki hiçbir ekran bunların
 * üstünü örtemez. (Yüzen sohbet düğmesi `MessageSticker` kaldırıldı; mesajlar
 * Profil ▸ Gelen kutusu'ndadır.)
 */

/**
 * React Query'nin "odak" kavramı uygulamanın ön planda olmasına bağlanır.
 * RN'de varsayılan dinleyici (tarayıcı visibilitychange) çalışmaz ve odak hep
 * "açık" sayılırdı: refetchInterval'lar arka planda da istek atıyordu. Artık
 * uygulama arka plana geçince bütün yoklamalar durur (refetchIntervalInBackground
 * false). refetchOnWindowFocus kapalı olduğu için öne dönüşte toplu tazeleme
 * patlaması OLMAZ; aralıklar kaldığı yerden sürer.
 */
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
    handleFocus(state === "active");
  });
  return () => subscription.remove();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Canlı skor uygulamasında veri çabuk bayatlar.
      staleTime: 15_000,
      // http katmanı geçici ağ hatalarını (0/502/504) zaten yeniden deniyor;
      // burada en çok BİR tekrar. 503/429 (sunucu aşırı yükte / DB kotası) ve
      // 4xx asla tekrarlanmaz: her tekrar sunucunun saatlik sorgu kotasını
      // yakıp servisi daha uzun süre düşürür.
      retry: (failureCount, error) =>
        error instanceof ApiError &&
        error.status >= 500 &&
        !error.isOverloaded &&
        failureCount < 1,
      refetchOnWindowFocus: false,
      // Uygulama arka plandayken yoklama yok (bkz. focusManager yukarıda).
      refetchIntervalInBackground: false,
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
    <CrashCatcher>
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationSetup />
          <ChatRealtimeSetup />
          <ScopeProvider>
            <FavoriteProvider>
              <ToastProvider>
               <FollowFlowProvider>
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

                  {/* Eski /canli: Skorlar ▸ Canlı ▸ Tüm şehirler'e yönlendirir. */}
                  <Stack.Screen name="canli" options={{ animation: "none" }} />

                  {/* Gelen kutusu (Bildirimler | Mesajlar) ve tek Ayarlar ekranı. */}
                  <Stack.Screen name="gelen-kutusu" />
                  <Stack.Screen name="ayarlar" />

                  {/* Ayar ve hesap ekranları — klasik detay geçişi. */}
                  <Stack.Screen name="bildirim-tercihleri" />
                  <Stack.Screen name="takip-bildirimleri" />
                  <Stack.Screen name="hesabim" />
                  <Stack.Screen name="sifre-degistir" />
                  <Stack.Screen name="hesap-sil" />
                  <Stack.Screen name="engellenenler" />

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
                  <Stack.Screen name="oyuncum/bagla" />
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
                  {/* Yönetim: görevler, yeni görev ve web panelindeki tüm araçlar. */}
                  <Stack.Screen name="yonetim/gorevler" />
                  <Stack.Screen name="yonetim/gorev-yeni" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="yonetim/web" />

                  {/* Modal olanlar: bir görevi bitirip kapanan, yığına ait olmayan ekranlar. */}
                  <Stack.Screen name="ara" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="giris" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="kayit" options={{ presentation: "modal", animation: "slide_from_bottom", gestureEnabled: false }} />
                  <Stack.Screen name="sifremi-unuttum" options={{ presentation: "modal", animation: "slide_from_bottom", gestureEnabled: false }} />
                </Stack>

                {/* Kapsam seçici — uygulamada TEK örnek. */}
                <ScopeSheet />

                {/* Sesli arama katmanı: gelen arama hangi ekranda olunursa
                    olunsun üstte açılır (CallProvider kökte). */}
                <CallScreen />
               </CallProvider>
               </FollowFlowProvider>
              </ToastProvider>
            </FavoriteProvider>
          </ScopeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
    </CrashCatcher>
  );
}
