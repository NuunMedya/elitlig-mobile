import type { Href } from "expo-router";

import { LAYER_LABELS, type CareerLayer, type CareerQuest, type CareerSummary, type WeeklyQuests } from "./api/career";

/**
 * HAFTALIK GÖREVLER — ortak yardımcılar (Yönetim sekmesindeki vitrin ve
 * /gorevler ekranı aynı kuralları kullanır).
 */

/** Sunucudaki görev `go` anahtarı → görevi yapmak için açılacak ekran. */
export const QUEST_ROUTES: Record<string, Href> = {
  tahmin: "/tahmin-ligi",
  fantezi: "/fantezi",
  maclar: "/(tabs)/skorlar",
  kulubum: "/(tabs)/kulubum",
  oyunlar: "/(tabs)/oyunlar",
  penalti: "/penalti",
  slalom: "/slalom",
  sektir: "/sektir",
  kimbu: "/kimbu",
  seri: "/arena",
  tahmin_oyun: "/tahmin",
  gunun: "/gunun",
  mac_al: "/takimim/mac-al",
  lig_yolu: "/lig-yolu",
};

export const questRoute = (quest: CareerQuest): Href | null => (quest.go ? QUEST_ROUTES[quest.go] ?? null : null);

export const LAYER_TITLES: Record<CareerLayer, string> = LAYER_LABELS;
export const LAYER_ICON: Record<CareerLayer, "football" | "megaphone" | "game-controller"> = {
  saha: "football",
  tribun: "megaphone",
  arena: "game-controller",
};

/** Eski sunucu weekly_quests göndermez: düz listeden kurulur. */
export function weeklyOf(data: CareerSummary): WeeklyQuests {
  if (data.weekly_quests) return data.weekly_quests;
  const completed = data.quests.filter((q) => q.done);
  return {
    active: data.quests.filter((q) => !q.done),
    completed,
    revealed: data.quests.length,
    total: data.quests.length,
    done_count: completed.length,
    locked: 0,
    bonuses: [],
  };
}

/** Bitmeye en yakın görevler önce (oran), eşitlikte XP'si yüksek olan. */
export function sortByCloseness(list: CareerQuest[]): CareerQuest[] {
  return [...list].sort((a, b) => {
    const ra = a.target ? a.progress / a.target : 0;
    const rb = b.target ? b.progress / b.target : 0;
    return rb - ra || b.xp - a.xp;
  });
}

/** Haftanın bitimine kalan süre: "3g 14sa", "5sa 20dk", "12dk". */
export function timeLeft(endsAt: string | undefined | null, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.floor(ms / 60000);
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  if (days > 0) return `${days}g ${hours}sa`;
  if (hours > 0) return `${hours}sa ${mins}dk`;
  return `${mins}dk`;
}

/** Bu hafta kazanılan toplam XP (eski sunucuda yok → null). */
export function weekXp(data: CareerSummary): number | null {
  if (!data.layers_week) return null;
  return (data.layers_week.saha ?? 0) + (data.layers_week.tribun ?? 0) + (data.layers_week.arena ?? 0);
}

/** Açık görevlerin toplam kalan XP'si — "bu hafta X XP daha kazanabilirsin". */
export const openXp = (weekly: WeeklyQuests) => weekly.active.reduce((sum, q) => sum + (q.done ? 0 : q.xp), 0);
