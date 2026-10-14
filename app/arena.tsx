/**
 * ARENA — oyuncu düelloları bilgi yarışması.
 *
 * "Hangisi daha çok gol attı?", "daha fazla mı daha az mı?", "kaç gol attı?",
 * "gol kralı kim?" — sorular seçilen ilin (ya da tüm Türkiye'nin) gerçek
 * oyuncu istatistiklerinden her oyunda yeniden üretilir. Seviye yükseldikçe
 * karşılaştırılan değerler birbirine yaklaşır ve yeni soru türleri açılır.
 * Motor ve kurallar: `components/game/QuizScreen.tsx`,
 * `lib/game/quiz/questions.ts`.
 */

import { QuizScreen, type QuizConfig } from "@/components/game/QuizScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";
import { arenaQuestion } from "@/lib/game/quiz/questions";

const CONFIG: QuizConfig = {
  game: "seri",
  title: "Arena",
  subtitle: "Oyuncu düelloları: kim daha iyi?",
  icon: "flame",
  bestKey: ARENA_BEST_KEYS.seri,
  source: "players",
  minPool: 8,
  rules: [
    { icon: "people-outline", text: "İki oyuncudan hangisi daha çok gol attı, maça çıktı, asist yaptı? Doğru kartı seç." },
    { icon: "timer-outline", text: "Hızlı cevap daha çok puan; arka arkaya doğrular puanı ×3'e kadar katlar." },
    { icon: "heart-outline", text: "3 canın var. Yanlış cevap ya da süre dolması bir can götürür." },
    { icon: "trending-up-outline", text: "Her 5 doğruda seviye atlarsın: değerler yakınlaşır, yeni soru türleri gelir." },
  ],
  next: (pool, level, recent, scopeLabel) => (pool.kind === "players" ? arenaQuestion(pool.players, level, recent, scopeLabel) : null),
  overTitle: "Canların bitti",
  taunt: "Oyuncuları benden iyi tanıyor musun?",
};

export default function ArenaScreen() {
  return <QuizScreen config={CONFIG} />;
}
