/**
 * GÖREV TAMAMLAMA GERİ BİLDİRİMİ.
 *
 * Haftalık görevlerin XP'si sunucuda KENDİLİĞİNDEN yazılır (ayrı bir "ödülü
 * al" adımı yok: XP defteri görev başına tek satır tutar, iki kez yazılamaz).
 * Bu yüzden ödül anı istemcide kutlanır: üyenin daha önce görmediği biten
 * görevler ve bonus durakları için bir kez toast + başarı titreşimi verilir,
 * görev kartı da "yeni tamamlandı" diye işaretlenir.
 *
 * "Görüldü" defteri cihazdadır (hafta + üye anahtarıyla): aynı görev ikinci
 * açılışta yeniden kutlanmaz. Vitrin (QuestSpotlight) ve /gorevler aynı
 * defteri kullanır; hangisi önce açılırsa o kutlar. Depo okunamazsa kutlama
 * yapılmaz (her açılışta tekrar eden toast, hiç toast olmamasından kötüdür).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui";
import type { CareerSummary } from "@/lib/api/career";
import { weeklyOf } from "@/lib/quests";
import { haptics } from "@/theme";

const keyOf = (userId: number | string, week: string) => `elitlig.quests.seen.v1.${userId}.${week}`;

/** Aynı anda açık iki ekranın (vitrin + görevler) aynı görevi iki kez kutlamaması için. */
const announced = new Set<string>();

export function useQuestCelebration(data: CareerSummary | undefined, userId: number | string | null | undefined) {
  const toast = useToast();
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!data || userId == null || busy.current) return;
    const weekly = weeklyOf(data);
    const weekKey = data.week?.key ?? "hafta";
    const storageKey = keyOf(userId, weekKey);
    const done = weekly.completed;
    const bonuses = weekly.bonuses.filter((bonus) => bonus.earned);
    if (!done.length && !bonuses.length) return;

    busy.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
        const tag = (code: string) => `${storageKey}:${code}`;
        const newQuests = done.filter((quest) => !seen.has(quest.code) && !announced.has(tag(quest.code)));
        const newBonuses = bonuses.filter((bonus) => !seen.has(`bonus:${bonus.at}`) && !announced.has(tag(`bonus:${bonus.at}`)));
        if (!newQuests.length && !newBonuses.length) return;

        for (const quest of newQuests) {
          seen.add(quest.code);
          announced.add(tag(quest.code));
        }
        for (const bonus of newBonuses) {
          seen.add(`bonus:${bonus.at}`);
          announced.add(tag(`bonus:${bonus.at}`));
        }
        await AsyncStorage.setItem(storageKey, JSON.stringify([...seen]));

        const xp = newQuests.reduce((sum, quest) => sum + quest.xp, 0) + newBonuses.reduce((sum, bonus) => sum + bonus.xp, 0);
        const amount = `+${xp.toLocaleString("tr-TR")} XP`;
        const message =
          newQuests.length === 1 && !newBonuses.length
            ? `Görev tamamlandı: ${newQuests[0].title} · ${amount}`
            : newQuests.length
              ? `${newQuests.length} görev tamamlandı${newBonuses.length ? " · bonus kazandın" : ""} · ${amount}`
              : `Haftalık ${newBonuses[newBonuses.length - 1].at} görev bonusu · ${amount}`;
        haptics.success();
        toast.show({ message, tone: "success", icon: newBonuses.length ? "gift" : "checkmark-circle", duration: 3600 });
        // Toast kök sağlayıcıdadır: ekran kapanmış olsa da gösterilir.
        if (mounted.current) setFresh(new Set(newQuests.map((quest) => quest.code)));
      } catch {
        // Depo okunamadı / yazılamadı: sessiz geç.
      } finally {
        busy.current = false;
      }
    })();
  }, [data, userId, toast]);

  /** Bu açılışta ilk kez görülen biten görevlerin kodları (kartta vurgulanır). */
  return fresh;
}
