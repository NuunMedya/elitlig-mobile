/**
 * ElitLig Bildirim Altyapısı
 *
 * EAS Build (TestFlight/Production) sonrası aktif olur.
 * Expo Go'da push token çalışmaz; in-app bildirimler çalışır.
 *
 * ANDROID KANALLARI:
 * Uzak bildirimin hangi kanala düşeceği GÖNDERİM anında belirlenir; istemci
 * sonradan değiştiremez (arka planda gelen push'u expo-notifications native
 * tarafta karşılayıp gösterir, JS hiç çalışmaz). Bu yüzden kanal kimlikleri
 * sunucuyla BİREBİR aynı olmak zorundadır:
 * elitlig-server/services/NotificationService.js → channelFor(notification)
 *   match_goal                → "goal"
 *   diğer match_* (başladı, devre, sonuç, fikstür, hatırlatma) → "match"
 *   daily_quiz / arena        → "game"
 *   NEWS* türleri             → "news"
 *   diğer panel bildirimleri  → "panel"
 *   tanınmayan                → "default"
 * Bir kimlik burada yaratılmazsa o bildirim expo'nun İngilizce yedek kanalına
 * (expo_notifications_fallback_notification_channel) düşer — bu yüzden altı
 * kanalın hepsi açılır, "default" dahil.
 *
 * NEDEN GOL AYRI KANAL: kanal ayarları (ses, titreşim, "rahatsız etme"
 * istisnası) Android'de kullanıcının elindedir ve kanal yaratıldıktan sonra
 * kod değiştiremez. Ayrı kanal, üyeye "sadece golleri aç, gerisini sustur"
 * hakkını verir; tek kanalda bu ayrım mümkün değildi.
 */

import { Platform } from "react-native";
// Yalnız tip: dinamik import edilen expo-notifications modülünü açılışta yüklemez.
import type { AndroidImportance } from "expo-notifications";

/**
 * Android bildirim kanalları — kimlikler sunucudaki channelFor() ile aynı.
 *
 * `importance` expo-notifications `AndroidImportance` ölçeğidir:
 * NONE 2 · MIN 3 · LOW 4 · DEFAULT 5 · HIGH 6 · MAX 7.
 * Gol MAX: kullanıcının anında görmek istediği tek tür. Oyun ve haber LOW:
 * bildirim gölgesinde birikir ama titreşimle bölmez.
 */
export const CHANNELS = {
  GOAL:    { id: "goal",    name: "Goller",              importance: 7, vibration: [0, 120, 80, 120, 80, 240] },
  MATCH:   { id: "match",   name: "Maç Bildirimleri",    importance: 6, vibration: [0, 250, 250, 250] },
  PANEL:   { id: "panel",   name: "Panel Bildirimleri",  importance: 5, vibration: [0, 200, 150, 200] },
  GAME:    { id: "game",    name: "Oyun Hatırlatmaları", importance: 4, vibration: [0, 180] },
  NEWS:    { id: "news",    name: "Haberler",            importance: 4, vibration: [0, 180] },
  /* Sunucu tanımadığı bir tür için bu kanala düşer; yaratılmazsa o bildirim
     expo'nun İngilizce yedek kanalına gider. */
  DEFAULT: { id: "default", name: "Diğer Bildirimler",   importance: 5, vibration: [0, 250, 250, 250] },
} as const;


/**
 * Bildirim türü. Ön plandaki ses kararı için kullanılır; Android kanalı
 * DEĞİLDİR (kanal gönderim anında sunucuda seçilir, bkz. dosya başlığı).
 */
export type NotifCategory = "GOAL" | "MATCH" | "PANEL" | "GAME" | "NEWS";

