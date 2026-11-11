/**
 * KADRO KOŞUSU — kapılı kalabalık koşusu: tek oyuncuyla başla, +/× kapılarından
 * geçip kadronu büyüt; kadron rakip gruplarını şut yağmuruna tutar. Her bölümün
 * sonunda rakibin kalecisini düşür, gol at. Kadron seçtiğin kaptanın kulübünün
 * formasını giyer; her bölüm ligin bir takımına karşıdır.
 *
 * Oyunun kendisi `games/kadro.js` (three.js / WebGL, WebView içinde; arcade
 * motoru `games/arcade3d.js`): kapılar, hasar ve puanlama orada belgelenmiştir.
 * Bu ekran yalnız ortak Arena kabuğunu oyuna bağlar.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "kadro",
  title: "Kadro Koşusu",
  subtitle: "Kapılardan geç, kadronu büyüt, gol at",
  icon: "people",
  bestKey: ARENA_BEST_KEYS.kadro,
  rules: [
    { icon: "swap-horizontal-outline", text: "Parmağını sağa sola kaydır; kadron parmağını izler." },
    { icon: "add-circle-outline", text: "Çift kapılardan birini seç: mavi kapılar (+, ×) kadronu büyütür, kırmızılar (−, ÷) küçültür." },
    { icon: "football-outline", text: "Kadron rakip gruplarına kendiliğinden şut atar. Grup erimeden temas edersen bire bir oyuncu kaybedersin; yarım sahadaki büyük gruplardan kaçabilirsin." },
    { icon: "trophy-outline", text: "Bölüm sonunda kaleciyi şutla düşür. Kalecinin sert şutu yerdeki kırmızı halkaya düşer: kaç!" },
    { icon: "trending-up-outline", text: "Her bölüm ligin bir takımı; kadron sıfırlanırsa oyun biter." },
  ],
  describe: (stats) =>
    [
      stats.level != null ? `Bölüm ${stats.level}` : "",
      stats.goals != null ? `${stats.goals} gol` : "",
      stats.squad ? `En kalabalık kadro ${stats.squad}` : "",
      stats.rivals ? `${stats.rivals} grup eritildi` : "",
    ].filter(Boolean),
  overTitle: "Kadron tükendi",
  taunt: "Bu kadar kalabalık bir kadroyu sen de kur",
};

export default function KadroScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
