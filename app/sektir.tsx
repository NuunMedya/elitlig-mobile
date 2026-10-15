/**
 * TOP SEKTİR — freestyle: topu ligin gerçek bir oyuncusuyla, stadyumun
 * ortasında yere düşürmeden sektir. Zamanlama her şeydir: topun yüksekliği
 * ayak, diz ya da kafa ile vurduğunu belirler. Sekme sayın ligin oyuncularının
 * sezon gol + asist sayısını geçtikçe onları geride bırakırsın.
 *
 * Oyunun kendisi `games/sektir.js` (three.js / WebGL, WebView içinde):
 * mekanizma, zorluk ve puanlama orada belgelenmiştir. Bu ekran yalnız ortak
 * Arena kabuğunu oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "sektir",
  title: "Top Sektir",
  subtitle: "Ritmi yakala, ligin oyuncularını geride bırak",
  icon: "football-outline",
  bestKey: ARENA_BEST_KEYS.sektir,
  rules: [
    { icon: "hand-left-outline", text: "Ekranın sol yarısı soldaki ayak, sağ yarısı sağdaki ayak. Sırayla vurmak ritim bonusu verir." },
    { icon: "radio-button-on-outline", text: "Topun etrafındaki halka kapanınca dokun: MÜKEMMEL vuruş topu tam üstüne getirir." },
    { icon: "body-outline", text: "Topun yüksekliği bölgeyi seçer: ayak 1, diz 2, kafa 3 puan. Bölge dışı dokunuş boşa gider." },
    { icon: "arrow-up-outline", text: "Dokun ve yukarı it: yüksek top. Yüksek top kafaya iner; kafayla sektirme böyle başlar." },
    { icon: "people-outline", text: "Sekme sayın ligin oyuncularının gol + asist sayısını geçer. Ritim hızlanır, rüzgâr çıkar; top düşerse biter." },
  ],
  describe: (stats) =>
    [
      stats.kicks != null ? `${stats.kicks} sekme` : "",
      stats.perfect ? `${stats.perfect} mükemmel` : "",
      stats.headers ? `${stats.headers} kafa` : "",
      stats.rivals ? `${stats.passed ?? 0}/${stats.rivals} oyuncu geçildi` : "",
    ].filter(Boolean),
  overTitle: "Top yere düştü",
  taunt: "Bu kadar sektirebilir misin?",
};

export default function SektirScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