/* =============================================================================
   BİLDİRİMDEN ROTAYA
   -----------------------------------------------------------------------------
   Sunucu üç ayrı payload biçimi gönderir:

     1) Maç push'ları     services/matchNotifications.js
        { kind, match_id, team_id?, event_id?, minute?, home_score?, away_score? }
     2) Zamanlanmış işler services/scheduledNotifications.js
        { kind: "daily_quiz", date }
     3) Panel bildirimleri models/PanelNotification.js (afterCreate kancası)
        { notification_id, type, entity_type, entity_public_id }

   Çözümleme sırası: kind → entity_type → type öneki. entity_type, type'tan
   önce gelir çünkü daha dar bir sözleşmedir: TRANSFER_OFFER_NEEDS_APPROVAL ile
   TRANSFER_OFFER_RECEIVED aynı entity'ye işaret eder, ikisi de aynı ekranı açar.
   ========================================================================== */

/** expo-router `router.push()` bunu doğrudan kabul eder. */
export type NotifTarget = {
  pathname: string;
  params?: Record<string, string>;
};

/** Rotayı etkileyen oturum bağlamı. Maç talebi rolüne göre iki farklı ekrana gider. */
export interface NotifContext {
  isManagement?: boolean;
}

/** Boş/geçersiz kimlikleri eler. Number(null) === 0 tuzağına düşmez. */
function asId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "null" || text === "undefined" || text === "0") return null;
  return text;
}

/** services/matchNotifications.js'in ürettiği bütün kind değerleri. */
const MATCH_KINDS = new Set([
  "match_fixture",
  "match_reminder",
  "match_start",
  "match_goal",
  "match_card",
  "match_halftime",
  "match_result",
]);

/** Canlı akış bildirimleri maç detayını doğrudan "Canlı" sekmesinde açar. */
const LIVE_MATCH_KINDS = new Set(["match_start", "match_goal", "match_card", "match_halftime"]);

/** Panel bildiriminin entity_type'ı — kanonik biçim büyük harf. */
function targetFromEntity(
  entityType: string,
  entityId: string | null,
  ctx: NotifContext
): NotifTarget | null {
  switch (entityType) {
    case "TRANSFER_OFFER":
      return entityId
        ? { pathname: "/teklif/[id]", params: { id: entityId } }
        : { pathname: "/tekliflerim" };

    case "CONTRACT":
      return entityId
        ? { pathname: "/sozlesme/[id]", params: { id: entityId } }
        : { pathname: "/sozlesmelerim" };

    case "PENALTY":
      return entityId
        ? { pathname: "/ceza/[id]", params: { id: entityId } }
        : { pathname: "/cezalarim" };

    case "PANEL_MESSAGE":
      // entity_public_id burada thread id'sidir (String(root.thread_id || root.id)).
      return entityId
        ? { pathname: "/mesaj/[id]", params: { id: entityId } }
        : { pathname: "/mesajlarim" };

    case "MATCH_REQUEST":
      // Aynı bildirim hem yönetime hem takım başkanına gider; ekran role göre ayrışır.
      return ctx.isManagement
        ? { pathname: "/yonetim/maclar", ...(entityId ? { params: { request: entityId } } : {}) }
        : { pathname: "/takimim/mac-merkezi", ...(entityId ? { params: { request: entityId } } : {}) };

    // Sunucuda entity_type henüz yazılmıyor (teamJoinRequestService.js); eklendiğinde
    // burası çalışmaya başlar, eklenene dek type öneki devreye girer.
    case "TEAM_JOIN_REQUEST":
      return { pathname: "/davetler" };

    default:
      return null;
  }
}

/**
 * Panel bildirim türü önekleri.
 *
 * Sıra önemlidir: ilk eşleşen kazanır. Önek eşlemesi, sunucuya yeni bir
 * TRANSFER_ veya PENALTY_ türü eklendiğinde bu dosyanın güncellenmesini
 * gerektirmez — constants/notificationPreferences.js'deki
 * NOTIFICATION_TYPE_PREFIXES ile aynı mantık.
 */
