/**
 * SLALOM — topu sürerek kapılardan geç; her kapı zorunlu.
 * Topu ligin gerçek bir oyuncusu sürer; her seviyede ligin bir takımının
 * savunması karşına çıkar (en iyi savunma finalde).
 *
 * Oyunun kendisi `games/slalom.js` (three.js / WebGL, WebView içinde). Eski sürümde
 * kenara saklanıp sonsuza dek ilerlemek mümkündü; artık her kapıdan geçmek
 * zorunlu, kaçırılan kapı hak götürür. Bu ekran yalnız ortak Arena kabuğunu
 * oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "slalom",
  title: "Slalom",
  subtitle: "Ligin savunmalarını çalımla geç",
  icon: "flag",
  bestKey: ARENA_BEST_KEYS.slalom,
  rules: [
    { icon: "swap-horizontal-outline", text: "Parmağını sağa sola kaydır; oyuncu parmağını izler." },
    { icon: "shield-outline", text: "Her seviyede ligin bir takımının savunması; finalde en az gol yiyen takım var." },
    { icon: "flag-outline", text: "Her kapıdan geçmek zorunlu. Kapıyı kaçırmak ya da direğe çarpmak bir hak götürür." },
    { icon: "star-outline", text: "Kapının tam ortası ve altın toplar ekstra puan; hatasız seri puanı katlar." },
    { icon: "trending-up-outline", text: "Hız artar, kapılar daralır; savunmacılar ve kayan kapılar gelir. 3 hakta biter." },
  ],
  describe: (stats) =>
    [
      stats.gates != null ? `${stats.gates} kapı` : "",
      stats.metres != null ? `${stats.metres} m` : "",
      stats.level != null ? `Seviye ${stats.level}` : "",
      stats.defense && stats.defenses ? `Savunma ${stats.defense}/${stats.defenses}` : "",
    ].filter(Boolean),
  overTitle: "Hakların bitti",
  taunt: "Bu kapılardan sen de geç",
};

export default function SlalomScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
