/**
 * YEREL BİLDİRİM KÖPRÜSÜ — push altyapısı olmadan da bildirim gösterir.
 *
 * SORUN: "bildirimler gelmiyor" şikâyetinin kaynağı neredeyse hiçbir zaman
 * sunucu kodu değildir. Sunucu bildirimi üretir (models/PanelNotification.js
 * afterCreate → services/NotificationService.js → Expo) ama teslimat zinciri
 * uygulamanın DIŞINDA üç yerde kopabilir:
 *   · Expo Go'da uzak bildirim SDK 53'ten beri hiç desteklenmiyor.
 *   · EAS projesinde Android için FCM v1 servis hesabı ya da iOS için APNs
 *     anahtarı tanımlı değilse Expo mesajı teslim edemez.
 *   · Kullanıcı izin vermediyse ya da token sunucuya yazılamadıysa gönderilecek
 *     bir cihaz yoktur.
 * Bu üç durumun üçünde de bildirim SUNUCUDA VARDIR, yalnız telefonda görünmez.
 *
 * ÇÖZÜM: bildirim merkezini (`GET /api/panel-notifications`) yoklayıp yeni
 * kayıtları YEREL bildirim olarak göstermek. Yerel bildirim yalnız işletim
 * sistemi iznine ihtiyaç duyar — FCM, APNs, EAS projectId ya da internet
 * üzerinden teslimat gerekmez. Böylece push kurulu olmasa bile kullanıcı
 * telefonun bildirim gölgesinde bildirimi görür ve dokununca doğru ekrana gider.
 *
 * SINIRI AÇIKÇA SÖYLEMEK GEREKİR: uygulama tamamen kapalıyken JavaScript
 * çalışmaz, dolayısıyla köprü de çalışmaz. Köprü "uygulama açıkken anında,
 * kapalıyken açılışta" teslim eder. Gerçek anlık teslimat için push zinciri
 * kurulmalıdır; köprü onun yerine geçmez, YOKLUĞUNDA devreye girer.
 *
 * ÇİFT GÖSTERİM: push zinciri çalışıyorsa aynı bildirim hem push hem köprü
 * yoluyla gelirdi. Bunu `lib/notificationLedger.ts` engeller — uzak push
 * geldiğinde kimlik deftere yazılır, köprü yazılmış kimlikleri atlar.
 *
 * İLK ÇALIŞTIRMA: kullanıcı uygulamayı ilk kurduğunda bildirim merkezinde
 * zaten 50 kayıt olabilir. Bunların hepsini bildirim olarak göstermek telefonu
 * bombalardı. Bu yüzden ilk okumada hiçbir şey gösterilmez, yalnız "en yüksek
 * görülen kimlik" işareti kurulur; teslimat bir sonraki yeni bildirimden başlar.
 *
 * YOKLAMA DİSİPLİNİ: yalnız uygulama ÖN PLANDAYKEN ve oturum açıkken yoklanır.
 * Arka planda yoklama yapmak pili boşaltır ve zaten bir işe yaramaz (bildirim
 * gösterilse bile kullanıcı uygulamayı açana dek JS uyanmaz).
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { getPanelNotifications, type PanelNotification } from "@/lib/api/panel";
import { ApiError } from "@/lib/http";
import { deliveredIds, markManyDelivered } from "@/lib/notificationLedger";
import { CHANNELS, shouldPlaySoundFor } from "@/lib/notifications";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Ön planda yoklama aralığı. 45 sn: tazelik ile pil arasındaki denge. */
const POLL_MS = 45_000;

/** Tek turda en fazla kaç bildirim gösterilir. */
const MAX_PER_ROUND = 5;

/** "En yüksek görülen kimlik" işareti — üye başına ayrı tutulur. */
const watermarkKey = (userId: number | string) => `elitlig.notifBridge.watermark.${userId}`;

/**
 * Bildirimi yerel olarak gösterir.
 *
 * Veri yükü UZAK PUSH'LA BİREBİR AYNI biçimdedir (`notification_id`, `type`,
 * `entity_type`, `entity_public_id`): bildirime dokunulduğunda çalışan
 * `routeFromNotif` iki kaynağı ayırt etmek zorunda kalmaz, tek sözleşme vardır.
 */
