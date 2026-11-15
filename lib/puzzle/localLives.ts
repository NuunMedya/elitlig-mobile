/**
 * MİSAFİR CANLARI (sözleşme §4) — giriş yapmamış oyuncunun canları cihazda:
 * oyun başına 5, eksikken 30 dakikada 1 dolar (sunucuyla aynı kural,
 * lib/offline/lives). Sonsuz ve bilgi oyunlarında her tur 1 can.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { DEFAULT_LIFE_MINUTES, DEFAULT_MAX_LIVES, lifeLabel, regenLife, spendLife, type LifeEntry } from "../offline/lives";

const KEY = "elitlig.guestLives.v1";
const MAX = DEFAULT_MAX_LIVES;
const MINUTES = DEFAULT_LIFE_MINUTES;

type Store = Record<string, LifeEntry>;
let memory: Store | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<Store> {
  if (memory) return memory;
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  try {
    memory = raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    memory = {};
  }
  return memory;
}

async function save(next: Store) {
  memory = next;
  listeners.forEach((fn) => fn());
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

const entryOf = (store: Store, game: string) => regenLife(store[game] ?? { lives: MAX, next_life_at: null }, MAX, MINUTES);

/** Misafirin bir oyundaki canını 1 düşürür; can yoksa false. */
export async function spendLocalLife(game: string): Promise<boolean> {
  const store = await load();
  const cur = entryOf(store, game);
  if (cur.lives < 1) return false;
  await save({ ...store, [game]: spendLife(cur, MAX, MINUTES) });
  return true;
}

export async function addLocalLife(game: string, n = 1) {
  const store = await load();
  const cur = entryOf(store, game);
  const lives = Math.min(MAX, cur.lives + n);
  await save({ ...store, [game]: { lives, next_life_at: lives >= MAX ? null : cur.next_life_at } });
}

/** Misafir canı + geri sayım (saniyede bir tazelenir, yalnız eksikken). */
export function useLocalLives(game: string | null | undefined): { lives: number; max: number; label: string | null; nextAt: string | null; spend: () => Promise<boolean> } {
  const [entry, setEntry] = useState<LifeEntry>({ lives: MAX, next_life_at: null });
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!game) return undefined;
    let alive = true;
    const refresh = () => {
      void load().then((s) => alive && setEntry(entryOf(s, game)));
    };
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, [game]);

  const missing = entry.lives < MAX;
  useEffect(() => {
    if (!missing || !game) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (memory) setEntry(entryOf(memory, game));
    }, 1000);
    return () => clearInterval(id);
  }, [missing, game]);

  const spend = useCallback(() => (game ? spendLocalLife(game) : Promise.resolve(true)), [game]);
  return { lives: entry.lives, max: MAX, label: lifeLabel(entry, MAX), nextAt: entry.next_life_at, spend };
}
