/**
 * ElitLig Bildirim Altyapısı
 *
 * EAS Build (TestFlight/Production) sonrası aktif olur.
 * Expo Go'da push token çalışmaz; in-app bildirimler çalışır.
 *
 * Kategoriler:
 * - MATCH    : Fikstür, hatırlatma (24h/2h), sonuç
 * - GAME     : Günün Testi (09:00), Arena (Sal+Per 15:00)
 * - PANEL    : Transfer teklifi, ceza, mesaj, sözleşme
 * - NEWS     : Sadece pinned/önemli haberler
 */

import { Platform } from "react-native";

/** Bildirim kanalları (Android) */
export const CHANNELS = {
  MATCH:  { id: "match",  name: "Maç Bildirimleri",   importance: 5 },
  GAME:   { id: "game",   name: "Oyun Hatırlatmaları", importance: 3 },
  PANEL:  { id: "panel",  name: "Panel Bildirimleri",  importance: 4 },
  NEWS:   { id: "news",   name: "Haberler",            importance: 2 },
} as const;

export type NotifCategory = keyof typeof CHANNELS;

/**
 * Bildirim tıklanınca gidilecek route.
 *
 * Sunucu iki tip payload gönderir:
 *  - Maç pushları (services/matchNotifications.js): { kind, match_id }
 *  - Panel bildirimleri (models/PanelNotification.js): { type, entity_type, entity_public_id }
 */
export function routeFromNotif(data: Record<string, unknown>): string | null {
  const kind = String(data?.kind ?? "");
  const matchId = data?.match_id ?? data?.id;

  if (kind === "match_fixture" || kind === "match_reminder" || kind === "match_result") {
    return matchId ? `/mac/${matchId}` : "/(tabs)/matches";
  }
  if (kind === "daily_quiz" || kind === "daily_challenge") return "/gunun";
  if (kind === "arena_reminder") return "/arena";

  const type = String(data?.type ?? "").toUpperCase();
  if (type.startsWith("TRANSFER_")) return "/tekliflerim";
  if (type.startsWith("CONTRACT_")) return "/sozlesmelerim";
  if (type.startsWith("PENALTY_")) return "/cezalarim";
  if (type.startsWith("PANEL_MESSAGE")) return "/mesajlarim";
  if (type.startsWith("TEAM_INVITE") || type.startsWith("TEAM_APPLICATION")) return "/davetler";
  if (type) return "/bildirimler";
  return null;
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

    // Android kanal kurulumu
    if (Platform.OS === "android") {
      await Promise.all(
        Object.values(CHANNELS).map((ch) =>
          Notifications.setNotificationChannelAsync(ch.id, {
            name: ch.name,
            importance: ch.importance as any,
            vibrationPattern: [0, 250, 250, 250],
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
      handleNotification: async (notif: any) => {
        const category = String(notif.request.content.data?.category ?? "");
        // Oyun bildirimleri ön planda sessiz
        const silent = category === "game";
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
