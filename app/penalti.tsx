/**
 * PENALTI — seri penaltı düellosu: ligin golcüsüyle atarsın, kalecinle
 * kurtarırsın. Her maç ligin bir sonraki kulübüne karşı (kaleci merdiveni:
 * en çok kurtarış yapan kaleci finalde). Kaybedince turnuva biter.
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
    { icon: "people-outline", text: "Seri penaltı: beşer atış, sırayla. Sen atarsın, sonra kaleye geçersin. Eşitlikte ani ölüm." },
    { icon: "locate-outline", text: "Sürükle, nişan al; bırak ve güç çubuğu yeşildeyken dokun. Köşe riskli: halka direği aşarsa top dışarı gidebilir." },
    { icon: "options-outline", text: "Plase dengeli, Sert hızlı ama savruk, Kaşık erken yatan kaleciyi rezil eder." },
    { icon: "hand-left-outline", text: "Kalede: uçmak istediğin yöne kaydır, dokunursan ortada kalırsın. Vuruş anında zaman yavaşlar." },
    { icon: "trophy-outline", text: "Kazandıkça sıradaki kulübe geçersin; finalde ligin en çok kurtarış yapan kalecisi var." },
  ],
  describe: (stats) =>
    [
      stats.champion ? "Şampiyon!" : stats.wins != null ? `${stats.wins} maç kazandın` : "",
      stats.goals != null && stats.shots ? `${stats.goals}/${stats.shots} gol` : "",
      stats.saves ? `${stats.saves} kurtarış` : "",
      stats.keeper && stats.keepers ? `Tur ${stats.keeper}/${stats.keepers}` : "",
    ].filter(Boolean),
  overTitle: "Turnuva bitti",
  taunt: "Bu kulübü seri penaltılarda geçebilir misin?",
};

export default function PenaltiScreen() {
  return <ArenaGameScreen config={CONFIG} />;
}
