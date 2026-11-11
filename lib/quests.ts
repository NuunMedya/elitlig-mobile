import type Ionicons from "@expo/vector-icons/Ionicons";
import type { Href } from "expo-router";

import {
  LAYER_LABELS,
  type CareerLayer,
  type CareerQuest,
  type CareerSummary,
  type QuestCategory,
  type WeeklyQuests,
} from "./api/career";

/**
 * HAFTALIK GÖREVLER — ortak yardımcılar. Yönetim sekmesindeki vitrin
 * (components/quests/QuestSpotlight), /gorevler ekranı ve Elit Kariyer aynı
 * kuralları buradan okur; rota sözlüğü TEK yerdedir.
 */

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Sunucudaki görev `go` anahtarı → görevi yapmak için açılacak ekran
 * (elitlig-server constants/career.js). Sözlükte olmayan anahtar düğme
 * çizmez: "Git" hiçbir zaman boş bir yere gitmez.
 */
export const QUEST_ROUTES: Record<string, Href> = {
  tahmin: "/tahmin-ligi",
  fantezi: "/fantezi",
  maclar: "/(tabs)/skorlar",
  kulubum: "/(tabs)/kulubum",
  oyunlar: "/(tabs)/oyunlar",
  penalti: "/penalti",
  slalom: "/slalom",
  sektir: "/sektir",
  savunma: "/savunma",
  kadro: "/kadro",
  kimbu: "/kimbu",
  seri: "/arena",
  tahmin_oyun: "/tahmin",
  gunun: "/gunun",
  mac_al: "/takimim/mac-al",
  lig_yolu: "/lig-yolu",
  // Topluluk ve keşif: takım / oyuncu / haber Lig sekmesinin ilgili bölümünde.
  lig: "/(tabs)/ligler",
  takimlar: { pathname: "/(tabs)/ligler", params: { tab: "puan" } },
  oyuncular: { pathname: "/(tabs)/ligler", params: { tab: "oyuncular" } },
  haberler: { pathname: "/(tabs)/ligler", params: { tab: "haberler" } },
  siralama: "/siralama",
};

export const questRoute = (quest: Pick<CareerQuest, "go">): Href | null => (quest.go ? QUEST_ROUTES[quest.go] ?? null : null);

export const LAYER_TITLES: Record<CareerLayer, string> = LAYER_LABELS;
export const LAYER_ICON: Record<CareerLayer, "football" | "megaphone" | "game-controller"> = {
  saha: "football",
  tribun: "megaphone",
  arena: "game-controller",
};

/* ───────────────────────── Kategoriler ───────────────────────── */

export const QUEST_CATEGORY_ORDER: QuestCategory[] = ["saha", "oyun", "tribun", "kesif"];

export const QUEST_CATEGORY_LABEL: Record<QuestCategory, string> = {
  saha: "Saha",
  oyun: "Oyunlar",
  tribun: "Tribün",
  kesif: "Keşif",
};

export const QUEST_CATEGORY_ICON: Record<QuestCategory, IconName> = {
  saha: "football",
  oyun: "game-controller",
  tribun: "megaphone",
  kesif: "compass",
};

/** Eski sunucu `category` göndermez: katmandan türetilir. */
export const categoryOf = (quest: Pick<CareerQuest, "category" | "layer">): QuestCategory =>
  quest.category ?? (quest.layer === "arena" ? "oyun" : quest.layer);

export const TIER_LABEL: Record<number, string> = { 1: "Kolay", 2: "Orta", 3: "Zor" };

/** Rotası olmayan görevin nerede tamamlandığı (düğme yerine kısa ipucu). */
export function questHint(quest: CareerQuest): string | null {
  if (questRoute(quest)) return null;
  if (quest.layer === "saha") return "Sahada tamamlanır";
  return "Kendiliğinden sayılır";
}

/* ───────────────────────── Durum ───────────────────────── */

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