const TYPE_PREFIX_TARGETS: ReadonlyArray<
  readonly [string, (entityId: string | null, ctx: NotifContext) => NotifTarget]
> = [
  ["TRANSFER_", (id) => (id ? { pathname: "/teklif/[id]", params: { id } } : { pathname: "/tekliflerim" })],
  ["OFFER_", (id) => (id ? { pathname: "/teklif/[id]", params: { id } } : { pathname: "/tekliflerim" })],
  ["CONTRACT_", (id) => (id ? { pathname: "/sozlesme/[id]", params: { id } } : { pathname: "/sozlesmelerim" })],
  ["PENALTY_", (id) => (id ? { pathname: "/ceza/[id]", params: { id } } : { pathname: "/cezalarim" })],
  ["PANEL_MESSAGE", (id) => (id ? { pathname: "/mesaj/[id]", params: { id } } : { pathname: "/mesajlarim" })],
  ["TEAM_INVITE", () => ({ pathname: "/davetler" })],
  ["TEAM_APPLICATION", () => ({ pathname: "/davetler" })],
  ["MATCH_REQUEST", (id, ctx) => targetFromEntity("MATCH_REQUEST", id, ctx) ?? { pathname: "/bildirimler" }],
  // BÜTÜNLEŞTİRME DÜZELTMESİ: `/haftanin-enleri` diye bir rota YOK; bildirime
  // dokunan üye boş ekrana düşüyordu. Haftanın enlerinin mobildeki en yakın
  // karşılığı Ligler > İstatistik segmentidir (lig enleri: gol kralı, en golcü,
  // formda takım). Ayrı bir "Haftanın Enleri" ekranı açılırsa hedef tek satırda
  // oraya çevrilir.
  ["WEEKLY_AWARD_SET", () => ({ pathname: "/(tabs)/ligler", params: { tab: "istatistik" } })],
  ["PASSWORD_RESET", () => ({ pathname: "/yonetim" })],
  // Hesap/üyelik akışları kendi ekranına sahip değil; bildirim merkezinde okunur.
  ["MEMBERSHIP_", () => ({ pathname: "/bildirimler" })],
  ["ACCOUNT_REQUEST_", () => ({ pathname: "/bildirimler" })],
  ["TEAM_TRANSFER", () => ({ pathname: "/bildirimler" })],
] as const;

/**
 * Bildirime dokunulunca gidilecek hedef.
 *
 * Hiçbir zaman hata fırlatmaz: tanınmayan bir payload yüzünden uygulama
 * açılışta çökmemeli. Çözümlenemeyen bildirimde null döner ve uygulama normal
 * açılışını yapar.
 */
export function routeFromNotif(
  data: Record<string, unknown> | null | undefined,
  ctx: NotifContext = {}
): NotifTarget | null {
  if (!data || typeof data !== "object") return null;

  /* ---------- 1) Maç kaynaklı push'lar ---------- */
  const kind = String(data.kind ?? "").trim().toLowerCase();

  if (MATCH_KINDS.has(kind)) {
    const matchId = asId(data.match_id ?? data.id);
    // Maç kimliği yoksa Maçlar sekmesi. `/(tabs)` artık Genel Bakış'a
    // düşüyor; maç bildirimi maç listesine gitmeli, özete değil.
    if (!matchId) return { pathname: "/(tabs)/maclar" };
    return {
      pathname: "/mac/[id]",
      params: { id: matchId, tab: LIVE_MATCH_KINDS.has(kind) ? "canli" : "ozet" },
    };
  }

  /* ---------- 2) Oyun ve zamanlanmış push'lar ---------- */
  if (kind === "daily_quiz" || kind === "daily_challenge") return { pathname: "/gunun" };
  if (kind === "arena_reminder") return { pathname: "/arena" };
  if (kind === "kimbu_reminder") return { pathname: "/kimbu" };
  if (kind === "slalom_reminder") return { pathname: "/slalom" };
  if (kind === "sektir_reminder") return { pathname: "/sektir" };
  if (kind === "game" || kind === "game_reminder") return { pathname: "/(tabs)/oyunlar" };
  if (kind === "leaderboard") return { pathname: "/siralama" };

  /* ---------- 3) Haber push'u ---------- */
  if (kind === "news") {
    const newsId = asId(data.news_public_id ?? data.entity_public_id ?? data.id);
    return newsId
      ? { pathname: "/haber/[id]", params: { id: newsId } }
      : { pathname: "/(tabs)/ligler", params: { tab: "haberler" } };
  }

  /* ---------- 4) Panel bildirimleri ---------- */
  const entityType = String(data.entity_type ?? "").trim().toUpperCase();
  const entityId = asId(data.entity_public_id);

  const byEntity = targetFromEntity(entityType, entityId, ctx);
  if (byEntity) return byEntity;

  const type = String(data.type ?? "").trim().toUpperCase();
  if (type) {
    const match = TYPE_PREFIX_TARGETS.find(([prefix]) => type.startsWith(prefix));
    if (match) return match[1](entityId, ctx);
    // Tanınmayan panel türü: bildirim merkezi her zaman geçerli bir liman.
    return { pathname: "/bildirimler" };
  }

  return null;
}

