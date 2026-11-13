/**
 * OYUN KAYITLARI — cihazdaki oyun ilerlemesinin HESABA bağlı hâli.
 *
 * Eskiden Savunma Hattı bölümleri, Kariyer Yolu antrenman dağılımı, Kulüp
 * Şehri forma rengi, arena kadro seçimleri ve kişisel rekorlar yalnız
 * cihazdaydı (AsyncStorage, hesaptan bağımsız anahtarlar): telefon değişince
 * kaybolur, aynı telefonda başka hesapla girince eski hesabınki görünürdü.
 *
 * Şimdi:
 *   · Yerel önbellek HESAP başınadır: `elitlig.saves.v1.<üye id>` (misafir:
 *     `…guest`). Oyun her zaman önce buradan okur — çevrimdışı da oynanır.
 *   · Girişli üyede kayıt sunucuya da yazılır (GET/PUT /api/puzzle/saves,
 *     elitlig-server services/puzzle/saves.js) ve oyun açılınca sunucudaki
 *     ile BİRLEŞTİRİLİR. Değişiklik kısa bir beklemeyle (debounce) yollanır.
 *   · Misafir yalnız cihazda oynar; misafir kaydı hiçbir hesaba geçmez.
 *   · İLK GEÇİŞ: eski (hesapsız) cihaz anahtarları ilk açılan HESABA taşınır,
 *     sunucuya yüklenir ve cihazdan silinir — ikinci bir hesaba geçmez.
 *     Misafir kovası aynı eski veriyi yalnız kopyalar (silmez).
 *
 * BİRLEŞTİRME (sunucudakiyle aynı kurallar):
 *   max   — savunma (açılan bölüm, bölüm yıldızı), bests (rekorlar): büyüğü kalır
 *   spent — kariyer: daha çok puan harcanmış dağılım kalır
 *   last  — city_kit: son seçim kalır; roster: oyun oyun son seçim kalır
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";
import { CITY_KIT_KEY, CLUB_KITS, PREMIUM_KITS, type ClubKit } from "@/lib/puzzle/cityPalette";
import { currentAuthToken, get, put } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/* ============================ VERİ TİPLERİ ============================ */

export interface SaveData {
  savunma: { unlocked: number; stars: Record<string, number> };
  kariyer: { spent: number; gains: { sut: number; pas: number; teknik: number; hiz: number } };
  city_kit: { kit: string };
  roster: Record<string, number>;
  bests: Record<string, number>;
}
export type SaveKey = keyof SaveData;

export interface ServerSave {
  data: unknown;
  v: number;
  updated_at?: string | null;
}

type Json = Record<string, unknown>;

interface Entry {
  data: Json;
  /** Bilinen en son sunucu sürümü (0: sunucuda yok). */
  v: number;
  /** Sunucuya henüz yazılmamış yerel değişiklik. */
  dirty: boolean;
}
type Bucket = Partial<Record<SaveKey, Entry>>;

/* ============================== KURALLAR ============================== */

const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const int = (value: unknown, min: number, max: number): number | null => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};
const GAME_KEY = /^[a-z][a-z0-9_]{0,23}$/;

interface Rule<T> {
  clean: (raw: unknown) => T | null;
  /** a: eski / öbür taraf, b: yeni / öncelikli taraf. */
  merge: (a: T, b: T) => T;
}

const positiveMap = (raw: unknown, max: number): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(asObject(raw))) {
    const n = int(v, 0, max);
    if (GAME_KEY.test(k) && n != null && n > 0) out[k] = n;
  }
  return out;
};

const RULES: { [K in SaveKey]: Rule<SaveData[K]> } = {
  savunma: {
    clean(raw) {
      const src = asObject(raw);
      const stars: Record<string, number> = {};
      for (const [k, v] of Object.entries(asObject(src.stars))) {
        const n = int(k, 0, 999);
        const s = int(v, 0, 3);
        if (n != null && n >= 1 && n <= 99 && s != null && s >= 1) stars[String(n)] = s;
      }
      let unlocked = int(src.unlocked, 1, 99) ?? 1;
      for (const k of Object.keys(stars)) unlocked = Math.max(unlocked, Math.min(99, Number(k) + 1));
      return { unlocked, stars };
    },
    merge(a, b) {
      const stars = { ...a.stars };
      for (const [k, v] of Object.entries(b.stars)) stars[k] = Math.max(stars[k] ?? 0, v);
      return { unlocked: Math.max(a.unlocked, b.unlocked), stars };
    },
  },
  kariyer: {
    clean(raw) {
      const src = asObject(raw);
      const g = asObject(src.gains);
      return {
        spent: int(src.spent, 0, 99999) ?? 0,
        gains: { sut: int(g.sut, 0, 9999) ?? 0, pas: int(g.pas, 0, 9999) ?? 0, teknik: int(g.teknik, 0, 9999) ?? 0, hiz: int(g.hiz, 0, 9999) ?? 0 },
      };
    },
    merge: (a, b) => (b.spent >= a.spent ? b : a),
  },
  city_kit: {
    clean(raw) {
      const kit = String(asObject(raw).kit ?? "").trim();
      return /^[a-z0-9_-]{1,32}$/i.test(kit) ? { kit } : null;
    },
    merge: (_a, b) => b,
  },
  roster: {
    clean: (raw) => positiveMap(raw, 2 ** 31 - 1),
    merge: (a, b) => ({ ...a, ...b }),
  },
  bests: {
    clean: (raw) => positiveMap(raw, 1e9),
    merge(a, b) {
      const out = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
      return out;
    },
  },
};

