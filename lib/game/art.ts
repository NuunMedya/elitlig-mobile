/**
 * OYUN SAHNESİ PALETİ — illüstrasyonun renkleri.
 *
 * NEDEN `paint.ts`'TEN AYRI: `paint` arayüz tokenlarından türeyen birkaç
 * renkle yetiniyordu ve sahne "yeşil zemin üstünde beyaz çizgiler"den öteye
 * geçemiyordu. Profesyonel görünen bir maç sahnesi — gece göğü, tribün,
 * projektör, LED pano, gölgeli çim, kalecinin forması, turuncu koni — arayüz
 * paletinin taşımadığı onlarca ton ister. Bu tonlar ARAYÜZ değil
 * İLLÜSTRASYONDUR: temayla dönmez (koyu temada çim yine çimdir) ve hiçbir
 * metin/zemin çiftine girmez, yani kontrast denetiminin konusu değildir.
 *
 * Kurallar:
 *   · Değerler yalnız oyun tuvallerinde kullanılır; HUD, kart ve düğmeler
 *     `@/theme` tokenlarında kalır.
 *   · Marka moru tek bir yerden gelir: LED panolar ve slalomdaki oyuncunun
 *     forması uygulamanın kimliğini sahaya taşır.
 */

export const art = {
  /* — Gece göğü ve stadyum — */
  skyTop: "#070B1C",
  skyBottom: "#1A2350",
  skyGlow: "#3B4A8C",
  roof: "#05081A",
  standBack: "#10173A",
  standFront: "#182150",
  standRail: "#2A3570",
  /** Seyirci kafaları — sıcak/soğuk karışık, tek renk duvar olmasın. */
  crowd: [
    "#E2E8F0", "#94A3B8", "#F8D7B5", "#C68B63", "#7C3AED",
    "#A78BFA", "#F43F5E", "#FBBF24", "#38BDF8", "#1E293B",
  ],
  floodlight: "#FFF7DB",
  floodlightCore: "#FFFFFF",
  tower: "#0B1028",

  /* — LED reklam panoları — */
  boardTop: "#4C1D95",
  boardBottom: "#2E1065",
  boardText: "#FFFFFF",
  boardAccent: "#C4B5FD",

  /* — Çim — */
  grassFar: "#2E8B4E",
  grassNear: "#1B6A36",
  grassLight: "#FFFFFF",
  grassDark: "#000000",
  chalk: "#F4F7F2",

  /* — Kale — */
  postLight: "#FFFFFF",
  postShade: "#B8C0CC",
  net: "#F1F5F9",

  /* — Top — */
  ballBody: "#FFFFFF",
  ballEdge: "#B9C1CC",
  ballPatch: "#161B26",
  ballPatchEdge: "#0B0E15",

  /* — Kaleci (neon sarı, koyu şort) — */
  keeperJersey: "#E6F23C",
  keeperJerseyDark: "#A8B51C",
  keeperTrim: "#111827",
  keeperShorts: "#111827",
  keeperGlove: "#F8FAFC",
  keeperGloveCuff: "#22C55E",

  /* — Slalom oyuncusu (Elitlig moru) — */
  playerJersey: "#7C3AED",
  playerJerseyDark: "#4C1D95",
  playerTrim: "#FFFFFF",
  playerShorts: "#F8FAFC",
  playerShortsShade: "#CBD5E1",
  playerSock: "#7C3AED",
  boot: "#0F172A",
  bootSole: "#F97316",

  /* — Ortak insan tonları — */
  skin: "#E3AE86",
  skinShade: "#B97F58",
  hair: "#24160F",
  outline: "#0B1020",

  /* — Koni — */
  coneLight: "#FFB067",
  coneMid: "#F97316",
  coneDark: "#B4410C",
  coneBand: "#FFFFFF",
  coneBase: "#1E1B2E",
  coneBaseTop: "#3A3550",

  /* — Efekt — */
  shadow: "#000000",
  goal: "#22C55E",
  miss: "#F43F5E",
  gold: "#FBBF24",
  white: "#FFFFFF",
  confetti: ["#7C3AED", "#A78BFA", "#FBBF24", "#22C55E", "#F43F5E", "#FFFFFF", "#38BDF8"],
} as const;

/**
 * Tohumlu sözde-rastgele üreteç (mulberry32). Tribündeki kalabalık her açılışta
 * AYNI dizilmeli — her render'da yeniden karılan bir seyirci kitlesi titrer.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