/* ---------- yardımcılar ---------- */

/** Giriş zorunlu rotalar. Misafir bir bildirime dokunursa önce /giris'e uğrar. */
const AUTH_REQUIRED_PREFIXES = [
  "/tekliflerim",
  "/teklif",
  "/sozlesmelerim",
  "/sozlesme",
  "/cezalarim",
  "/ceza",
  "/mesajlarim",
  "/mesaj",
  "/davetler",
  "/bildirimler",
  "/bildirim-tercihleri",
  "/takimim",
  "/yonetim",
  "/hesabim",
  "/oyuncum",
];

export function requiresAuth(target: NotifTarget): boolean {
  return AUTH_REQUIRED_PREFIXES.some(
    (prefix) => target.pathname === prefix || target.pathname.startsWith(`${prefix}/`)
  );
}

/** Okundu işaretlemek için: panel bildirimlerinde notification_id bulunur. */
export function notificationIdFromNotif(
  data: Record<string, unknown> | null | undefined
): number | null {
  const raw = Number(data?.notification_id);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

/**
 * Bildirimin türünü payload'dan çıkarır.
 *
 * Yalnızca uygulama ÖN PLANDAYKEN ses çalınıp çalınmayacağına karar vermek için
 * kullanılır. Android kanalını belirlemez; sunucu kategori bazlı channelId
 * göndermeye başlarsa eşleme buradan birebir kopyalanmalıdır (bkz. dosya başlığı).
 */
export function categoryForNotif(data: Record<string, unknown> | null | undefined): NotifCategory {
  const kind = String(data?.kind ?? "").toLowerCase();
  // Gol önce bakılır: kendi türü var, MATCH'e düşmemeli.
  if (kind === "match_goal") return "GOAL";
  if (MATCH_KINDS.has(kind)) return "MATCH";
  if (kind === "news") return "NEWS";
  if (kind) return "GAME";
  return "PANEL";
}

/** Bildirim izni iste + token al (EAS Build sonrası çalışır) */
/**
 * Push kaydının SONUCU — neden çalışmadığı ekranda gösterilebilsin diye.
 *
 * Eskiden bu fonksiyon her hatayı yutup `null` dönüyordu; "bildirim gelmiyor"
 * şikâyetinde izin mi reddedildi, Expo Go'da mı çalışılıyor, token mu alınamadı,
 * sunucuya mı yazılamadı ayırt edilemiyordu. Artık her durum adlandırılmıştır ve
 * Bildirim Tercihleri ekranı bunu kullanıcıya gösterir.
 */
export type PushRegistrationState =
  | "hazir"           // token alındı
  | "izin-yok"        // kullanıcı bildirimlere izin vermedi
  | "simulator"       // gerçek cihaz değil (emülatör/simülatör)
  | "expo-go"         // Expo Go: uzak bildirim desteklenmiyor, derleme gerekir
  | "proje-yok"       // EAS projectId okunamadı
  | "hata";           // beklenmeyen hata

export interface PushRegistration {
  state: PushRegistrationState;
  token: string | null;
  /** Kullanıcıya gösterilecek Türkçe açıklama. */
  message: string;
  /** Geliştirici için ham hata metni. */
  detail?: string;
}

/**
 * Expo Go'da uzak bildirim SDK 53'ten beri desteklenmiyor: token istendiğinde
 * modül hata fırlatır. Bunu "kurulum hatası" gibi göstermek yanıltıcı olurdu.
 */
function isExpoGo(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require("expo-constants").default;
    return Constants?.appOwnership === "expo" || Constants?.executionEnvironment === "storeClient";
  } catch {
    return false;
  }
}

