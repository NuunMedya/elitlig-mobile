/**
 * TOP SEKTİR — topu çime düşürmeden sektir; ligin oyuncularını geç.
 * Topu ligin gerçek bir oyuncusu sektirir; sekme sayın ligin oyuncularının
 * sezon gol + asist sayısını geçtikçe onları geride bırakırsın.
 *
 * Oyunun kendisi `games/sektir.js` (three.js / WebGL, WebView içinde): mekanizma,
 * zorluk eğrisi ve puanlama orada belgelenmiştir. Bu ekran yalnız ortak Arena
 * kabuğunu oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "sektir",
  title: "Top Sektir",
  subtitle: "Sektir, ligin oyuncularını geride bırak",
  icon: "football-outline",
  bestKey: ARENA_BEST_KEYS.sektir,
  rules: [
    { icon: "finger-print-outline", text: "Topa dokun: top yukarı sekip yine aynı yüksekliğe çıkar." },
    { icon: "people-outline", text: "Sekme sayın bir oyuncunun sezon gol + asist sayısını geçince onu geride bırakırsın." },
    { icon: "swap-horizontal-outline", text: "Topun solundan vurursan sağa, sağından vurursan sola gider." },
    { icon: "star-outline", text: "Merkezden vuruşlar çarpanı büyütür; topu yıldızlardan geçir, bonus kazan." },
    { icon: "trending-up-outline", text: "Ritim hızlanır, rüzgâr çıkar, top küçülür. Top çime değerse biter." },
  ],
  describe: (stats) =>
    [
      stats.kicks != null ? `${stats.kicks} sekme` : "",
      stats.level != null ? `Seviye ${stats.level}` : "",
      stats.stars ? `${stats.stars} yıldız` : "",
      stats.rivals ? `${stats.passed ?? 0}/${stats.rivals} oyuncu geçildi` : "",
    ].filter(Boolean),
  overTitle: "Top yere düştü",
  taunt: "Bu kadar sektirebilir misin?",
};

export default function SektirScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
