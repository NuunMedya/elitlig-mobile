/**
 * GÜNLÜK GİRİŞ ÖDÜLÜ + SERİ — saf görünüm hesapları (sunucu: Ekonomi A5).
 *
 * Sunucu durumu (`DailyStatus`) ekrana hazır bir görünüme çevrilir: 7 günlük
 * döngünün hangi günü bugün, hangileri alındı; seri, en iyi seri, sıradaki
 * uzun seri ödülü ve ona ilerleme; seri koruyucu teklifi.
 *
 * ESKİ SUNUCU: yalnız { available, streak, next_streak, reward, rewards }
 * gelir (jeton + güçlendirici, seri 7'de tavan). Eksik alanlar burada
 * türetilir; yıldız yoksa yalnız jeton gösterilir, uzun seri ve koruyucu
 * bölümleri gizlenir.
 */

import type { DailyMilestone, DailyReward, DailySaver, DailyStatus } from "./api";

/** Uzun seri ödülleri — sunucu `milestones` yollamazsa yedek (adlar sunucuyla aynı). */
export const DAILY_MILESTONES_FALLBACK: readonly DailyMilestone[] = [
  { days: 14, key: "seri_cesmesi", title: "Seri Çeşmesi", landmark: "seri_cesmesi", stars: 0 },
  { days: 30, key: "sadik_baskan_heykeli", title: "Sadık Başkan heykeli", landmark: "sadik_baskan_heykeli", stars: 100 },
  { days: 60, key: "isik_gosterisi", title: "Işık gösterisi", landmark: "isik_gosterisi", stars: 0 },
  { days: 100, key: "altin_kupa_aniti", title: "Altın kupa anıtı", landmark: "altin_kupa_aniti", stars: 0 },
];

/** Uzun seri yapılarının simgesi (Ionicons). */
export const LANDMARK_ICONS: Record<string, string> = {
  seri_cesmesi: "water",
  sadik_baskan_heykeli: "person",
  isik_gosterisi: "sparkles",
  altin_kupa_aniti: "trophy",
};

export type DayState = "claimed" | "today" | "upcoming";

export interface DailyDay {
  day: number;
  reward: DailyReward;
  state: DayState;
}

export interface DailyView {
  available: boolean;
  /** Yeni sunucu alanları var mı (yıldız, uzun seri, koruyucu). */
  v2: boolean;
  /** Şu anki seri (bugün alınmadıysa ve seri kırıldıysa 0). */
  streak: number;
  /** Bugün alınınca olacak seri; alındıysa bugünkü seri. */
  nextStreak: number;
  best: number;
  /** 7'lik döngüde bugünün günü (1–7). */
  cycleDay: number;
  days: DailyDay[];
  today: DailyReward;
  /** Yarının ödülü (bugün alındıysa gösterilir). */
  tomorrow: DailyReward | null;
  milestones: (DailyMilestone & { reached: boolean })[];
  next: { days: number; title: string; key: string; inDays: number; progress: number; from: number } | null;
  saver: DailySaver | null;
  /** Seri koruyucu ŞİMDİ önerilmeli mi (bir gün kaçırıldı, hak var, bugün alınmadı). */
  offerSaver: boolean;
  starsTotal: number;
}

const cycleOf = (n: number, len: number) => ((Math.max(1, n) - 1) % Math.max(1, len)) + 1;

export function dailyView(raw: DailyStatus | null | undefined): DailyView | null {
  if (!raw || !Array.isArray(raw.rewards) || !raw.rewards.length) return null;
  const len = raw.rewards.length;
  const v2 = raw.rewards.some((r) => r.stars != null) || raw.milestones != null;
  const available = Boolean(raw.available);
  const nextStreak = Math.max(available ? 1 : 0, Number(raw.next_streak) || 0);
  const streak = Math.max(0, Number(raw.streak) || 0);
  const cycleDay = raw.cycle_day ?? cycleOf(available ? nextStreak : Math.max(1, streak), len);
  const days: DailyDay[] = raw.rewards.map((reward, i) => {
    const day = reward.day ?? i + 1;
    const state: DayState = day < cycleDay ? "claimed" : day === cycleDay ? (available ? "today" : "claimed") : "upcoming";
    return { day, reward, state };
  });
  const today = raw.reward ?? raw.rewards[cycleDay - 1];
  const tomorrow = available ? null : raw.rewards[cycleOf(streak + 1, len) - 1] ?? null;
  const best = Math.max(Number(raw.best_streak) || 0, streak);

  const list = v2 ? raw.milestones ?? DAILY_MILESTONES_FALLBACK : [];
  const reachedBase = Math.max(best, streak);
  const milestones = list.map((m) => ({ ...m, reached: Boolean(m.reached) || reachedBase >= m.days }));
  // İlerleme: seri bugün alınınca ne olacaksa ona göre (alındıysa bugünkü seri).
  const at = available ? streak : nextStreak;
  const upcoming = raw.next_milestone ?? (() => {
    const m = list.find((x) => x.days > at);
    return m ? { days: m.days, key: m.key, title: m.title, in_days: m.days - at } : null;
  })();
  let next: DailyView["next"] = null;
  if (upcoming) {
    const prev = [...list].reverse().find((m) => m.days < upcoming.days)?.days ?? 0;
    const span = Math.max(1, upcoming.days - prev);
    next = {
      days: upcoming.days,
      title: upcoming.title,
      key: upcoming.key,
      inDays: Math.max(0, upcoming.in_days),
      from: prev,
      progress: Math.max(0, Math.min(1, (at - prev) / span)),
    };
  }
  const saver = raw.saver ?? null;
  return {
    available,
    v2,
    streak,
    nextStreak,
    best,
    cycleDay,
    days,
    today,
    tomorrow,
    milestones,
    next,
    saver,
    offerSaver: Boolean(available && saver?.available && saver.streak > 0),
    starsTotal: Math.max(0, Number(raw.stars_total) || 0),
  };
}

/** "8 yıldız + 80 jeton + joker" gibi kısa ödül metni. */
export function rewardLine(reward: DailyReward | null | undefined): string {
  if (!reward) return "";
  const parts: string[] = [];
  if (reward.stars) parts.push(`${reward.stars} yıldız`);
  if (reward.coins) parts.push(`${reward.coins} jeton`);
  if (reward.joker) parts.push("joker");
  if (reward.life_refill) parts.push("can doldurma");
  if (reward.chest) parts.push("haftanın sandığı");
  else if (reward.boosters && Object.keys(reward.boosters).length) parts.push("güçlendirici");
  return parts.join(" + ");
}

/**
 * Bir ana kalan süre: "2 g 5 sa", "5 sa 12 dk", "12 dk". Geçmişse "şimdi".
 */
export function untilText(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "şimdi";
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return h > 0 ? `${d} g ${h} sa` : `${d} g`;
  if (h > 0) return `${h} sa ${m} dk`;
  return `${Math.max(1, m)} dk`;
}
