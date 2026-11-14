/**
 * SAVUNMA HATTI — Lig Yolu oyun modülü (şeritli kale savunması, WebView).
 * Oyun: games/savunma.js (bölüm modu, docs/oyun-yenileme-2026-11.md §2).
 * Bölüm tablosu: lib/puzzle/levels/savunma.ts (JS ile aynı; check-games denetler).
 * Güçlendirici anahtarları sunucuyla birebir: gunes (seviye öncesi), duvar (oyun içi).
 */

import { goalSummary, LEVEL_COUNT, SAVUNMA_SUN_BOOST, SAVUNMA_WALLS } from "@/lib/puzzle/levels/savunma";
import type { PuzzleGameModule } from "@/lib/puzzle/types";

import { SavunmaGame } from "./SavunmaGame";

export const savunmaModule: PuzzleGameModule = {
  key: "savunma",
  title: "Savunma Hattı",
  tagline: `Oyuncularını diz, kaleni koru · ${LEVEL_COUNT} bölüm`,
  icon: "shield",
  tone: "info",
  boosters: [
    {
      key: "gunes",
      title: "Güneş Yağmuru",
      description: `Bölüme +${SAVUNMA_SUN_BOOST} güneşle başlarsın.`,
      icon: "sunny",
      kind: "pre",
    },
    {
      key: "duvar",
      title: "Duvar",
      description: `En tehlikeli ${SAVUNMA_WALLS} koridorun önüne bedava STOPER dikilir.`,
      icon: "shield-half",
      kind: "live",
    },
  ],
  goalSummary,
  Game: SavunmaGame,
};
