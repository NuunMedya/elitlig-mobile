/**
 * SAVUNMA HATTI — şeritli kale savunması: rakip hücumcular sağdan, beş yatay
 * koridordan soldaki kalene yürür; oyuncularını koridorlara dizip dalga dalga
 * gelen hücumu durdurursun.
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
    { icon: "grid-outline", text: "Rakipler sağdan gelir, soldaki kalene yürür. Alttaki karttan oyuncu seç, koridordaki kareye dokun ya da sürükle." },
    { icon: "flash-outline", text: "KURUCU enerji üretir, enerjisi kendiliğinden toplanır. Düşen enerjiye dokunup daha çok topla." },
    { icon: "football-outline", text: "FORVET koridorundaki rakibe şut atar, STOPER duvar olur. Yeni dalgalarda yeni kartlar açılır." },
    { icon: "sparkles-outline", text: "FISKİYE yavaşlatır, FÜZE alanı temizler, KALECİ rakibi kapar, ORTACI üç koridora orta yapar, HAKEM herkesi dondurur." },
    { icon: "shield-outline", text: "Kalene ulaşan her rakip bir gol: üç gol yersen maç biter. Dalga sonunda kaptan gelir." },
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
