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
