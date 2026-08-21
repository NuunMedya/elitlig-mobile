/**
 * Push token kaydı ve bildirim tıklama yönlendirmesi.
 * app/_layout.tsx'te BİR KEZ mount edilir.
 *
 * KAYIT NE ZAMAN ÇALIŞIR: oturum açıldığında ve uygulama her ön plana
 * geldiğinde. Soğuk açılış tek başına yetmez — kullanıcı bildirim iznini
 * telefon ayarlarından sonradan verdiğinde ya da Expo token'ı yenilendiğinde
 * uygulamayı yeniden başlatmadan da doğru duruma gelmesi gerekir.
 *
 * SOĞUK BAŞLATMA: uygulama bildirime dokunularak kapalıdan açıldıysa
 * addNotificationResponseReceivedListener ÇALIŞMAZ; o yanıt
 * getLastNotificationResponseAsync ile bir kez okunur. Bu okunmazsa
 * bildirimden gelen kullanıcı ana ekrana düşer ve neden oraya geldiğini anlamaz.
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
import { runPushRegistration } from "@/hooks/usePushStatus";
import { markDelivered } from "@/lib/notificationLedger";
import { notificationIdFromNotif, routeFromNotif, setupNotificationHandlers } from "@/lib/notifications";
import { useAuth } from "@/providers/AuthProvider";

export function usePushNotifications() {
  const router = useRouter();
  const auth = useAuth();
  const signedIn = Boolean(auth.user);
  const isManagement = auth.isManagement;
  const initializing = auth.initializing;

  const listenerRef = useRef<{ remove?: () => void } | null>(null);
  const receivedRef = useRef<{ remove?: () => void } | null>(null);
  const coldStartHandled = useRef(false);
  /** Aynı bildirime iki kez yönlendirmeyi engeller (soğuk başlatma + dinleyici). */
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    setupNotificationHandlers();
  }, []);

  /* ---------- Kayıt: girişte ve her ön plana gelişte ---------- */
  useEffect(() => {
    if (!signedIn) return;

    void runPushRegistration(true);

    const onChange = (next: AppStateStatus) => {
      if (next === "active") void runPushRegistration(true);
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, [signedIn]);

  /* ---------- Bildirime dokunma ---------- */
  useEffect(() => {
    /* OTURUM GERİ YÜKLENENE KADAR BEKLE. Soğuk açılışta bu etki, AuthProvider
       kayıtlı jetonu doğrulamadan önce çalışır; o an `auth.user` boş,
       `isManagement` false'tur. Yanıt o anda tüketilseydi iki şey bozulurdu:
       korumalı hedefler /giris'e düşerdi ve MATCH_REQUEST bildirimi yönetim
       kullanıcısını da takım ekranına götürürdü. `coldStartHandled` yanıtın
       ikinci kez okunmasını engellediği için bu bir daha düzelmezdi. */
    if (initializing) return;

    let cancelled = false;

    const openFrom = (data: Record<string, unknown> | undefined, key: string) => {
      if (!data || lastHandled.current === key) return;
      lastHandled.current = key;
      const target = routeFromNotif(data, { isManagement });
      if (target) router.push(target as never);
    };

    (async () => {
      try {
        const Notifications = await import("expo-notifications");

        /* TESLİMAT DEFTERİ: uzak push gerçekten geldiyse kimliği yazılır.
           Yerel köprü (hooks/useNotificationBridge.ts) yazılmış kimlikleri
           atlar; aksi hâlde push zinciri çalışan cihazlarda aynı bildirim
           telefonda iki kez belirirdi. */
        receivedRef.current = Notifications.addNotificationReceivedListener((notification) => {
          markDelivered(
            notificationIdFromNotif(
              notification.request.content.data as Record<string, unknown>,
            ),
          );
        });

        // Uygulama arka plandayken/açıkken gelen dokunuşlar.
        listenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as Record<string, unknown>;
          // Dokunulan bildirim de gösterilmiş sayılır: köprü onu tekrar
          // göstermeye çalışmasın.
          markDelivered(notificationIdFromNotif(data));
          openFrom(data, response.notification.request.identifier);
        });

        // Kapalıyken bildirime dokunulup açıldıysa: yanıt burada bekliyor.
        if (!coldStartHandled.current) {
          coldStartHandled.current = true;
          const last = await Notifications.getLastNotificationResponseAsync();
          if (!cancelled && last) {
            openFrom(
              last.notification.request.content.data as Record<string, unknown>,
              last.notification.request.identifier
            );
          }
        }
      } catch {
        // Expo Go'da expo-notifications uzak bildirimi desteklemez; sessizce geç.
      }
    })();

    return () => {
      cancelled = true;
      listenerRef.current?.remove?.();
      receivedRef.current?.remove?.();
    };
  }, [initializing, isManagement]); // eslint-disable-line react-hooks/exhaustive-deps
}
