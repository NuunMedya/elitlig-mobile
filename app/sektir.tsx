/**
 * TOP SEKTİR — Flappy futbol: top stadyum boyunca ilerler, her dokunuşta
 * havalanır. Rakip savunmacılardan kurulu barajların üstünden, ters asılı
 * kalelerin altından geç; her geçiş bir gol. Gol sayın ligin oyuncularının
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
  subtitle: "Barajı aş, kalenin altından geç, gol at",
  icon: "football-outline",
  bestKey: ARENA_BEST_KEYS.sektir,
  rules: [
    { icon: "finger-print-outline", text: "Ekrana dokun: top havalanır. İlk dokunuş başlama vuruşu." },
    { icon: "shield-outline", text: "Alttan rakip savunmacıların barajı, üstten ters asılı kale gelir. Aradaki boşluktan geçmek bir gol." },
    { icon: "star-outline", text: "Boşluğun tam ortası çarpanı büyütür; altın yıldızlar bonus, altın krampon bir çarpışmayı affeder." },
    { icon: "people-outline", text: "Gol sayın bir oyuncunun sezon gol + asist sayısını geçince onu geride bırakırsın." },
    { icon: "trending-up-outline", text: "Top hızlanır, boşluk daralır; baraj zıplar, kapılar kayar. Top çime, baraja ya da direğe değerse biter." },
  ],
  describe: (stats) =>
    [
      stats.goals != null ? `${stats.goals} gol` : "",
      stats.level != null ? `Seviye ${stats.level}` : "",
      stats.stars ? `${stats.stars} yıldız` : "",
      stats.rivals ? `${stats.passed ?? 0}/${stats.rivals} oyuncu geçildi` : "",
    ].filter(Boolean),
  overTitle: "Oyun bitti",
  taunt: "Bu kadar golü sen de atabilir misin?",
};

export default function SektirScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
