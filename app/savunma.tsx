/**
 * SAVUNMA HATTI — şeritli kale savunması: rakip hücumcular sağdan, ekranın
 * dışından gelir ve beş yatay koridorda uzun bir koşu yolunu yürüyüp soldaki
 * kalene ulaşmaya çalışır; oyuncularını koridorlara dizip dalga dalga gelen
 * hücumu durdurursun.
 * Takımın seçtiğin kaptanın kulübünün formasını giyer; her dalga ligin bir
 * takımıdır.
 *
 * Oyun 20 bölümdür: bölüm seçimi, yıldızlar ve kayıt tuvalde (kayıt RN
 * üzerinden {type:"store"} ile saklanır).
 * Oyunun kendisi `games/savunma.js` (Canvas 2D, WebView içinde; ortak çalışma
 * zamanı `games/core.js`): ızgara, kartlar, kart açılış takvimi, dalgalar ve
 * puanlama orada belgelenmiştir. Bu ekran yalnız ortak Arena kabuğunu oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "savunma",
  levelGame: true,
  title: "Savunma Hattı",
  subtitle: "Oyuncularını diz, kaleni koru",
  icon: "shield",
  bestKey: ARENA_BEST_KEYS.savunma,
  rules: [
    { icon: "map-outline", text: "Oyun 20 BÖLÜM'den oluşur. Bölüm seç; her bölüm birkaç dalga ve bir SON HÜCUM'dur. Bitirince yıldız kazanır, sıradaki bölümü açarsın." },
    { icon: "grid-outline", text: "Rakipler sağdan gelir, soldaki kalene yürür. Alttaki karttan oyuncu seç, kareye dokun ya da sürükle. TARAFTAR güneş üretir: güneşleri topla." },
    { icon: "flash-outline", text: "Yeni rakipler çıkar: HIZLI koşar, TANK sağlamdır, ZIPLAYAN önündeki oyuncunun üstünden atlar (STOPER durdurur), KALKANLI şutları keser, TOPÇU uzaktan top atar." },
    { icon: "sparkles-outline", text: "Bölümler ilerledikçe yeni oyuncular açılır: FÜZE, FISKİYE, ÇİFT, KALECİ, PRES, ORTACI, HAKEM. 8. bölümden itibaren saha altı koridordur." },
    { icon: "star-outline", text: "Üç gol yersen bölüm kaybedilir. Hiç gol yemeden bitirirsen üç yıldız." },
  ],
  describe: (stats) =>
    [
      stats.level != null ? `${stats.level}. bölüm ${stats.won ? "kazanıldı" : "kaybedildi"}` : "",
      stats.won && stats.stars ? `${stats.stars} yıldız` : "",
      stats.defeated != null ? `${stats.defeated} rakip durduruldu` : "",
      stats.placed ? `${stats.placed} oyuncu dizildi` : "",
    ].filter(Boolean),
  overTitle: "Bölüm bitti",
  taunt: "Bu hücumu sen durdurabilir misin?",
};

export default function SavunmaScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
