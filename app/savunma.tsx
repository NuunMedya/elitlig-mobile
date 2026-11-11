/**
 * SAVUNMA HATTI — şeritli kale savunması: rakip hücumcular beş koridordan
 * kalene yürür; oyuncularını sahaya dizip dalga dalga gelen hücumu durdurursun.
 * Takımın seçtiğin kaptanın kulübünün formasını giyer; her dalga ligin bir
 * takımıdır.
 *
 * Oyunun kendisi `games/savunma.js` (three.js / WebGL, WebView içinde; arcade
 * motoru `games/arcade3d.js`): ızgara, kartlar, dalgalar ve puanlama orada
 * belgelenmiştir. Bu ekran yalnız ortak Arena kabuğunu oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "savunma",
  title: "Savunma Hattı",
  subtitle: "Oyuncularını diz, kaleni koru",
  icon: "shield",
  bestKey: ARENA_BEST_KEYS.savunma,
  rules: [
    { icon: "grid-outline", text: "Alttaki karttan oyuncu seç, sahadaki kareye dokun ya da kartı sürükle. Her oyuncu enerji ister." },
    { icon: "flash-outline", text: "KURUCU enerji üretir; gökten düşen enerjiye dokunup topla. Önce ekonomini kur." },
    { icon: "football-outline", text: "FORVET koridorundaki rakibe şut atar, STOPER duvar olur. Yeni dalgalarda FÜZE, PRES ve ÇİFT FORVET açılır." },
    { icon: "shield-outline", text: "Kalene ulaşan her rakip bir gol: üç gol yersen maç biter." },
    { icon: "trending-up-outline", text: "Her dalga ligin bir takımı; sonunda BÜYÜK HÜCUM ve o takımın kaptanı gelir." },
  ],
  describe: (stats) =>
    [
      stats.wave != null ? `${stats.wave}. dalga` : "",
      stats.defeated != null ? `${stats.defeated} rakip durduruldu` : "",
      stats.placed ? `${stats.placed} oyuncu dizildi` : "",
    ].filter(Boolean),
  overTitle: "Savunma çöktü",
  taunt: "Bu hücumu sen durdurabilir misin?",
};

export default function SavunmaScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
