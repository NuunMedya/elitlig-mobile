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
 * ÇİFT GÖSTERİM — "AÇILIŞTA BİLDİRİMLER TOPLUCA DÜŞÜYOR": push zinciri
 * çalışıyorsa aynı bildirim hem push hem köprü yoluyla gelirdi. Eskiden tek
 * koruma, uzak push'un `addNotificationReceivedListener` ile deftere
 * yazılmasıydı; ama o dinleyici YALNIZ UYGULAMA ÖN PLANDAYKEN çalışır. Arka
 * planda/kapalıyken gelen push'lar deftere hiç yazılmıyor, kullanıcı
 * uygulamayı açınca köprü hepsini "yeni" sanıp bir kez daha gösteriyordu.
 * Artık üç katman var:
 *   1. Her turda bildirim gölgesindeki uzak push'lar okunur
 *      (getPresentedNotificationsAsync); kimlikleri deftere, tür + varlık
 *      anahtarları ayrıca eşleştirmeye girer (toplu push'ta kimlik yoktur).
 *   2. Cihaza son 14 günde gerçekten uzak push düştüyse ("kanıt", bkz.
 *      lib/notificationLedger.ts → markRemotePushSeen) köprü SESSİZ moddadır:
 *      bildirim göstermez, yalnız işaret ilerletir ve sayaçları tazeler.
 *      Kullanıcının gölgeden sildiği bir push açılışta geri gelmez.
 *   3. Push hiç çalışmıyorsa (ör. Firebase'siz Android derlemesi) köprü yedek
 *      olarak gösterir; ama uzun aradan sonra birikmiş birden çok kaydı tek
 *      tek patlatmak yerine TEK bir özet bildirimi gösterir.
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
import { getPushStatus } from "@/hooks/usePushStatus";
import {
  contentKeyOf,
  deliveredIds,
  lastRemotePushAt,
  markManyDelivered,
  markRemotePushSeen,
} from "@/lib/notificationLedger";
import {
  CHANNELS,
  isRemoteNotification,
  notificationIdFromNotif,
  shouldPlaySoundFor,
} from "@/lib/notifications";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Ön planda yoklama aralığı. 45 sn: tazelik ile pil arasındaki denge. */
const POLL_MS = 45_000;

/** Tek turda en fazla kaç bildirim TEK TEK gösterilir; fazlası özetlenir. */
const MAX_INDIVIDUAL = 2;

/** Bundan eski kayıt tek tek gösterilmez (özete girer): bayat haber bölmesin. */
const STALE_MS = 6 * 60 * 60 * 1000;

/** Son uzak push bu süreden yeniyse push zinciri "çalışıyor" sayılır. */
const REMOTE_PROOF_MS = 14 * 24 * 60 * 60 * 1000;

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

/** Birikmiş bildirimler için TEK özet bildirimi; dokununca bildirim merkezi açılır. */
async function presentSummary(items: PanelNotification[]): Promise<boolean> {
  try {
    const Notifications = await import("expo-notifications");
    const latest = [...items].sort((a, b) => Number(b.id) - Number(a.id));
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${items.length} yeni bildirim`,
        body: latest.slice(0, 3).map((item) => item.title).join(" · "),
        // Tanınmayan tür → routeFromNotif bildirim merkezine gider.
        data: { type: "BRIDGE_SUMMARY", source: "bridge" },
        sound: latest.some((item) => shouldPlaySoundFor({ type: item.type, entity_type: item.entity_type })),
      },
      trigger: Platform.OS === "android" ? { channelId: CHANNELS.PANEL.id } : null,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Bildirim gölgesindeki UZAK push'ları okur.
 *
 * Arka planda gelen push'lar JS'e hiç uğramaz; gölgede durdukları sürece
 * buradan görülürler. Kimliği olanlar deftere yazılır, tür + varlık anahtarı
 * ayrıca döner (toplu push'ta kimlik yoktur). Gölgede tek bir uzak push bile
 * varsa bu, push zincirinin çalıştığının kanıtıdır.
 */
async function syncPresented(): Promise<ReadonlySet<string>> {
  const keys = new Set<string>();
  try {
    const Notifications = await import("expo-notifications");
    const presented = await Notifications.getPresentedNotificationsAsync();
    const ids: number[] = [];
    let remoteSeen = false;
    for (const notification of presented) {
      if (!isRemoteNotification(notification)) continue;
      remoteSeen = true;
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const id = notificationIdFromNotif(data);
      if (id) ids.push(id);
      const key = contentKeyOf(data);
      if (key) keys.add(key);
    }
    if (ids.length) markManyDelivered(ids);
    if (remoteSeen) markRemotePushSeen();
  } catch {
    // Web hedefi ya da desteklenmeyen ortam: eşleştirme yapılmadan devam.
  }
  return keys;
}

/**
 * Push zinciri bu cihazda çalışıyor mu?
 *
 * Token'ın sunucuya yazılması yetmez (EAS'te FCM/APNs kimliği eksikse Expo
 * her gönderimi reddeder). Kanıt: son 14 günde telefona gerçekten bir uzak
 * push düşmüş olması. Kayıt KESİN olarak bozuksa (izin yok, Firebase yok,
 * Expo Go, token sunucuya yazılamadı) kanıt ne derse desin köprü devrededir.
 */
async function pushChainHealthy(): Promise<boolean> {
  const status = getPushStatus();
  if (!status.busy && (status.state !== "hazir" || status.server === "hata")) return false;
  const last = await lastRemotePushAt();
  return last !== null && Date.now() - last < REMOTE_PROOF_MS;
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

      // Önce gölge: arka planda gelen push'lar deftere ve eşleştirmeye girsin.
      const presentedKeys = await syncPresented();
      const ledger = await deliveredIds();

      const fresh = items
        .filter((item) => Number(item.id) > watermark)
        .filter((item) => !item.is_read) // Web'den okunmuşsa telefonu meşgul etme.
        .filter((item) => !ledger.has(Number(item.id))) // Push'la zaten geldiyse atla.
        .filter((item) => {
          // Toplu push kimlik taşımaz: tür + varlık ile eşleştir.
          const contentKey = contentKeyOf({
            type: item.type,
            entity_type: item.entity_type,
            entity_public_id: item.entity_public_id,
          });
          return !contentKey || !presentedKeys.has(contentKey);
        })
        // Eskiden yeniye göster: bildirim gölgesinde en yeni en üstte kalsın.
        .sort((a, b) => Number(a.id) - Number(b.id));

      /* PUSH ÇALIŞIYORSA GÖSTERME. Bu kayıtlar ya push'la zaten geldi (ve
         kullanıcı gölgeden sildi) ya da üye o türün push'unu tercihlerinden
         kapattı — iki durumda da yeniden göstermek yanlış. Sayaçlar yine de
         aşağıda tazelenir. */
      if (fresh.length && !(await pushChainHealthy())) {
        const now = Date.now();
        const allRecent = fresh.every((item) => {
          const created = Date.parse(item.createdAt);
          return !Number.isFinite(created) || now - created < STALE_MS;
        });

        if (fresh.length <= MAX_INDIVIDUAL && allRecent) {
          const shown: number[] = [];
          for (const item of fresh) {
            // Sırayla: aynı anda birden çok bildirim planlamak bazı Android
            // sürümlerinde yalnız sonuncuyu gösteriyor.
            // eslint-disable-next-line no-await-in-loop
            if (await present(item)) shown.push(Number(item.id));
          }
          if (shown.length) markManyDelivered(shown);
        } else if (await presentSummary(fresh)) {
          // Açılışta patlama yerine tek özet: kayıtlar bildirim merkezinde.
          markManyDelivered(fresh.map((item) => Number(item.id)));
        }
      }

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
