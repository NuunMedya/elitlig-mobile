/**
 * PENALTI — sonsuz seri: üç kaçırma hakkı, her golde akıllanan kaleci.
 *
 * Oyunun kendisi `games/penalti.js` (Canvas, WebView içinde); kurallar,
 * zorluk eğrisi ve puanlama orada belgelenmiştir. Bu ekran yalnız ortak Arena
 * kabuğunu oyuna bağlar: giriş/bitiş kartları, rekor tablosu, paylaşım.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "penalti",
  title: "Penaltı",
  subtitle: "Sürükle-bırak: yön, güç ve falso tek jestte",
  icon: "football",
  bestKey: ARENA_BEST_KEYS.penalti,
  rules: [
    { icon: "hand-left-outline", text: "Ekranda yukarı doğru sürükle ve bırak. Uzunluk gücü, yön köşeyi belirler." },
    { icon: "git-branch-outline", text: "Parmağınla kavis çiz: top falsolu gider, kaleci aldanır." },
    { icon: "flash-outline", text: "Köşe, yüksek, falso ve altın hedef ekstra puan; gol serisi puanı katlar." },
    { icon: "trending-up-outline", text: "Her golde kaleci ustalaşır, rüzgâr ve süre baskısı gelir. 3 kaçırmada biter." },
  ],
  describe: (stats) =>
    [
      stats.goals != null ? `${stats.goals} gol` : "",
      stats.level != null ? `Seviye ${stats.level}` : "",
      stats.bestStreak ? `En uzun seri ${stats.bestStreak}` : "",
    ].filter(Boolean),
  overTitle: "Hakların bitti",
  taunt: "Bu kaleciyi geçebilir misin?",
};

export default function PenaltiScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
