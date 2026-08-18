/**
 * Push token kaydı ve bildirim tıklama yönlendirmesi.
 * _layout.tsx'te bir kez mount edilir.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import {
  registerForPushNotifications,
  setupNotificationHandlers,
  routeFromNotif,
} from "@/lib/notifications";

const API = "https://elitlig-api-88a866b7a4da.herokuapp.com";

async function savePushToken(token: string, authToken: string) {
  try {
    await fetch(`${API}/api/users/push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token,
        platform: require("react-native").Platform.OS,
      }),
    });
  } catch {
    // Sessizce geç
  }
}

export function usePushNotifications(authToken: string | null) {
  const router = useRouter();
  const listenerRef = useRef<any>(null);
  const auth = useAuth();

  useEffect(() => {
    setupNotificationHandlers();
  }, []);

  useEffect(() => {
    if (!authToken) return;

    // Token al ve sunucuya kaydet
    registerForPushNotifications().then((token) => {
      if (token) savePushToken(token, authToken);
    });

    // Bildirim tıklama — uygulama arka plandayken
    const setupListener = async () => {
      try {
        const Notifications = await import("expo-notifications");
        listenerRef.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
          const data = response.notification.request.content.data as Record<string, unknown>;
          const route = routeFromNotif(data);
          if (route) router.push(route as any);
        });
      } catch {
        // Expo Go'da sessizce geç
      }
    };

    setupListener();

    return () => {
      listenerRef.current?.remove?.();
    };
  }, [authToken]);
}
