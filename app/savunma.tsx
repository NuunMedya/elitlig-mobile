/**
 * SAVUNMA HATTI — şeritli kale savunması: rakip hücumcular sağdan, ekranın
 * dışından gelir ve beş yatay koridorda uzun bir koşu yolunu yürüyüp soldaki
 * kalene ulaşmaya çalışır; oyuncularını koridorlara dizip dalga dalga gelen
 * hücumu durdurursun.
 * Takımın seçtiğin kaptanın kulübünün formasını giyer; her dalga ligin bir
 * takımıdır.
 *
 * Oyunun kendisi `games/savunma.js` (Canvas 2D, WebView içinde; ortak çalışma
 * zamanı `games/core.js`): ızgara, kartlar, kart açılış takvimi, dalgalar ve
 * puanlama orada belgelenmiştir. Bu ekran yalnız ortak Arena kabuğunu oyuna bağlar.
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
    { icon: "grid-outline", text: "Rakipler sağdan, uzaktan koşarak gelir ve soldaki kalene yürür. Alttaki karttan oyuncu seç, koridordaki kareye dokun ya da sürükle." },
    { icon: "sunny-outline", text: "TARAFTAR güneş üretir: çıkan güneşe dokunup topla. Gökten düşen güneşleri de kaçırma; oyuncular güneşle alınır." },
    { icon: "football-outline", text: "Başta üç kartın var: TARAFTAR, FORVET (şut atar) ve STOPER (duvar olur). Dalgalar ilerledikçe YENİ OYUNCU kartları açılır." },
    { icon: "sparkles-outline", text: "Sırayla FÜZE alanı temizler, FISKİYE yavaşlatır, ÇİFT iki şut atar, KALECİ rakibi kapar, PRES yavaşlatır, ORTACI üç koridora orta yapar, HAKEM herkesi dondurur." },
    { icon: "shield-outline", text: "Kalene ulaşan her rakip bir gol: üç gol yersen maç biter. Dalga sonunda rakip takımın kaptanı gelir." },
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
