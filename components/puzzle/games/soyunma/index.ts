/**
 * SOYUNMA ODASI — Lig Yolu oyun modülü (renk sıralama bulmacası).
 * Formaları takım takım dolaplara diz; her dolap tek renkle dolunca takım hazır.
 */
import type { PuzzleGameModule, PuzzleGoalSummary } from "@/lib/puzzle/types";
import { generateSoyunmaLevel } from "@/lib/puzzle/levels/soyunma";
import SoyunmaGame from "./SoyunmaGame";

function goalSummary(level: number): PuzzleGoalSummary {
  const L = generateSoyunmaLevel(level);
  const goals: PuzzleGoalSummary["goals"] = [{ icon: "shirt", label: "Takımı hazırla", count: L.colors }];
  if (L.mechanics.lock) goals.push({ icon: "lock-closed", label: "Kilitli dolabı aç" });
  if (L.mechanics.hidden) goals.push({ icon: "help-circle", label: "Gizli formaları ortaya çıkar" });
  return {
    limit: L.moveLimit != null ? `${L.moveLimit} hamle` : `Serbest · 3 yıldız ≤ ${L.star3} hamle`,
    goals,
    badge: L.cup ? "Kupa maçı" : null,
    tip: L.tip,
  };
}

export const soyunmaModule: PuzzleGameModule = {
  key: "soyunma",
  title: "Soyunma Odası",
  tagline: "Formaları takım takım dolaplara diz",
  icon: "shirt",
  tone: "accent",
  boosters: [
    {
      key: "aski",
      title: "Ek Askı",
      description: "Seviyeye boş bir ek askı ile başla.",
      icon: "add-circle",
      kind: "pre",
    },
    {
      key: "geri",
      title: "Geri Al",
      description: "Son hamleyi geri alır.",
      icon: "arrow-undo",
      kind: "live",
    },
  ],
  goalSummary,
  Game: SoyunmaGame,
};

export default soyunmaModule;
