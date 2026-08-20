/**
 * ElitLig Bildirim Altyapısı
 *
 * EAS Build (TestFlight/Production) sonrası aktif olur.
 * Expo Go'da push token çalışmaz; in-app bildirimler çalışır.
 *
 * Kategoriler (Android kanalları):
 * - GOAL     : GOL — kendi kanalı, en yüksek öncelik ve ayrı titreşim deseni
 * - MATCH    : Fikstür, hatırlatma, maç başladı/devre arası/sonuç
 * - PANEL    : Transfer teklifi, ceza, mesaj, sözleşme, davet
 * - GAME     : Günün Testi, Arena hatırlatmaları
 * - NEWS     : Sadece pinned/önemli haberler
 *
 * NEDEN GOL AYRI KANAL: Android'de kanal ayarları (ses, titreşim, "rahatsız
 * etme" istisnası) kullanıcının elindedir ve kanal oluştuktan sonra kod
 * değiştiremez. Gol, kullanıcının anında görmek istediği tek bildirim türü;
 * fikstür duyurusuyla aynı kanalda olursa ya ikisi birden susturulur ya da
 * ikisi birden bağırır. Ayrı kanal, kullanıcıya "sadece golleri aç" hakkını verir.
 */

import { Platform } from "react-native";
// Yalnız tip: dinamik import edilen expo-notifications modülünü açılışta yüklemez.
import type { AndroidImportance } from "expo-notifications";

/**
 * Bildirim kanalları (Android).
 *
 * `importance` değerleri expo-notifications `AndroidImportance` ölçeğidir:
 * NONE 2 · MIN 3 · LOW 4 · DEFAULT 5 · HIGH 6 · MAX 7.
 * (Eski kodda 1–5'lik bir ölçek varsayılmıştı; NEWS=2 kanalı Android'de
 * "hiç gösterme" anlamına geliyordu — düzeltildi.)
 */
export const CHANNELS = {
  GOAL:  { id: "goal",  name: "Goller",              importance: 7, vibration: [0, 120, 80, 120, 80, 240] },
  MATCH: { id: "match", name: "Maç Bildirimleri",    importance: 6, vibration: [0, 250, 250, 250] },
  PANEL: { id: "panel", name: "Panel Bildirimleri",  importance: 5, vibration: [0, 200, 150, 200] },
  GAME:  { id: "game",  name: "Oyun Hatırlatmaları", importance: 4, vibration: [0, 180] },
  NEWS:  { id: "news",  name: "Haberler",            importance: 4, vibration: [0, 180] },
} as const;

export type NotifCategory = keyof typeof CHANNELS;

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
  ["WEEKLY_AWARD_SET", () => ({ pathname: "/haftanin-enleri" })],
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

/** Android kanal seçimi — sunucu channelId göndermediğinde istemci türetir. */
export function channelForNotif(data: Record<string, unknown> | null | undefined): NotifCategory {
  const kind = String(data?.kind ?? "").toLowerCase();
  // Gol önce bakılır: kendi kanalı var, MATCH'e düşmemeli.
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

    // Android kanal kurulumu — kanal ayarları ilk oluşturmada donar, sonradan
    // kod değiştiremez; bu yüzden gol kanalı en baştan ayrı yaratılır.
    if (Platform.OS === "android") {
      await Promise.all(
        Object.values(CHANNELS).map((channel) =>
          Notifications.setNotificationChannelAsync(channel.id, {
            name: channel.name,
            importance: channel.importance as AndroidImportance,
            vibrationPattern: [...channel.vibration],
          })
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
        const channel = channelForNotif(data);
        // Oyun ve haber bildirimleri ön planda sessiz; gol her zaman sesli.
        const silent = channel === "GAME" || channel === "NEWS";
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