/** Açık görevlerin kategori sayıları (bitmemişler). Sıra QUEST_CATEGORY_ORDER. */
export function categoryCounts(weekly: WeeklyQuests): { key: QuestCategory; open: number; done: number; total: number }[] {
  const map = new Map<QuestCategory, { open: number; done: number }>();
  for (const quest of weekly.active) {
    const key = categoryOf(quest);
    const item = map.get(key) ?? { open: 0, done: 0 };
    item.open += 1;
    map.set(key, item);
  }
  for (const quest of weekly.completed) {
    const key = categoryOf(quest);
    const item = map.get(key) ?? { open: 0, done: 0 };
    item.done += 1;
    map.set(key, item);
  }
  return QUEST_CATEGORY_ORDER.filter((key) => map.has(key)).map((key) => {
    const item = map.get(key)!;
    return { key, open: item.open, done: item.done, total: item.open + item.done };
  });
}

const ratioOf = (quest: CareerQuest) => (quest.target ? Math.min(1, quest.progress / quest.target) : 0);

/** Bitmeye en yakın görevler önce (oran), eşitlikte XP'si yüksek olan. */
export function sortByCloseness(list: CareerQuest[]): CareerQuest[] {
  return [...list].sort((a, b) => ratioOf(b) - ratioOf(a) || b.xp - a.xp);
}

/**
 * Görevler ekranının sırası: başlanmış görevler bitmeye yakınlığa göre önce;
 * başlanmamışlarda haftanın oyunu ve "bu hafta yeni" görevler öne gelir,
 * sonra kolaydan zora.
 */
export function sortForList(list: CareerQuest[]): CareerQuest[] {
  const weight = (quest: CareerQuest) => (quest.featured ? 2 : 0) + (quest.is_new ? 1 : 0);
  return [...list].sort((a, b) => {
    const ra = ratioOf(a);
    const rb = ratioOf(b);
    if (ra !== rb) return rb - ra;
    return weight(b) - weight(a) || (a.tier ?? 1) - (b.tier ?? 1) || b.xp - a.xp;
  });
}

/* ───────────────────────── Zaman ───────────────────────── */

/**
 * Sunucu saatine göre "şimdi". Hafta sunucuda Türkiye saatiyle döner; cihazın
 * saati ya da saat dilimi yanlışsa kalan süre yine doğru çıkar. `fetchedAt`
 * yanıtın alındığı an (react-query `dataUpdatedAt`).
 */
export function serverNow(serverTime: string | undefined | null, fetchedAt: number, now = Date.now()): number {
  const server = serverTime ? new Date(serverTime).getTime() : NaN;
  if (!Number.isFinite(server) || !fetchedAt) return now;
  return server + (now - fetchedAt);
}

/** Haftanın bitimine kalan süre: "3g 14sa", "5sa 20dk", "12dk". */
export function timeLeft(endsAt: string | undefined | null, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.max(1, Math.floor(ms / 60000));
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  if (days > 0) return `${days}g ${hours}sa`;
  if (hours > 0) return `${hours}sa ${mins}dk`;
  return `${mins}dk`;
}

/** Hafta bitimine bir günden az kaldı mı (süre rozeti uyarı tonuna döner). */
export function endsSoon(endsAt: string | undefined | null, now = Date.now()): boolean {
  if (!endsAt) return false;
  const ms = new Date(endsAt).getTime() - now;
  return Number.isFinite(ms) && ms > 0 && ms < 24 * 60 * 60 * 1000;
}

/* ───────────────────────── XP ───────────────────────── */

/** Bu hafta kazanılan toplam XP (eski sunucuda yok → null). */
export function weekXp(data: CareerSummary): number | null {
  if (!data.layers_week) return null;
  return (data.layers_week.saha ?? 0) + (data.layers_week.tribun ?? 0) + (data.layers_week.arena ?? 0);
}

/** Açık görevlerin toplam kalan XP'si — "bu hafta X XP daha kazanabilirsin". */
export const openXp = (weekly: WeeklyQuests) => weekly.active.reduce((sum, q) => sum + (q.done ? 0 : q.xp), 0);

/** Sıradaki seviyeye KALAN XP (seviyenin tamamı değil); en üst seviyede null. */
export const xpToNextLevel = (level: CareerSummary["level"]): number | null =>
  level.next == null ? null : Math.max(0, level.next - level.xp);

/** Sıradaki bonus durağı ve ona kalan görev sayısı; hepsi alındıysa null. */
export function nextBonus(weekly: WeeklyQuests): { at: number; xp: number; left: number } | null {
  const next = weekly.bonuses.find((bonus) => !bonus.earned && bonus.at > weekly.done_count);
  return next ? { at: next.at, xp: next.xp, left: next.at - weekly.done_count } : null;
}
