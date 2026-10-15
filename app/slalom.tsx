/**
 * SLALOM — orta sahadan kaleye atak: topu ligin gerçek oyuncusuyla sürer,
 * rakip kulübün gerçek savunmacılarını çalımlarsın, kalecisine şut çekersin.
 * Gol attıkça ligin bir sonraki savunmasına geçersin (en iyi savunma finalde).
 *
 * Oyunun kendisi `games/slalom.js` (three.js / WebGL, WebView içinde);
 * kurallar, kontroller ve puanlama orada belgelenmiştir. Bu ekran yalnız ortak
 * Arena kabuğunu oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "slalom",
  title: "Slalom",
  subtitle: "Topu sür, ligin savunmalarını çalımla, golü at",
  icon: "flag",
  bestKey: ARENA_BEST_KEYS.slalom,
  rules: [
    { icon: "swap-horizontal-outline", text: "Parmağını sağa sola kaydır; oyuncu topu sürerek parmağını izler." },
    { icon: "shield-outline", text: "Savunmacılar basar ve kayarak müdahale eder; yerde kırmızı halka dolarken yolundan çekil." },
    { icon: "flash-outline", text: "Dokun: çalım. Halka dolarken atılan çalım savunmacıyı yere oturtur. Yukarı fırlat: topu it, depar at." },
    { icon: "football-outline", text: "Ceza sahasında zaman yavaşlar: kaleye doğru yukarı kaydır, köşeyi seç, şut." },
    { icon: "trending-up-outline", text: "Gol attıkça ligin sıradaki savunmasına geçersin; top kaybı ya da kaçan şut bir hak, 3 hakta biter." },
  ],
  describe: (stats) =>
    [
      stats.goals != null ? `${stats.goals} gol` : "",
      stats.beaten ? `${stats.beaten} savunmacı geçildi` : "",
      stats.skills ? `${stats.skills} çalım` : "",
      stats.defense && stats.defenses ? `Savunma ${stats.defense}/${stats.defenses}` : "",
    ].filter(Boolean),
  overTitle: "Hakların bitti",
  taunt: "Bu savunmayı sen de geç",
};

export default function SlalomScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
