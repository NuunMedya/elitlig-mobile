/**
 * KARİYER YOLU — Lig Yolu oyun modülü (futbolcu kariyeri, WebView).
 *
 * Her bölüm kariyerinin bir maçıdır: Mahalle Ligi'nden Avrupa Kupası'na
 * (8 basamak, basamak başında terfi / transfer kartı). Maçta 3–6 atak canlı
 * oynanır (Penaltı'nın kamerası ve çizimiyle): koşu, çalım, verkaç, kayan
 * müdahaleden kaçış, kaleciye karşı nişan + güç şutu; penaltı, frikik ve
 * kafa vuruşu özel ataklar. Rakipten çok gol → kazanç; yıldız maç reytinginden.
 * Bölüm tablosu lib/puzzle/levels/kariyer.ts (games/kariyer.js ile aynı).
 * Güçlendiriciler: krampon (bölüm öncesi), ikinci_sans (oyun içi; bölüm
 * öncesi seçilirse ilk kötü atak bedava tekrar).
 */

import { goalSummary } from "@/lib/puzzle/levels/kariyer";
import type { PuzzleGameModule } from "@/lib/puzzle/types";

import { KariyerGame } from "./KariyerGame";

export const kariyerModule: PuzzleGameModule = {
  key: "kariyer",
  title: "Kariyer Yolu",
  tagline: "Mahalle sahasından Avrupa'ya: koş, çalım at, verkaç yap, golü at",
  icon: "trending-up",
  tone: "live",
  boosters: [
    {
      key: "krampon",
      title: "Yeni Kramponlar",
      description: "Bu maç boyunca daha hızlı koşarsın; çalımın uzar ve daha çabuk yenilenir, yeşil şut bölgesi %20 genişler.",
      icon: "flash",
      kind: "pre",
    },
    {
      key: "ikinci_sans",
      title: "İkinci Şans",
      description: "Kötü biten bir atağı (top kaybı, kaçan şut) aynı dizilimle yeniden oyna.",
      icon: "refresh",
      kind: "live",
    },
  ],
  goalSummary,
  Game: KariyerGame,
  fullBleed: true,
};
