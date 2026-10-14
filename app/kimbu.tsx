/**
 * KİM BU? — oyuncu bilmeceleri bilgi yarışması.
 *
 * Gizemli oyuncu (ipuçları süre ilerledikçe açılır: erken bilen çok puan
 * alır), "hangi takımda oynuyor?", "hangisi X takımının oyuncusu?" ve "kaç gol
 * attı?" soruları. Sorular seçilen ilin ya da tüm Türkiye'nin gerçek
 * oyuncularından üretilir; seviye yükseldikçe şıklar aynı takımdan ve benzer
 * istatistikli oyunculardan gelir. Motor: `components/game/QuizScreen.tsx`.
 */

import { QuizScreen, type QuizConfig } from "@/components/game/QuizScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";
import { kimbuQuestion } from "@/lib/game/quiz/questions";

const CONFIG: QuizConfig = {
  game: "kimbu",
  title: "Kim Bu?",
  subtitle: "İpuçlarından gizemli oyuncuyu bul",
  icon: "search",
  bestKey: ARENA_BEST_KEYS.kimbu,
  source: "players",
  minPool: 8,
  rules: [
    { icon: "bulb-outline", text: "İpuçları süre ilerledikçe açılır: oyuncuyu ne kadar erken bilirsen o kadar çok puan." },
    { icon: "shirt-outline", text: "Kim hangi takımda? Takım arkadaşını bul, gol sayısını tahmin et." },
    { icon: "heart-outline", text: "3 canın ve bir \"Yarı yarıya\" jokerin var." },
    { icon: "trending-up-outline", text: "Seviye yükseldikçe şıklar aynı takımdan gelir, süre kısalır." },
  ],
  next: (pool, level, recent) => (pool.kind === "players" ? kimbuQuestion(pool.players, level, recent) : null),
  overTitle: "Canların bitti",
  taunt: "Bu oyuncuları sen tanır mısın?",
};

export default function KimBuScreen() {
  return <QuizScreen config={CONFIG} />;
}