const SAVE_KEYS = Object.keys(RULES) as SaveKey[];
const ruleOf = (key: SaveKey) => RULES[key] as unknown as Rule<Json>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Kayıt boş mu (yüklemeye değmez). */
function isEmpty(key: SaveKey, data: Json): boolean {
  if (key === "savunma") return Number(data.unlocked) <= 1 && Object.keys(asObject(data.stars)).length === 0;
  if (key === "kariyer") return Number(data.spent) <= 0;
  if (key === "city_kit") return !data.kit;
  return Object.keys(data).length === 0;
}

/* ============================ YEREL ÖNBELLEK ============================ */

export const GUEST = "guest";
const bucketKey = (owner: string) => `elitlig.saves.v1.${owner}`;

const buckets = new Map<string, Bucket>();
const loading = new Map<string, Promise<Bucket>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/* — Eski (hesapsız) cihaz anahtarları — ilk geçişte bir kez taşınır. — */
const LEGACY = {
  savunma: "elitlig.arena.savunma.store.v1",
  city_kit: CITY_KIT_KEY,
  roster: {
    penalti: "elitlig.penalti.shooter.v1",
    slalom: "elitlig.slalom.runner.v1",
    sektir: "elitlig.sektir.juggler.v1",
    savunma: "elitlig.savunma.captain.v1",
    kadro: "elitlig.kadro.captain.v1",
  } as Record<string, string>,
  bests: { ...ARENA_BEST_KEYS, gunun: "elitlig.gunun.best.v1" } as Record<string, string>,
};
const kariyerLegacyKey = (userId: string) => `elitlig.kariyer.v1.${userId}`;

