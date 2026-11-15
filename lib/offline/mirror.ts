/**
 * YEREL AYNA (sözleşme §7) — son bilinen `PuzzleMe` (ilerleme, can, jeton,
 * güçlendirici) hesap başına AsyncStorage'da. Çevrimdışıyken harita, can
 * sayacı (30 dk kuralı yerelde işler) ve bölüm kilidi buradan okunur;
 * kuyruğa yazılan sonuçlar aynaya iyimser olarak işlenir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LifeGameKey, PuzzleMe, PuzzleProfile } from "../puzzle/api";
import type { PuzzleGameKey } from "../puzzle/types";
import { DEFAULT_LIFE_MINUTES, DEFAULT_MAX_LIVES, regenLife, spendLife } from "./lives";

const KEY = (userId: number) => `elitlig.offline.me.v1.${userId}`;

let lastSaved: { userId: number; data: PuzzleMe } | null = null;

export function saveMirror(userId: number, me: PuzzleMe) {
  if (lastSaved && lastSaved.userId === userId && lastSaved.data === me) return;
  lastSaved = { userId, data: me };
  void AsyncStorage.setItem(KEY(userId), JSON.stringify(me)).catch(() => undefined);
}

/** Aynayı okur ve canlara geçen süreyi uygular. */
export async function loadMirror(userId: number): Promise<PuzzleMe | null> {
  const raw = await AsyncStorage.getItem(KEY(userId)).catch(() => null);
  if (!raw) return null;
  try {
    return regenMirror(JSON.parse(raw) as PuzzleMe);
  } catch {
    return null;
  }
}

const maxOf = (p: PuzzleProfile) => p.max_lives || DEFAULT_MAX_LIVES;
const minutesOf = (p: PuzzleProfile) => p.life_minutes || DEFAULT_LIFE_MINUTES;

/** Bütün oyunların canına geçen süreyi uygular (saf). */
export function regenMirror(me: PuzzleMe, now = Date.now()): PuzzleMe {
  const p = me.profile;
  const byGame: NonNullable<PuzzleProfile["lives_by_game"]> = {};
  for (const [k, v] of Object.entries(p.lives_by_game ?? {})) {
    if (v) byGame[k as LifeGameKey] = regenLife(v, maxOf(p), minutesOf(p), now);
  }
  const pool = regenLife({ lives: p.lives, next_life_at: p.next_life_at }, maxOf(p), minutesOf(p), now);
  return { ...me, profile: { ...p, ...pool, lives_by_game: byGame } };
}

/** Bir oyunun 1 canı düşer (çevrimdışı kayıp / çevrimdışı arena turu). */
export function spendMirrorLife(me: PuzzleMe, game: LifeGameKey): PuzzleMe {
  const p = me.profile;
  const cur = p.lives_by_game?.[game] ?? { lives: maxOf(p), next_life_at: null };
  const next = spendLife(cur, maxOf(p), minutesOf(p));
  return { ...me, profile: { ...p, lives_by_game: { ...(p.lives_by_game ?? {}), [game]: next } } };
}

/** Çevrimdışı bitirilen bölüm aynaya iyimser işlenir (sunucu eşitlemede asıl hesabı yapar). */
export function applyOfflineLevel(
  me: PuzzleMe,
  ev: { game: PuzzleGameKey; level: number; won: boolean; stars: number; boosters_used?: Record<string, number> },
): { me: PuzzleMe; starsGained: number } {
  let next = me;
  // Harcanan güçlendiriciler stoktan düşer.
  if (ev.boosters_used && Object.keys(ev.boosters_used).length) {
    const boosters = { ...next.profile.boosters };
    for (const [k, n] of Object.entries(ev.boosters_used)) boosters[k] = Math.max(0, (boosters[k] ?? 0) - n);
    next = { ...next, profile: { ...next.profile, boosters } };
  }
  if (!ev.won) return { me: spendMirrorLife(next, ev.game), starsGained: 0 };
  const prog = next.games[ev.game] ?? { game: ev.game, title: ev.game, level: 0, stars: {}, total_stars: 0 };
  const old = Number(prog.stars[String(ev.level)] || 0);
  const stars = Math.max(old, ev.stars);
  const delta = stars - old;
  const updated = {
    ...prog,
    level: ev.level === prog.level + 1 ? ev.level : prog.level,
    stars: { ...prog.stars, [String(ev.level)]: stars },
    total_stars: prog.total_stars + delta,
  };
  next = {
    ...next,
    games: { ...next.games, [ev.game]: updated },
    profile: { ...next.profile, stars: (next.profile.stars ?? 0) + delta },
  };
  return { me: next, starsGained: delta };
}
