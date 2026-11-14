/**
 * SONSUZ ve BİLGİ OYUNLARI kataloğu — `/oyun/<anahtar>` ana sayfasının verisi
 * (sözleşme §1, §6). Bölümlü oyunlar `lib/puzzle/registry.ts` modülleridir;
 * burada yalnız skorlu oyunlar durur.
 *
 * `route`: asıl oyun ekranı (ana sayfanın büyük OYNA düğmesi buraya açar).
 * `lives`: her tur 1 can (sözleşme §4); Günün Testi canı yoktur (günde 1).
 */

import type Ionicons from "@expo/vector-icons/Ionicons";

import type { ArenaGame } from "../api/arena";
import type { LifeGameKey } from "../puzzle/api";

export type ScoreGameKind = "endless" | "quiz" | "daily";

export interface ScoreGameDef {
  key: ArenaGame;
  kind: ScoreGameKind;
  title: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: "/slalom" | "/sektir" | "/arena" | "/kimbu" | "/tahmin" | "/gunun";
  /** Canlı oyun mu (her tur 1 can); Günün Testi değil. */
  lives: LifeGameKey | null;
  rules: string[];
}

export const SCORE_GAMES: readonly ScoreGameDef[] = [
  {
    key: "slalom",
    kind: "endless",
    title: "Slalom",
    tagline: "Şerit değiştir, zıpla, kay: savunmayı geç",
    icon: "flag",
    route: "/slalom",
    lives: "slalom",
    rules: [
      "Sola ya da sağa kaydır: şerit değiştir. Yukarı zıpla, aşağı kay.",
      "Çarpmak bir hak götürür; parlayan kutular güç verir.",
      "Her 10 metre puan; hatasız seri çarpanı büyütür.",
    ],
  },
  {
    key: "sektir",
    kind: "endless",
    title: "Top Sektir",
    tagline: "Barajı aş, kalenin altından geç, gol at",
    icon: "football-outline",
    route: "/sektir",
    lives: "sektir",
    rules: [
      "Ekrana dokun: top havalanır. Boşluktan geçmek bir gol.",
      "Boşluğun tam ortası çarpanı büyütür; altın yıldızlar bonus.",
      "Top çime, baraja ya da direğe değerse tur biter.",
    ],
  },
  {
    key: "seri",
    kind: "quiz",
    title: "Gol Düellosu",
    tagline: "İki oyuncudan hangisi daha çok gol attı?",
    icon: "flame",
    route: "/arena",
    lives: "seri",
    rules: [
      "İki oyuncudan doğru olanı seç: gol, maç, asist.",
      "Hızlı cevap daha çok puan; doğru seri ×3'e kadar katlar.",
      "Turda 3 hakkın var; yanlış ya da süre dolması bir hak götürür.",
    ],
  },
  {
    key: "kimbu",
    kind: "quiz",
    title: "Kim Bu?",
    tagline: "İpuçlarından gizemli oyuncuyu bul",
    icon: "search",
    route: "/kimbu",
    lives: "kimbu",
    rules: [
      "İpuçları süre ilerledikçe açılır: erken bilen çok puan alır.",
      "Turda 3 hakkın ve bir \"Yarı yarıya\" jokerin var.",
      "Seviye yükseldikçe şıklar zorlaşır, süre kısalır.",
    ],
  },
  {
    key: "tahmin",
    kind: "quiz",
    title: "Kim Kazandı?",
    tagline: "Oynanmış maçların sonucunu bil: 1 · X · 2",
    icon: "stats-chart",
    route: "/tahmin",
    lives: "tahmin",
    rules: [
      "Oynanmış gerçek bir maç gelir: ev sahibi, beraberlik ya da deplasman?",
      "Hızlı cevap daha çok puan; doğru seri ×3'e kadar katlar.",
      "Her 5 doğruda seviye atlarsın, düşünme süren kısalır.",
    ],
  },
  {
    key: "gunun",
    kind: "daily",
    title: "Günün Testi",
    tagline: "Herkese aynı 10 soru, günde bir kez",
    icon: "bulb",
    route: "/gunun",
    lives: null,
    rules: [
      "Herkes bugün aynı 10 soruyla yarışır; günde bir resmî deneme.",
      "Her doğru 10 puan, kalan süreden hız bonusu.",
      "Doğru sayına göre en çok 5 yıldız kazanırsın.",
    ],
  },
];

const BY_KEY = new Map<string, ScoreGameDef>(SCORE_GAMES.map((g) => [g.key, g]));
export const scoreGame = (key: string | null | undefined) => (key ? BY_KEY.get(key) ?? null : null);

/**
 * Rekor yıldızı metni (sözleşme §3): rekor kırınca yükselen eşiklere göre
 * yıldız; rekor kırılmayan turda küçük katılım yıldızı.
 */
export const RECORD_STAR_LINE = "Rekorunu kır: yeni eşik = yeni yıldız";
