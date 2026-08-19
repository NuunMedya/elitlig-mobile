/**
 * Push token kaydı ve bildirim tıklama yönlendirmesi.
 * _layout.tsx'te bir kez mount edilir; giriş yapılınca token sunucuya yazılır.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { post } from "@/lib/http";
import {
  registerForPushNotifications,
  setupNotificationHandlers,
  routeFromNotif,
} from "@/lib/notifications";
import { useAuth } from "@/providers/AuthProvider";

async function savePushToken(token: string) {
  try {
    // http katmanı Authorization başlığını AuthProvider'dan otomatik ekler.
    await post("/api/users/push-token", { token, platform: Platform.OS });
  } catch {
    // Sessizce geç: push kaydı uygulamayı asla bloklamaz.
  }
}

export function usePushNotifications() {
  const router = useRouter();
  const auth = useAuth();
  const listenerRef = useRef<{ remove?: () => void } | null>(null);
  const signedIn = Boolean(auth.user);

  useEffect(() => {
    setupNotificationHandlers();
  }, []);

  useEffect(() => {
    if (!signedIn) return;

    // Token al ve sunucuya kaydet (yalnızca EAS build'de sonuç döner).
    registerForPushNotifications().then((token) => {
      if (token) savePushToken(token);
    });

    // Bildirim tıklama — uygulama arka plandayken
    const setupListener = async () => {
      try {
        const Notifications = await import("expo-notifications");
        listenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as Record<string, unknown>;
          const route = routeFromNotif(data);
          if (route) router.push(route as never);
        });
      } catch {
        // Expo Go'da sessizce geç
      }
    };

    setupListener();

    return () => {
      listenerRef.current?.remove?.();
    };
  }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
}