/** Bildirim izni iste, kanalları kur, Expo push token'ı al. */
export async function registerForPush(): Promise<PushRegistration> {
  try {
    const Notifications = await import("expo-notifications");
    const Device = await import("expo-device");

    if (!Device.isDevice) {
      return {
        state: "simulator",
        token: null,
        message: "Emülatörde push bildirimi çalışmaz. Gerçek bir cihazda deneyin.",
      };
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return {
        state: "izin-yok",
        token: null,
        message:
          "Bildirim izni verilmedi. Telefon ayarlarından ElitLig için bildirimlere izin verin.",
      };
    }

    // Android kanal kurulumu. Kimlikler sunucunun gönderdiği channelId ile
    // birebir aynı olmalı; ayrışan bir kimlik expo'nun yedek kanalına düşer ve
    // kullanıcının o kategori için yaptığı ayar hiçbir işe yaramaz.
    if (Platform.OS === "android") {
      await Promise.all(
        Object.values(CHANNELS).map((channel) =>
          Notifications.setNotificationChannelAsync(channel.id, {
            name: channel.name,
            importance: channel.importance as AndroidImportance,
            vibrationPattern: [...channel.vibration],
          }).catch(() => undefined)
        )
      );
    }

    const Constants = (await import("expo-constants")).default;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    if (!projectId) {
      return {
        state: "proje-yok",
        token: null,
        message:
          "Uygulama kimliği (EAS projectId) okunamadı; bu derlemede push bildirimi alınamaz.",
      };
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return {
      state: "hazir",
      token: tokenData.data,
      message: "Bildirimler açık. Bu cihaz bildirim almaya hazır.",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isExpoGo()) {
      return {
        state: "expo-go",
        token: null,
        message:
          "Expo Go uygulamasında push bildirimi desteklenmiyor. Bildirimleri görmek için " +
          "uygulamanın kendi derlemesini (APK / TestFlight) yükleyin.",
        detail,
      };
    }
    return {
      state: "hata",
      token: null,
      message: "Bildirim kaydı yapılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      detail,
    };
  }
}

/**
 * Eski imza — yalnızca token döndürür.
 * Yeni kod `registerForPush()` kullanmalı; bu sarmalayıcı çağrı yerlerini kırmamak içindir.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  return (await registerForPush()).token;
}

/** Bildirim handler'larını kur (ön planda iken banner + ses) */
export async function setupNotificationHandlers(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");

    Notifications.setNotificationHandler({
      handleNotification: async (notif) => {
        const data = notif.request.content.data as Record<string, unknown> | undefined;
        const category = categoryForNotif(data);
        // Oyun ve haber bildirimleri ön planda sessiz; gol her zaman sesli.
        const silent = category === "GAME" || category === "NEWS";
        return {
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: !silent,
          shouldSetBadge: true,
        };
      },
    });
  } catch {
    // Expo Go'da sessizce geç
  }
}
