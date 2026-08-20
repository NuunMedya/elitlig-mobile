/**
 * ElitLig Bildirim Altyapısı
 *
 * EAS Build (TestFlight/Production) sonrası aktif olur.
 * Expo Go'da push token çalışmaz; in-app bildirimler çalışır.
 *
 * ANDROID'DE NEDEN TEK KANAL VAR:
 * Uzak bildirimin hangi kanala düşeceği GÖNDERİM anında belirlenir; istemci
 * sonradan değiştiremez (arka planda gelen push'u expo-notifications native
 * tarafta karşılayıp gösterir, JS hiç çalışmaz). Sunucu bugün her push'u sabit
 * `channelId: "default"` ile yolluyor — elitlig-server/services/expoPush.js:62
 * `sendToTokens(tokens, { title, body, data, channelId = "default" })`; tek
 * çağıran NotificationService.dispatch'in taşıdığı `notification` nesnelerinde
 * (matchNotifications.js, scheduledNotifications.js, models/PanelNotification.js)
 * channelId alanı yok, yani varsayılan her zaman devrede. app.json'daki
 * expo-notifications eklentisi de `defaultChannel: "default"` diyor.
 *
 * Bu yüzden burada yalnızca "default" kanalı yaratılır. Daha önce yaratılan
 * goal/match/panel/game/news kanalları tek bir bildirim bile almıyordu:
 * kullanıcı Ayarlar > Bildirimler'de onları açsa da kapatsa da hiçbir şey
 * değişmiyordu, gerçek bildirimler ise "default" kanalı hiç yaratılmadığı için
 * expo'nun İngilizce yedek kanalına (expo_notifications_fallback_notification_channel,
 * IMPORTANCE_HIGH) düşüyordu. Çalışmayan beş anahtar göstermek yerine tek
 * gerçek kanal gösterilir; eski ölü kanallar silinir.
 *
 * KATEGORİ BAZLI KANALLARI GERİ AÇMAK İÇİN (sunucu işi, istemci tek başına
 * yapamaz): NotificationService.dispatch → expoPush.sendToTokens yoluna
 * `channelId` taşıyın ve yukarıdaki üç üreticinin her `notification` nesnesine
 * `categoryForNotif` ile birebir aynı eşlemeyi yazın — match_goal → "goal",
 * diğer match_* → "match", oyun/quiz → "game", haber → "news", panel → "panel".
 * Sunucu bunu göndermeye başladıktan sonra kanal listesi tekrar genişletilebilir.
 */

import { Platform } from "react-native";
// Yalnız tip: dinamik import edilen expo-notifications modülünü açılışta yüklemez.
import type { AndroidImportance } from "expo-notifications";

/**
 * Sunucunun gerçekten kullandığı tek Android kanalı.
 *
 * `id` mutlaka expoPush.js'in gönderdiği değerle ve app.json'daki
 * `defaultChannel` ile aynı kalmalı; ayrışırsa bildirimler yine expo'nun
 * yedek kanalına düşer.
 *
 * `importance` expo-notifications `AndroidImportance` ölçeğidir:
 * NONE 2 · MIN 3 · LOW 4 · DEFAULT 5 · HIGH 6 · MAX 7. HIGH seçildi çünkü
 * bugünkü fiili davranış zaten bu (yedek kanal IMPORTANCE_HIGH ile yaratılıyor);
 * daha düşüğü seçmek gol bildiriminin öne çıkmasını bozardı. Kısmak isteyen
 * kullanıcı artık Ayarlar'dan gerçekten kısabilir.
 */
export const DEFAULT_CHANNEL = {
  id: "default",
  name: "ElitLig Bildirimleri",
  importance: 6,
  vibration: [0, 250, 250, 250],
} as const;

/**
 * Önceki sürümlerin yarattığı, hiçbir bildirim almayan kanallar. Android'de
 * kanallar uygulama silinene kadar Ayarlar'da durur; sürüm yükselten
 * kullanıcıda ölü anahtar kalmasın diye temizlenir.
 */
const LEGACY_CHANNEL_IDS = ["goal", "match", "panel", "game", "news"] as const;

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
  "match_halftime",
  "match_result",
]);

/** Canlı akış bildirimleri maç detayını doğrudan "Canlı" sekmesinde açar. */
const LIVE_MATCH_KINDS = new Set(["match_start", "match_goal", "match_halftime"]);

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
    if (!matchId) return { pathname: "/(tabs)" }; // Maçlar sekmesi
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
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // EAS Build'de çalışır
    const Notifications = await import("expo-notifications");
    const Device = await import("expo-device");

    if (!Device.isDevice) {
      console.log("[Notif] Gerçek cihaz değil, token atlanıyor");
      return null;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[Notif] İzin reddedildi");
      return null;
    }

    // Android kanal kurulumu. Yalnızca sunucunun gerçekten kullandığı kanal
    // yaratılır; yaratılmazsa bildirimler expo'nun İngilizce yedek kanalına
    // düşer ve kullanıcının kanal ayarları o kanala işler.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL.id, {
        name: DEFAULT_CHANNEL.name,
        importance: DEFAULT_CHANNEL.importance as AndroidImportance,
        vibrationPattern: [...DEFAULT_CHANNEL.vibration],
      });

      // Eski sürümlerin bıraktığı, hiçbir bildirim almayan kanalları kaldır.
      // Zaten yoksa Android sessizce geçer; hata olursa token kaydı durmamalı.
      await Promise.all(
        LEGACY_CHANNEL_IDS.map((id) =>
          Notifications.deleteNotificationChannelAsync(id).catch(() => undefined)
        )
      );
    }

    const Constants = (await import("expo-constants")).default;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return tokenData.data;
  } catch (err) {
    console.log("[Notif] Token alınamadı (Expo Go'da beklenen):", err);
    return null;
  }
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
