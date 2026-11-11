/**
 * SLALOM — üç şeritli sonsuz koşu: topu sürerek stadyum bulvarında ilerle;
 * şerit değiştir, zıpla, kay. Topu ligin gerçek bir oyuncusu sürer; her
 * seviyede ligin bir takımının savunması (ve takım otobüsü) karşına çıkar.
 *
 * Oyunun kendisi `games/slalom.js` (three.js / WebGL, WebView içinde; arcade
 * motoru `games/arcade3d.js`). Kasım 2026'da kapı slalomundan sonsuz koşuya
 * dönüştü: kurallar ve puanlama orada belgelenmiştir. Bu ekran yalnız ortak
 * Arena kabuğunu oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "slalom",
  title: "Slalom",
  subtitle: "Şerit değiştir, zıpla, kay: savunmayı geç",
  icon: "flag",
  bestKey: ARENA_BEST_KEYS.slalom,
  rules: [
    { icon: "swap-horizontal-outline", text: "Sola ya da sağa kaydır: şerit değiştir. Yukarı kaydır: zıpla. Aşağı kaydır: kay." },
    { icon: "warning-outline", text: "Alçak engelin üstünden zıpla, pankartın altından kay, otobüsün şeridinden çık. Çarpmak bir hak götürür (3 hak)." },
    { icon: "shield-outline", text: "2. seviyeden sonra ligin savunmacıları gelir: kayan savunmacının üstünden zıpla, kollarını açan duvardan kaç." },
    { icon: "flash-outline", text: "Parlayan kutular güç verir: MIKNATIS altınları çeker, KALKAN bir çarpışmayı affeder, ×2 puanı ikiye katlar, TURBO her şeyi devirir." },
    { icon: "star-outline", text: "Her 10 metre ve temiz geçilen her sıra puan; altınlar +1. Hatasız seri çarpanı ×5'e kadar çıkarır." },
    { icon: "trending-up-outline", text: "Hız artar, sıralar sıklaşır; her seviyede ligin bir takımı, gündüzden geceye." },
  ],
  describe: (stats) =>
    [
      stats.metres != null ? `${stats.metres} m` : "",
      stats.coins ? `${stats.coins} altın` : "",
      stats.level != null ? `Seviye ${stats.level}` : "",
      stats.bestCombo ? `En iyi seri ${stats.bestCombo}` : "",
      stats.defense && stats.defenses ? `Savunma ${stats.defense}/${stats.defenses}` : "",
    ].filter(Boolean),
  overTitle: "Hakların bitti",
  taunt: "Bu koşuyu sen de çıkar",
};

export default function SlalomScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