async function readLegacy(owner: string): Promise<{ bucket: Bucket; keys: string[] }> {
  const keys = [LEGACY.savunma, LEGACY.city_kit, ...Object.values(LEGACY.roster), ...Object.values(LEGACY.bests)];
  if (owner !== GUEST) keys.push(kariyerLegacyKey(owner));
  const pairs = await AsyncStorage.multiGet(keys).catch(() => [] as readonly [string, string | null][]);
  const raw = new Map(pairs.map(([k, v]) => [k, v]));
  const parse = (k: string): unknown => {
    const v = raw.get(k);
    if (!v) return null;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const fromAccount = owner !== GUEST;
  const bucket: Bucket = {};
  const add = (key: SaveKey, data: Json | null) => {
    if (data && !isEmpty(key, data)) bucket[key] = { data, v: 0, dirty: fromAccount };
  };
  add("savunma", ruleOf("savunma").clean(parse(LEGACY.savunma)));
  const kit = raw.get(LEGACY.city_kit);
  if (kit) add("city_kit", ruleOf("city_kit").clean({ kit }));
  const roster: Json = {};
  for (const [game, k] of Object.entries(LEGACY.roster)) if (raw.get(k)) roster[game] = raw.get(k);
  add("roster", ruleOf("roster").clean(roster));
  const bests: Json = {};
  for (const [game, k] of Object.entries(LEGACY.bests)) if (raw.get(k)) bests[game] = raw.get(k);
  add("bests", ruleOf("bests").clean(bests));
  if (fromAccount) add("kariyer", ruleOf("kariyer").clean(parse(kariyerLegacyKey(owner))));
  return { bucket, keys: keys.filter((k) => raw.get(k) != null) };
}

function persist(owner: string) {
  const bucket = buckets.get(owner);
  if (bucket) void AsyncStorage.setItem(bucketKey(owner), JSON.stringify(bucket)).catch(() => undefined);
}

/** Hesabın yerel kovası (ilk açılışta eski cihaz kaydı taşınır). */
export function loadBucket(owner: string): Promise<Bucket> {
  const ready = buckets.get(owner);
  if (ready) return Promise.resolve(ready);
  const pending = loading.get(owner);
  if (pending) return pending;
  const job = (async () => {
    let bucket: Bucket | null = null;
    try {
      const raw = await AsyncStorage.getItem(bucketKey(owner));
      if (raw) {
        const parsed = asObject(JSON.parse(raw));
        bucket = {};
        for (const key of SAVE_KEYS) {
          const entry = asObject(parsed[key]);
          const data = ruleOf(key).clean(entry.data);
          if (data) bucket[key] = { data, v: int(entry.v, 0, 2 ** 31 - 1) ?? 0, dirty: entry.dirty === true };
        }
      }
    } catch {
      bucket = null;
    }
    if (!bucket) {
      const legacy = await readLegacy(owner);
      bucket = legacy.bucket;
      buckets.set(owner, bucket);
      persist(owner);
      // Hesaba taşınan eski kayıt cihazdan kalkar: ikinci bir hesaba geçmez.
      if (owner !== GUEST && legacy.keys.length) void AsyncStorage.multiRemove(legacy.keys).catch(() => undefined);
      if (owner !== GUEST && SAVE_KEYS.some((k) => bucket?.[k]?.dirty)) scheduleUpload(owner);
    } else {
      buckets.set(owner, bucket);
    }
    loading.delete(owner);
    notify();
    return bucket;
  })();
  loading.set(owner, job);
  return job;
}

export function readSave<K extends SaveKey>(owner: string | null, key: K): SaveData[K] | null {
  if (!owner) return null;
  return (buckets.get(owner)?.[key]?.data as SaveData[K] | undefined) ?? null;
}

/** Yerel değişiklik: kurala göre birleşir, girişliyse sunucuya yazılmak üzere sıraya girer. */
export function writeSave<K extends SaveKey>(owner: string, key: K, next: SaveData[K]): void {
  const bucket = buckets.get(owner);
  if (!bucket) {
    void loadBucket(owner).then(() => writeSave(owner, key, next));
    return;
  }
  const rule = ruleOf(key);
  const clean = rule.clean(next);
  if (!clean) return;
  const current = bucket[key];
  const data = current ? rule.merge(current.data, clean) : clean;
  if (current && same(current.data, data)) return;
  bucket[key] = { data, v: current?.v ?? 0, dirty: owner !== GUEST };
  buckets.set(owner, { ...bucket });
  persist(owner);
  notify();
  if (owner !== GUEST) scheduleUpload(owner);
}

/* ================================ SUNUCU ================================ */

export const savesKey = (userId: number | string) => ["puzzle", "saves", String(userId)] as const;

export const getSaves = () => get<{ saves: Partial<Record<SaveKey, ServerSave>> }>("/api/puzzle/saves");
const putSave = (key: SaveKey, data: Json, v: number) =>
  put<{ key: SaveKey; save: ServerSave }>(`/api/puzzle/saves/${key}`, { data, v });

/** Aynı sunucu yanıtı bir kez birleştirilir (birden çok kanca aynı veriyi görür). */
const syncedPayload = new Map<string, unknown>();

/** Sunucu kaydını yerel kovayla birleştirir; sunucuda eksik/eski kalanı yükler. */
export async function mergeServer(owner: string, saves: Partial<Record<SaveKey, ServerSave>>): Promise<void> {
  if (owner === GUEST || syncedPayload.get(owner) === saves) return;
  syncedPayload.set(owner, saves);
  const bucket = { ...(await loadBucket(owner)) };
  let changed = false;
  let upload = false;
  for (const key of SAVE_KEYS) {
    const rule = ruleOf(key);
    const server = saves[key];
    const serverData = server ? rule.clean(server.data) : null;
    const serverV = server ? int(server.v, 0, 2 ** 31 - 1) ?? 0 : 0;
    const local = bucket[key];
    if (!serverData) {
      // Sunucuda yok: yerelde bir şey varsa (ilk geçiş) yüklenir.
      if (local && !isEmpty(key, local.data) && !local.dirty) {
        bucket[key] = { ...local, dirty: true };
        changed = upload = true;
      } else if (local?.dirty) upload = true;
      continue;
    }
    if (!local) {
      bucket[key] = { data: serverData, v: serverV, dirty: false };
      changed = true;
      continue;
    }
    // Yerel zaten daha yeni bir sunucu sürümünü biliyorsa (eski önbellek yanıtı) dokunulmaz.
    if (serverV < local.v) {
      if (local.dirty) upload = true;
      continue;
    }
    // Yazılmamış yerel değişiklik öncelikli; yoksa sunucu öncelikli.
    const data = local.dirty ? rule.merge(serverData, local.data) : rule.merge(local.data, serverData);
    const dirty = !same(data, serverData);
    if (!same(data, local.data) || dirty !== local.dirty || serverV !== local.v) {
      bucket[key] = { data, v: serverV, dirty };
      changed = true;
    }
    if (dirty) upload = true;
  }
  if (changed) {
    buckets.set(owner, bucket);
    persist(owner);
    notify();
  }
  if (upload) scheduleUpload(owner);
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const UPLOAD_DELAY = 1500;

function scheduleUpload(owner: string) {
  if (owner === GUEST) return;
  const token = currentAuthToken();
  const prev = timers.get(owner);
  if (prev) clearTimeout(prev);
  timers.set(
    owner,
    setTimeout(() => {
      timers.delete(owner);
      // Bu arada oturum değiştiyse (çıkış / başka hesap) yazılmaz: kayıt kirli
      // kalır ve bu hesap yeniden girince yüklenir — başka hesaba geçmez.
      if (!token || currentAuthToken() !== token || activeOwner !== owner) return;
      void flush(owner);
    }, UPLOAD_DELAY),
  );
}

let activeOwner: string | null = null;

async function flush(owner: string) {
  const bucket = buckets.get(owner);
  if (!bucket) return;
  for (const key of SAVE_KEYS) {
    const sent = bucket[key];
    if (!sent?.dirty) continue;
    try {
      const response = await putSave(key, sent.data, sent.v);
      if (activeOwner !== owner) return;
      const latest = buckets.get(owner) ?? bucket;
      const now = latest[key];
      const serverData = ruleOf(key).clean(response.save?.data);
      if (!now || !serverData) continue;
      const v = int(response.save?.v, 0, 2 ** 31 - 1) ?? now.v;
      // Gönderim sürerken yeni değişiklik geldiyse o da sıraya girer.
      const changedMeanwhile = now !== sent;
      const data = changedMeanwhile ? ruleOf(key).merge(serverData, now.data) : ruleOf(key).merge(now.data, serverData);
      const next = { ...latest, [key]: { data, v, dirty: !same(data, serverData) } };
      buckets.set(owner, next);
      persist(owner);
      notify();
      if (next[key]?.dirty) scheduleUpload(owner);
    } catch {
      // Ağ hatası: kayıt kirli kalır, sonraki değişiklikte / açılışta yeniden denenir.
      return;
    }
  }
}

/* ================================ KANCA ================================ */

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/**
 * Hesabın bir oyun kaydı. `data` null: kayıt yok (ya da yükleniyor);
 * `ready`: yerel kova okundu ve (girişliyse) sunucu yanıtı geldi ya da
 * alınamadı — ilk kararı sunucuya göre vermesi gereken oyunlar bunu bekler.
 */
export function useGameSave<K extends SaveKey>(key: K | null) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const owner = auth.initializing ? null : userId != null ? String(userId) : GUEST;

  useEffect(() => {
    if (!owner) return;
    activeOwner = owner;
    void loadBucket(owner);
  }, [owner]);

  const query = useQuery({
    queryKey: savesKey(userId ?? 0),
    queryFn: getSaves,
    enabled: userId != null,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (owner && owner !== GUEST && query.data?.saves) void mergeServer(owner, query.data.saves);
  }, [owner, query.data]);

  const data = useSyncExternalStore(
    subscribe,
    () => (key ? readSave(owner, key) : null),
    () => null,
  );
  const loaded = useSyncExternalStore(
    subscribe,
    () => (owner ? buckets.has(owner) : false),
    () => false,
  );
  // Çevrimdışıyken (sorgu duraklar) beklenmez: oyun yerel kayıtla sürer.
  const serverSettled = owner === GUEST || query.isFetched || query.fetchStatus !== "fetching";

  const update = useCallback(
    (next: SaveData[K]) => {
      if (owner && key) writeSave(owner, key, next);
    },
    [owner, key],
  );

  return { data, update, ready: loaded && serverSettled, owner };
}

/* ============================ KULÜP RENKLERİ ============================ */

/**
 * Kulüp Şehri forma rengi (hesaba bağlı; eski cihaz anahtarı CITY_KIT_KEY
 * ilk açılışta taşınır). Seçilmemişse ilk renk.
 */
export function useClubKit(): [ClubKit, (next: ClubKit) => void] {
  const save = useGameSave("city_kit");
  const kit = [...CLUB_KITS, ...PREMIUM_KITS].find((k) => k.key === save.data?.kit) ?? CLUB_KITS[0];
  const { update } = save;
  const choose = useCallback((next: ClubKit) => update({ kit: next.key }), [update]);
  return [kit, choose];
}
