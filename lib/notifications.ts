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

/** Bildirim tıklanınca gidilecek route */
export function routeFromNotif(data: Record<string, unknown>): string | null {
  const type = String(data?.type ?? "");
  const id   = data?.id;

  if (type === "match_scheduled" || type === "match_reminder" || type === "match_result") {
    return id ? `/mac/${id}` : "/matches";
  }
  if (type === "daily_challenge") return "/gunun";
  if (type === "arena_reminder")  return "/arena";
  if (type === "transfer_offer")  return "/tekliflerim";
  if (type === "penalty")         return "/cezalarim";
  if (type === "message")         return id ? `/mesaj/${id}` : "/mesajlarim";
  if (type === "contract_update") return "/sozlesmelerim";
  if (type === "breaking_news")   return id ? `/haber/${id}` : "/news";
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

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "com.elitlig.app",
    });

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
          shouldPlaySound: !silent,
          shouldSetBadge: true,
        };
      },
    });
  } catch {
    // Expo Go'da sessizce geç
  }
}
