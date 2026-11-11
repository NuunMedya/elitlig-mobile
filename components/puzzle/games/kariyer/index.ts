/**
 * KARİYER YOLU — Lig Yolu oyun modülü (futbolcu kariyeri).
 *
 * Mahalle sahasından amatör lige: her seviye bir maç günüdür ve maçın yalnız
 * oyuncunun topla buluştuğu anları oynanır (şut · pas · çalım). Kazanılan
 * yıldızlar antrenman puanıdır; özellikler anların fiziğini değiştirir.
 * Gerçek oyuncu profili bağlı üye kendi adı ve mevkisiyle başlar.
 *
 * Motor: lib/kariyer/sim.ts (Skia + Reanimated). Seviyeler: lib/kariyer/levels.ts.
 */
import { MOMENT_ICONS, MOMENT_LABELS, generateKariyerLevel } from "@/lib/kariyer/levels";
import type { PuzzleGameModule, PuzzleGoalSummary } from "@/lib/puzzle/types";

import KariyerGame from "./KariyerGame";

function goalSummary(level: number): PuzzleGoalSummary {
  const L = generateKariyerLevel(level);
  const counts = new Map<string, number>();
  L.moments.forEach((moment) => counts.set(moment.kind, (counts.get(moment.kind) ?? 0) + 1));
  const goals: PuzzleGoalSummary["goals"] = [...counts.entries()].map(([kind, count]) => ({
    icon: MOMENT_ICONS[kind as keyof typeof MOMENT_ICONS],
    label: MOMENT_LABELS[kind as keyof typeof MOMENT_LABELS],
    count,
  }));
  goals.push({ icon: "star", label: `Reyting ${String(L.pass).replace(".", ",")} ve üstü` });
  return {
    limit: `${L.tierName} · ${L.opponent} · ${L.moments.length} an`,
    goals,
    badge: L.cup ? "Kupa maçı" : null,
    tip: L.tip,
  };
}

export const kariyerModule: PuzzleGameModule = {
  key: "kariyer",
  title: "Kariyer Yolu",
  tagline: "Mahalle sahasından yıldızlığa: şut, pas, çalım",
  icon: "trending-up",
  tone: "live",
  boosters: [
    {
      key: "krampon",
      title: "Yeni Kramponlar",
      description: "Bu maç boyunca bütün özelliklerin +8.",
      icon: "flash",
      kind: "pre",
    },
    {
      key: "ikinci_sans",
      title: "İkinci Şans",
      description: "Kötü biten anı bir kez daha oyna.",
      icon: "refresh",
      kind: "live",
    },
  ],
  goalSummary,
  Game: KariyerGame,
};
