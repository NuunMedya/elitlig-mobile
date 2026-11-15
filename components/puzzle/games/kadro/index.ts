/**
 * KADRO KOŞUSU — Lig Yolu oyun modülü (kapılı kalabalık koşusu, WebView).
 * Oyun: games/kadro.js (bölüm modu, docs/oyun-yenileme-2026-11.md §2).
 * Bölüm tablosu: lib/puzzle/levels/kadro.ts (JS ile aynı; check-games denetler,
 * tam tarama scripts/check-kadro-levels.mjs).
 * Güçlendirici anahtarları sunucuyla birebir: takviye (bölüm öncesi), kalkan (oyun içi).
 */

import { goalSummary, LEVEL_COUNT } from "@/lib/puzzle/levels/kadro";
import type { PuzzleGameModule } from "@/lib/puzzle/types";

import { KadroGame } from "./KadroGame";

export const kadroModule: PuzzleGameModule = {
  key: "kadro",
  title: "Kadro Koşusu",
  tagline: `Kapılardan geç, kadronu büyüt, gol at · ${LEVEL_COUNT} bölüm`,
  icon: "people",
  tone: "win",
  boosters: [
    {
      key: "takviye",
      title: "Takviye +5",
      description: "Bölüme 5 oyuncu fazlasıyla başlarsın.",
      icon: "person-add",
      kind: "pre",
    },
    {
      key: "kalkan",
      title: "Kalkan",
      description: "Sıradaki zararlı temas (rakip grubu, çubuk, baraj, kalecinin şutu) kadrodan kimseyi götürmez.",
      icon: "shield-checkmark",
      kind: "live",
    },
  ],
  goalSummary,
  Game: KadroGame,
  fullBleed: true,
};