async function present(item: PanelNotification): Promise<boolean> {
  try {
    const Notifications = await import("expo-notifications");

    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.description ?? undefined,
        data: {
          notification_id: item.id,
          type: item.type,
          entity_type: item.entity_type,
          entity_public_id: item.entity_public_id,
          // Köprüden geldiğini işaretler; teşhis ekranı ve günlükler için.
          source: "bridge",
        },
        /* SES: karar `shouldPlaySoundFor` ile ön plan handler'ıyla AYNI
           yerden gelir. Eski hâli
           `categoryForNotif({ type: item.type }) === "GOAL"` idi ve HİÇBİR
           ZAMAN doğru olamıyordu: `categoryForNotif` yalnız `kind` okur,
           buradan `type` geçiliyordu; fonksiyon her seferinde "PANEL"
           dönüyor, karşılaştırma her seferinde false oluyordu. Sonuç:
           köprüden geçen HER bildirim sessizdi — mesajlar dahil. */
        sound: shouldPlaySoundFor({
          type: item.type,
          entity_type: item.entity_type,
        }),
      },
      /* Android'de bildirimin sesi KANALDAN gelir; kanal verilmezse expo'nun
         kendi yedek kanalına düşer ve oradaki ses uygulamanın kuralını değil
         o kanalın ayarını izler. Panel bildirimleri panel kanalına yazılır.

         KANAL TETİKLEYİCİDE VERİLİR, İÇERİKTE DEĞİL: expo-notifications'ta
         `{ channelId }` bir `ChannelAwareTriggerInput`tur ve `null` gibi
         "hemen göster" anlamına gelir (bkz. Notifications.types.d.ts). Üst
         seviyeye yazılan bir `channelId` alanı sessizce yok sayılırdı. */
      trigger: Platform.OS === "android" ? { channelId: CHANNELS.PANEL.id } : null,
    });
    return true;
  } catch {
    // expo-notifications yoksa (web hedefi) ya da izin çekilmişse sessizce geç;
    // bildirim merkezi ekranı kaydı zaten gösteriyor.
    return false;
  }
}

/** İzin gerçekten verilmiş mi? Verilmemişse yoklama boşuna çalışır. */
async function hasPermission(): Promise<boolean> {
  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export function useNotificationBridge(): void {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const userId = auth.user?.id ?? null;
  const signedIn = Boolean(userId);

  /** Aynı anda iki tur çalışmasın (yoklama + ön plana geliş çakışabilir). */
  const running = useRef(false);

  /**
   * Panel rolü olmayan hesapta bildirim merkezi 403 döner. Bu kalıcı bir
   * durumdur (oturum boyunca değişmez), ama yoklama devam ederse 45 saniyede
   * bir boşa istek atılır. İlk 403'te köprü bu oturum için kapanır; sonraki
   * girişte hook yeniden kurulduğu için bayrak sıfırlanır.
   */
  const forbidden = useRef(false);

  const runRound = useCallback(async () => {
    if (!userId || running.current || forbidden.current) return;
    running.current = true;

    try {
      if (!(await hasPermission())) return;

      const key = watermarkKey(userId);
      const storedRaw = await AsyncStorage.getItem(key);
      const stored = Number(storedRaw);
      const watermark = Number.isFinite(stored) && stored > 0 ? stored : null;

      const response = await getPanelNotifications(1);
      const items = response?.items ?? [];
      if (!items.length) return;

      const highest = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);

      // İlk çalıştırma: geçmişi gösterme, yalnız işareti kur.
      if (watermark === null) {
        await AsyncStorage.setItem(key, String(highest));
        return;
      }

      const ledger = await deliveredIds();

      const fresh = items
        .filter((item) => Number(item.id) > watermark)
        .filter((item) => !item.is_read) // Web'den okunmuşsa telefonu meşgul etme.
        .filter((item) => !ledger.has(Number(item.id))) // Push'la zaten geldiyse atla.
        // Eskiden yeniye göster: bildirim gölgesinde en yeni en üstte kalsın.
        .sort((a, b) => Number(a.id) - Number(b.id))
        .slice(-MAX_PER_ROUND);

      const shown: number[] = [];
      for (const item of fresh) {
        // Sırayla: aynı anda beş bildirim planlamak bazı Android sürümlerinde
        // yalnız sonuncuyu gösteriyor.
        // eslint-disable-next-line no-await-in-loop
        if (await present(item)) shown.push(Number(item.id));
      }

      if (shown.length) markManyDelivered(shown);

      /* İŞARET HER DURUMDA İLERLETİLİR — gösterilenlere göre değil, okunan en
         yüksek kimliğe göre. Aksi hâlde okunmuş ya da atlanmış bir bildirim
         işareti geride tutar ve her turda aynı kayıtlar yeniden değerlendirilir. */
      if (highest > watermark) await AsyncStorage.setItem(key, String(highest));

      // Rozetler tazelensin: sayaç sorgusu 60 sn'de bir yoklanıyor, köprü
      // yeni bildirim gördüyse beklemeye gerek yok.
      if (fresh.length) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
      }
    } catch (error) {
      /* 403: hesabın panel rolü yok — bir daha denemeye gerek yok.
         Diğer hatalar (ağ, 5xx) geçicidir; köprü sessizce bekler ve bir
         sonraki turda yeniden dener. Kullanıcıya hata gösterilmez; bu arka
         planda çalışan bir yardımcıdır, ekranın kendisi değil. */
      if (error instanceof ApiError && error.status === 403) forbidden.current = true;
    } finally {
      running.current = false;
    }
  }, [queryClient, userId]);

  useEffect(() => {
    if (!signedIn) return;

    // Yeni oturum: önceki hesabın 403'ü yeni hesabı susturmasın.
    forbidden.current = false;

    // Açılışta ve her ön plana gelişte hemen bir tur.
    void runRound();

    const interval = setInterval(() => {
      if (AppState.currentState === "active") void runRound();
    }, POLL_MS);

    const onChange = (next: AppStateStatus) => {
      if (next === "active") void runRound();
    };
    const subscription = AppState.addEventListener("change", onChange);

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [runRound, signedIn]);
}
