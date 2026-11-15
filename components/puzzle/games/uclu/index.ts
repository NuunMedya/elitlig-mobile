/**
 * ELİT ÜÇLÜ — Lig Yolu modülü (üçlü eşleştirme).
 *
 * Güçlendirici anahtarları sunucudaki katalogla birebir aynıdır
 * (elitlig-server services/puzzle/rules.js → BOOSTERS).
 */

import type { PuzzleGameModule, PuzzleGoalSummary } from "@/lib/puzzle/types";
import { ucluLevel, UCLU_PIECES, type UcluGoalDef } from "@/lib/puzzle/levels/uclu";
import { UCLU_PIECE_COLORS } from "@/lib/puzzle/ucluPalette";
import UcluGame from "./UcluGame";

function goalRow(g: UcluGoalDef): PuzzleGoalSummary["goals"][number] {
  switch (g.type) {
    case "color": {
      const p = UCLU_PIECE_COLORS[g.color ?? 0];
      return { icon: UCLU_PIECES[g.color ?? 0]?.icon ?? "football", label: `${p.name} topla`, count: g.count };
    }
    case "mud":
      return { icon: "water", label: "Çamuru temizle", count: g.count };
    case "crate":
      return { icon: "cube", label: "Krampon kutularını kır", count: g.count };
    case "snow":
      return { icon: "snow", label: "Buzu kır", count: g.count };
    case "net":
      return { icon: "grid", label: "Kale ağlarını yırt", count: g.count };
    case "turf":
      return { icon: "leaf", label: "Sahayı çimlendir", count: g.count };
    case "cone":
      return { icon: "triangle", label: "Konileri devir", count: g.count };
    default:
      return { icon: "trophy", label: "Şampiyonluk kupasını indir", count: g.count };
  }
}

export const ucluModule: PuzzleGameModule = {
  key: "uclu",
  title: "Elit Üçlü",
  tagline: "Kaydır, eşleştir, füzeyi ateşle — sahayı temizle!",
  icon: "football",
  tone: "brand",
  boosters: [
    {
      key: "roket",
      title: "Füze",
      description: "Maça bir Füze ile başla: patlayınca satırı ya da sütunu temizler.",
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
      badge: L.hardness === "super" ? "Süper zor" : L.hardness === "zor" ? "Zor seviye" : null,
      tip: L.tip,
    };
  },
  Game: UcluGame,
};

export default ucluModule;
