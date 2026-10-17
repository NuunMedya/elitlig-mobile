/**
 * PENALTI — seri penaltı düellosu: ligin golcüsüyle atarsın; rakibin atışları
 * sırayla skorborda işlenir. Her maç ligin bir sonraki kulübüne karşı (kaleci
 * merdiveni: en çok kurtarış yapan kaleci finalde). Kaybedince turnuva biter.
 *
 * Oyunun kendisi `games/penalti.js` (three.js, WebView içinde); kurallar,
 * kontroller ve puanlama orada belgelenmiştir. Bu ekran yalnız ortak Arena
 * kabuğunu oyuna bağlar: giriş/bitiş kartları, rekor tablosu, paylaşım.
 */

import { ArenaGameScreen, type ArenaGameConfig } from "@/components/game/ArenaGameScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";

const CONFIG: ArenaGameConfig = {
  game: "penalti",
  title: "Penaltı",
  subtitle: "Seri penaltılarda ligin kulüplerini tek tek ele",
  icon: "football",
  bestKey: ARENA_BEST_KEYS.penalti,
  rules: [
    { icon: "people-outline", text: "Seri penaltı: beşer atış. Sen atarsın, rakibin atışı sırayla skorborda işlenir. Eşitlikte ani ölüm." },
    { icon: "locate-outline", text: "Sürükle, nişan al; bırak ve güç çubuğu yeşildeyken dokun. Yeşilde vurursan top tam nişana gider; fazla güç yükseltir, az güç alçaltıp yavaşlatır." },
    { icon: "options-outline", text: "Plase dengeli, Sert hızlı ama hata affetmez, Kaşık yavaş aşırtma (rüzgârdan çok etkilenir)." },
    { icon: "flag-outline", text: "Rüzgâr topu sürükler: oku izle, nişanını ona göre kaydır. İleride yağmur, daralan yeşil bölge ve titreyen nişan seni zorlar." },
    { icon: "flash-outline", text: "Jokerler: Kaleci Gözü kalecinin yönünü gösterir, Füze kusursuz ve çok hızlı vurur, Dev Kale kaleyi büyütür. Kazandıkça yenisi gelir." },
    { icon: "trophy-outline", text: "Kazandıkça sıradaki, daha zor kulübe geçersin; finalde ligin en çok kurtarış yapan kalecisi var." },
  ],
  describe: (stats) =>
    [
      stats.champion ? "Şampiyon!" : stats.wins != null ? `${stats.wins} maç kazandın` : "",
      stats.goals != null && stats.shots ? `${stats.goals}/${stats.shots} gol` : "",
      stats.keeper && stats.keepers ? `Tur ${stats.keeper}/${stats.keepers}` : "",
    ].filter(Boolean),
  overTitle: "Turnuva bitti",
  taunt: "Bu kulübü seri penaltılarda geçebilir misin?",
};

export default function PenaltiScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
