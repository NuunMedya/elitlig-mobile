/**
 * SKOR TAHMİNİ — oynanmış maçların sonucunu bil.
 *
 * Seçilen ilin (ya da tüm Türkiye'nin) gerçek, oynanmış maçlarından biri
 * gelir; sonuç gizlidir. Şıklar: "X kazandı · Berabere · Y kazandı" (1 · X ·
 * 2). Bildikçe puan kazanılır; seri çarpanı ve kısalan süreyle oyun giderek
 * zorlaşır. Motor: `components/game/QuizScreen.tsx`.
 */

import { QuizScreen, type QuizConfig } from "@/components/game/QuizScreen";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";
import { matchQuestion } from "@/lib/game/quiz/questions";

const CONFIG: QuizConfig = {
  game: "tahmin",
  title: "Skor Tahmini",
  subtitle: "Oynanmış maçları kim kazandı?",
  icon: "stats-chart",
  bestKey: ARENA_BEST_KEYS.tahmin,
  source: "matches",
  minPool: 6,
  rules: [
    { icon: "football-outline", text: "Oynanmış gerçek bir maç gelir, sonuç gizli. Ev sahibi mi kazandı, berabere mi, deplasman mı?" },
    { icon: "timer-outline", text: "Hızlı cevap daha çok puan; doğru seri puanı ×3'e kadar katlar." },
    { icon: "heart-outline", text: "3 canın var. Yanlış tahmin ya da süre dolması bir can götürür." },
    { icon: "trending-up-outline", text: "Her 5 doğruda seviye atlarsın, düşünme süren kısalır." },
  ],
  next: (pool, level, recent) => (pool.kind === "matches" ? matchQuestion(pool.matches, level, recent) : null),
  overTitle: "Canların bitti",
  taunt: "Maçları benden iyi mi hatırlıyorsun?",
};

export default function TahminScreen() {
  return <QuizScreen config={CONFIG} />;
}
