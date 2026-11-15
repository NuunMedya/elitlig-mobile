/**
 * TESLİMAT DEFTERİ — "bu bildirim telefonda zaten göründü mü?"
 *
 * NEDEN VAR: bildirimler uygulamaya İKİ ayrı yoldan ulaşabiliyor:
 *   1. Uzak push (Expo → APNs/FCM) — sunucu gönderir, işletim sistemi gösterir.
 *   2. Yerel köprü (hooks/useNotificationBridge.ts) — uygulama bildirim
 *      merkezini yoklar ve yenileri KENDİSİ yerel bildirim olarak gösterir.
 *
 * İkinci yol, push altyapısı (FCM/APNs kimlikleri) kurulu olmadığında bile
 * bildirimlerin görünmesini sağlar; ama ikisi birden çalıştığında aynı olay
 * telefonda İKİ KEZ belirir. Bu defter o çakışmayı önler: uzak push geldiğinde
 * bildirimin kimliği buraya yazılır, köprü de yazılmış kimlikleri atlar.
 *
 * NEDEN KALICI: uygulama kapanıp açıldığında köprü bildirim merkezini baştan
 * okur. Defter yalnız bellekte tutulsaydı, her açılışta son bildirimler
 * "yeni" sanılıp tekrar gösterilirdi.
 *
 * NEDEN SINIRLI: yalnız son `MAX_ENTRIES` kimlik saklanır. Bildirim kimlikleri
 * artan sayılar olduğu için eski kayıtların düşmesi zararsızdır — köprü zaten
 * kendi "en yüksek görülen kimlik" işaretini ayrıca tutar ve eskiye dönmez.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "elitlig.notifLedger.v1";

/** Defterde tutulan en fazla kimlik sayısı. */
const MAX_ENTRIES = 200;

/** Bellek kopyası — her okuma için AsyncStorage'a gitmemek içindir. */
let cache: number[] | null = null;
/** Yazma sırası: art arda gelen işaretlemeler birbirini ezmesin. */
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<number[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    cache = Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    // Bozuk kayıt: boş defterle devam et. Kötü hâlde bir bildirim iki kez
    // görünür; bu, hiç görünmemesinden iyidir.
    cache = [];
  }
  return cache;
}

/** Bir bildirim telefonda gösterildi olarak işaretlenir. */
export function markDelivered(notificationId: number | null | undefined): void {
  if (!Number.isInteger(notificationId) || (notificationId as number) <= 0) return;
  const id = notificationId as number;

  writeChain = writeChain.then(async () => {
    const list = await load();
    if (list.includes(id)) return;
    const next = [...list, id].slice(-MAX_ENTRIES);
    cache = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Depolama yazılamadıysa bellek kopyası yine de doğru; oturum boyunca çalışır.
    }
  });
}

/** Birden çok kimliği tek yazımda işaretler (köprünün toplu gösterimi için). */
export function markManyDelivered(notificationIds: number[]): void {
  const valid = notificationIds.filter((id) => Number.isInteger(id) && id > 0);
  if (!valid.length) return;

  writeChain = writeChain.then(async () => {
    const list = await load();
    const merged = [...list];
    valid.forEach((id) => {
      if (!merged.includes(id)) merged.push(id);
    });
    const next = merged.slice(-MAX_ENTRIES);
    cache = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Bkz. markDelivered.
    }
  });
}

/** Bu bildirim daha önce telefonda gösterildi mi? */
export async function wasDelivered(notificationId: number): Promise<boolean> {
  const list = await load();
  return list.includes(notificationId);
}

/** Defterin tamamı — köprü tek okumada süzme yapabilsin diye. */
export async function deliveredIds(): Promise<ReadonlySet<number>> {
  return new Set(await load());
}

/**
 * Çıkış yapıldığında defter temizlenir.
 *
 * ZORUNLU: aynı cihazda başka bir üye giriş yaparsa, önceki üyenin bildirim
 * kimlikleri yeni üyeninkilerle çakışabilir ve yeni üyenin bildirimleri
 * "zaten gösterildi" sanılıp yutulurdu.
 */
export async function clearLedger(): Promise<void> {
  cache = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silinemese bile bellek kopyası boş; oturum boyunca doğru davranır.
  }
}

/* =============================================================================
   UZAK PUSH KANITI — "bu cihazda push zinciri gerçekten çalışıyor mu?"
   -----------------------------------------------------------------------------
   Token'ın alınıp sunucuya yazılması push'un TELEFONA ULAŞTIĞINI kanıtlamaz:
   EAS'te FCM/APNs kimliği eksikse Expo her gönderimi reddeder, istemci bunu
   hiç öğrenmez. Tek güvenilir kanıt, telefona gerçekten bir uzak push
   düşmesidir. Köprü bu kanıta bakarak iki moddan birini seçer:
     · push çalışıyor  → köprü bildirim GÖSTERMEZ (push zaten gösterdi; arka
                         planda gelenler açılışta ikinci kez belirmesin);
     · push çalışmıyor → köprü yedek olarak yerel bildirim gösterir.
   Kanıt cihaza aittir, üyeye değil; çıkışta silinmez.
   ========================================================================== */

const REMOTE_SEEN_KEY = "elitlig.push.lastRemoteAt.v1";

let remoteSeenCache: number | null = null;

/** Bir uzak push'un telefona ulaştığını kaydeder. */
export function markRemotePushSeen(at: number = Date.now()): void {
  if (remoteSeenCache !== null && remoteSeenCache >= at) return;
  remoteSeenCache = at;
  AsyncStorage.setItem(REMOTE_SEEN_KEY, String(at)).catch(() => undefined);
}

/** Son uzak push'un zamanı (ms); hiç görülmediyse null. */
export async function lastRemotePushAt(): Promise<number | null> {
  if (remoteSeenCache !== null) return remoteSeenCache;
  try {
    const raw = Number(await AsyncStorage.getItem(REMOTE_SEEN_KEY));
    remoteSeenCache = Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    remoteSeenCache = null;
  }
  return remoteSeenCache;
}

/**
 * Bildirimin İÇERİK anahtarı (tür + varlık).
 *
 * NEDEN: toplu gönderimde (models/PanelNotification.js → afterBulkCreate)
 * bildirim kimliği alıcıya göre değiştiği için push yükünde `notification_id`
 * YOKTUR; deftere kimlikle yazılamaz. Köprü bu bildirimleri bildirim
 * gölgesindeki push'larla tür + varlık üzerinden eşleştirir.
 */
export function contentKeyOf(data: Record<string, unknown> | null | undefined): string | null {
  const type = String(data?.type ?? "").trim().toUpperCase();
  if (!type) return null;
  const entityType = String(data?.entity_type ?? "").trim().toUpperCase();
  const entityId = String(data?.entity_public_id ?? "").trim();
  return `${type}|${entityType}|${entityId}`;
}
