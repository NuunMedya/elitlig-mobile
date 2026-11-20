/**
 * Push kaydının CANLI DURUMU — "bildirim gelmiyor" şikâyetini teşhis edilebilir kılar.
 *
 * NEDEN AYRI BİR MAĞAZA: kayıt uygulamada bir kez, kökte (usePushNotifications)
 * yapılır; ama sonucu Bildirim Tercihleri ekranının göstermesi gerekir. İki yerde
 * ayrı ayrı kayıt denemek hem izin penceresini iki kez açardı hem de birbirini
 * ezen iki farklı sonuç üretirdi. Bu yüzden kayıt tek yerde yapılır, sonucu
 * buradaki basit abonelik mağazasına yazılır, dinleyen ekranlar okur.
 */

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { del, post } from "@/lib/http";
import { registerForPush, type PushPrompt, type PushRegistration } from "@/lib/notifications";

/** Cihaz kaydının sunucuya yazılma durumu. */
export type ServerSyncState = "bekliyor" | "yazildi" | "hata" | "giris-yok";

export interface PushStatus extends PushRegistration {
  /** Kayıt hâlâ sürüyor mu (izin penceresi açık olabilir). */
  busy: boolean;
  /** Token sunucuya yazıldı mı — yazılmazsa bildirim ASLA gelmez. */
  server: ServerSyncState;
  /** Sunucu yazımı başarısızsa ham hata. */
  serverDetail?: string;
}

const INITIAL: PushStatus = {
  state: "hata",
  token: null,
  message: "Bildirim durumu henüz kontrol edilmedi.",
  busy: true,
  server: "bekliyor",
};

let current: PushStatus = INITIAL;
const listeners = new Set<(value: PushStatus) => void>();

/**
 * Sunucuya EN SON BAŞARIYLA yazılan token.
 *
 * NEDEN: kayıt, uygulama her ön plana geldiğinde çalışıyor (kullanıcı izni
 * sonradan verebilir, Expo token'ı yenilenebilir). Aynı token her seferinde
 * yeniden POST edilirse uygulama arka plandan her dönüşte gereksiz bir yazma
 * isteği atar. Token değişmediği ve son yazım başarılı olduğu sürece istek
 * atlanır; kullanıcı çıkış yaptığında `resetPushSync()` ile sıfırlanır ki
 * aynı cihaza giren yeni üye için kayıt mutlaka tekrarlansın.
 */
let syncedToken: string | null = null;

/** Anlık durum — hook dışından okumak için (yerel köprü push sağlığına bakar). */
export function getPushStatus(): PushStatus {
  return current;
}

/**
 * Çıkışta cihazı sunucudaki hesaptan ayırır. resetPushSync'ten ÖNCE ve oturum
 * jetonu hâlâ geçerliyken çağrılmalı (uç kimlik ister).
 *
 * NEDEN: token tabloda kalırsa çıkış yapan üyenin mesaj/teklif bildirimleri,
 * aynı telefona başka biri girene dek bu cihaza düşmeye devam ederdi.
 * En iyi çaba: ağ yoksa ya da yanıt gecikirse çıkış bekletilmez.
 */
export async function unregisterPushDevice(timeoutMs = 4000): Promise<void> {
  const token = syncedToken ?? current.token;
  if (!token) return;
  try {
    await Promise.race([
      del("/api/users/push-token", { token }),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Silinemezse bir sonraki girişte kayıt zaten yeni sahibine devredilir.
  }
}

/** Bu cihazın sunucuya yazılmış push token'ı (yoksa null). Şifre değişiminde
 *  sunucu bu token'ı korur, diğer cihazların kaydını siler. */
export function getSyncedPushToken(): string | null {
  return syncedToken;
}

/** Çıkışta çağrılır: bir sonraki girişte token yeniden yazılsın. */
export function resetPushSync(): void {
  syncedToken = null;
  current = { ...INITIAL };
  listeners.forEach((listener) => listener(current));
}

function publish(patch: Partial<PushStatus>) {
  current = { ...current, ...patch };
  listeners.forEach((listener) => listener(current));
}

/**
 * Kaydı çalıştırır ve token'ı sunucuya yazar.
 *
 * `signedIn` false ise token alınmaya çalışılmaz: sunucuya yazacak bir oturum
 * yokken izin penceresi açmak kullanıcıyı boşuna rahatsız eder ve token sahipsiz
 * kalır.
 */
export async function runPushRegistration(signedIn: boolean, prompt: PushPrompt = "always"): Promise<PushStatus> {
  publish({ busy: true });

  const result = await registerForPush(prompt);
  publish({ ...result, busy: false });

  if (!result.token) {
    publish({ server: "bekliyor" });
    return current;
  }

  if (!signedIn) {
    publish({ server: "giris-yok" });
    return current;
  }

  // Aynı token zaten yazıldıysa ağa çıkma.
  if (syncedToken === result.token && current.server === "yazildi") {
    publish({ server: "yazildi", serverDetail: undefined });
    return current;
  }

  try {
    // http katmanı Authorization başlığını AuthProvider'dan otomatik ekler.
    await post("/api/users/push-token", { token: result.token, platform: Platform.OS });
    syncedToken = result.token;
    publish({ server: "yazildi", serverDetail: undefined });
  } catch (error) {
    syncedToken = null;
    publish({
      server: "hata",
      serverDetail: error instanceof Error ? error.message : String(error),
    });
  }

  return current;
}

/** Ekranların okuduğu canlı durum. */
export function usePushStatus(): PushStatus & { retry: (signedIn: boolean) => Promise<void> } {
  const [value, setValue] = useState<PushStatus>(current);

  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  const retry = useCallback(async (signedIn: boolean) => {
    await runPushRegistration(signedIn);
  }, []);

  return { ...value, retry };
}

/** Durum → kullanıcıya gösterilecek ton. */
export function pushStatusTone(status: PushStatus): "win" | "warn" | "danger" | "neutral" {
  if (status.busy) return "neutral";
  if (status.state === "hazir") return status.server === "yazildi" ? "win" : "warn";
  if (status.state === "izin-yok") return "danger";
  return "warn";
}

/** Sunucu yazımının tek cümlelik açıklaması. */
export function serverSyncMessage(status: PushStatus): string {
  switch (status.server) {
    case "yazildi":
      return "Cihaz sunucuya kaydedildi.";
    case "giris-yok":
      return "Giriş yapılmadığı için cihaz sunucuya kaydedilmedi; bildirimler hesaba gönderilir.";
    case "hata":
      return "Cihaz sunucuya kaydedilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.";
    default:
      return status.token
        ? "Cihaz kaydı bekleniyor."
        : "Cihaz kimliği alınamadığı için sunucuya kayıt yapılamadı.";
  }
}
