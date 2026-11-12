/**
 * ELİT ÜÇLÜ — Lig Yolu modülü (üçlü eşleştirme).
 *
 * Güçlendirici anahtarları sunucudaki katalogla birebir aynıdır
 * (elitlig-server services/puzzle/rules.js → BOOSTERS).
 */

import type { PuzzleGameModule, PuzzleGoalSummary } from "@/lib/puzzle/types";
import { ucluLevel, type UcluGoalDef } from "@/lib/puzzle/levels/uclu";
import { UCLU_PIECE_COLORS } from "@/lib/puzzle/ucluPalette";
import UcluGame from "./UcluGame";

function goalRow(g: UcluGoalDef): PuzzleGoalSummary["goals"][number] {
  switch (g.type) {
    case "color": {
      const p = UCLU_PIECE_COLORS[g.color ?? 0];
      return { icon: "football", label: `${p.name} topla`, count: g.count };
    }
    case "mud":
      return { icon: "water", label: "Çamuru temizle", count: g.count };
    case "crate":
      return { icon: "cube", label: "Krampon kutularını kır", count: g.count };
    case "snow":
      return { icon: "snow", label: "Karı kır", count: g.count };
    default:
      return {
        icon: "trophy",
        label: "Şampiyonluk kupasını indir",
        count: g.count,
      };
  }
}

export const ucluModule: PuzzleGameModule = {
  key: "uclu",
  title: "Elit Üçlü",
  tagline: "Kaydır, üçle, patlat — sahayı temizle!",
  icon: "football",
  tone: "brand",
  boosters: [
    {
      key: "roket",
      title: "Füze Şut",
      description: "Maça bir Füze Şut ile başla: patlayınca satırı ya da sütunu temizler.",
      icon: "rocket",
      kind: "pre",
    },
    {
      key: "bomba",
      title: "Röveşata",
      description: "Maça bir Röveşata ile başla: patlayınca 3×3 alanı temizler.",
      icon: "flame",
      kind: "pre",
    },
    {
      key: "altin_top",
      title: "Altın Top",
      description: "Maça bir Altın Top ile başla: değiştirdiğin renkteki tüm taşları toplar.",
      icon: "sparkles",
      kind: "pre",
    },
    {
      key: "cekic",
      title: "Krampon Darbesi",
      description: "Dokunduğun tek taşı ya da engeli kırar. Hamle harcamaz.",
      icon: "hammer",
      kind: "live",
    },
    {
      key: "karistir",
      title: "Taktik Değişikliği",
      description: "Tahtadaki taşları karıştırır. Hamle harcamaz.",
      icon: "shuffle",
      kind: "live",
    },
  ],
  goalSummary: (level: number): PuzzleGoalSummary => {
    const L = ucluLevel(level);
    return {
      limit: `${L.moves} hamle`,
      goals: L.goals.map(goalRow),
      badge: L.cup ? "Kupa maçı" : null,
      tip: L.tip,
    };
  },
  Game: UcluGame,
};

export default ucluModule;
