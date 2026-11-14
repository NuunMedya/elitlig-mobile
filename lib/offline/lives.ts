/**
 * Can kuralı — sunucuyla AYNI hesap (sözleşme §4): en çok `max`, eksikken
 * her `minutes` dakikada 1 dolar. Çevrimdışı ayna ve misafir canları bu saf
 * işlevlerle yürür.
 */

export interface LifeEntry {
  lives: number;
  next_life_at: string | null;
}

export const DEFAULT_MAX_LIVES = 5;
export const DEFAULT_LIFE_MINUTES = 30;

/** Geçen süreyi uygular: dolan canlar eklenir, sıradaki an ileri alınır. */
export function regenLife(entry: LifeEntry, max: number, minutes: number, now = Date.now()): LifeEntry {
  const step = Math.max(1, minutes) * 60_000;
  let lives = Math.max(0, Math.min(max, entry.lives));
  if (lives >= max) return { lives, next_life_at: null };
  let next = entry.next_life_at ? new Date(entry.next_life_at).getTime() : now + step;
  if (!Number.isFinite(next)) next = now + step;
  if (now >= next) {
    const gained = 1 + Math.floor((now - next) / step);
    lives = Math.min(max, lives + gained);
    next += gained * step;
  }
  return { lives, next_life_at: lives >= max ? null : new Date(next).toISOString() };
}

/** Bir can düşer (doluyken düşerse sayaç şimdi başlar). */
export function spendLife(entry: LifeEntry, max: number, minutes: number, now = Date.now()): LifeEntry {
  const cur = regenLife(entry, max, minutes, now);
  if (cur.lives < 1) return cur;
  const lives = cur.lives - 1;
  return { lives, next_life_at: cur.next_life_at ?? new Date(now + Math.max(1, minutes) * 60_000).toISOString() };
}

/** "12:05" biçiminde sıradaki cana kalan süre (dolu ya da sayaç yoksa null). */
export function lifeLabel(entry: LifeEntry, max: number, now = Date.now()): string | null {
  if (entry.lives >= max || !entry.next_life_at) return null;
  const left = Math.max(0, new Date(entry.next_life_at).getTime() - now);
  const min = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
