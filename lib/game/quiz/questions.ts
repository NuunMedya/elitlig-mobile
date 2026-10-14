/**
 * BİLGİ YARIŞMASI — soru üreticileri ve puanlama. Saf TypeScript.
 *
 * Üç oyun (Arena, Kim Bu?, Skor Tahmini) aynı yarışma motorunu kullanır;
 * farkları yalnız SORU HAVUZU ve SORU TÜRLERİdir. Sorular gerçek lig verisinden
 * (seçilen ilin ya da tüm Türkiye'nin oyuncu istatistikleri ve oynanmış
 * maçları) her oyunda yeniden üretilir — ezberlenecek sabit bir soru bankası
 * yoktur.
 *
 * NEDEN BU DOSYA REACT'TAN AYRI: kurallar (zorluk, puan, tekrar etmeme) Node'da
 * başsız doğrulanır (bkz. scripts/check-games.mjs). Bu yüzden burada yalnız
 * `import type` vardır.
 *
 * ORTAK KURALLAR
 *   · 3 can. Yanlış cevap ya da süre dolması bir can götürür.
 *   · Doğru cevap: 100 + kalan süre bonusu (en çok 100), seri çarpanıyla.
 *     Seri: 3 doğru ×1,5 · 6 doğru ×2 · 10 doğru ×3.
 *   · Her 5 doğruda seviye atlanır: süre kısalır, sorular zorlaşır (daha yakın
 *     değerler, aynı takımdan şıklar, yeni soru türleri).
 *   · Oyun başına bir "Yarı yarıya" jokeri.
 */

/* ═════════════════════════ TİPLER ═════════════════════════ */

export interface QuizPlayer {
  id: number;
  name: string;
  image: string | null;
  team: string;
  goals: number;
  matches: number;
  points: number;
  assists: number;
}

export interface QuizMatch {
  id: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  league: string;
  date: string;
  city: string;
}

export type QuizVisual =
  /** İki oyuncu kartı; şıklar kartların kendisidir. */
  | { type: "duel"; metric: string; players: [QuizPlayer, QuizPlayer]; values: [string, string] }
  /** Gizemli oyuncu: ipuçları süre ilerledikçe açılır. */
  | { type: "mystery"; player: QuizPlayer; hints: string[] }
  /** Tek oyuncu sahnede; soru onun hakkında. */
  | { type: "spotlight"; player: QuizPlayer; caption: string }
  /** Oynanmış bir maç; sonuç gizli. */
  | { type: "match"; match: QuizMatch }
  | { type: "none" };

export interface QuizOption {
  key: string;
  label: string;
  sub?: string;
  /** Şıkta avatar gösterilecekse. */
  avatar?: { name: string; image: string | null };
}

export interface QuizQuestion {
  /** Tekrar etmeme anahtarı (aynı oyuncu/maç kısa sürede yeniden sorulmaz). */
  id: string;
  /** Üst etiket: "GOL DÜELLOSU", "GİZEMLİ OYUNCU"… */
  tag: string;
  prompt: string;
  visual: QuizVisual;
  options: QuizOption[];
  answer: string;
  /** Cevaptan sonra gösterilen tek satır. */
  reveal: string;
  /** Soru süresi (sn). */
  seconds: number;
  /** Şık yerleşimi: kart (düello), dikey liste, yatay üçlü (maç). */
  layout: "duel" | "list" | "triple";
  /** Soruyu üreten oyuncu/maç kimlikleri — tekrar etmemek için. */
  subjects: string[];
}

export type Rand = () => number;

/* ═════════════════════════ PUANLAMA ═════════════════════════ */

export const QUIZ_LIVES = 3;
export const CORRECT_PER_LEVEL = 5;

export const levelOf = (correct: number) => 1 + Math.floor(correct / CORRECT_PER_LEVEL);

export const multiplierOf = (streak: number) => (streak >= 10 ? 3 : streak >= 6 ? 2 : streak >= 3 ? 1.5 : 1);

/** Doğru cevabın puanı. `remaining` kalan sürenin payı (0–1). */
export function scoreFor(remaining: number, streakAfter: number): number {
  const r = Math.max(0, Math.min(1, remaining));
  return Math.round((100 + Math.round(r * 100)) * multiplierOf(streakAfter));
}

/** Seviyeye göre süre: başta cömert, en az `min` saniye. */
export const secondsFor = (level: number, start: number, min: number) =>
  Math.max(min, Math.round((start - (level - 1) * 0.8) * 10) / 10);

/* ═════════════════════════ YARDIMCILAR ═════════════════════════ */

const pick = <T,>(list: T[], rand: Rand): T => list[Math.floor(rand() * list.length)];

function shuffle<T>(list: T[], rand: Rand): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const formatNum = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmt1 = (value: number) => value.toFixed(2).replace(".", ",");

const pKey = (p: QuizPlayer) => `p${p.id}`;
const playerOption = (p: QuizPlayer, sub?: string): QuizOption => ({
  key: pKey(p),
  label: p.name,
  sub: sub ?? (p.team || undefined),
  avatar: { name: p.name, image: p.image },
});

/** "Ahmet Yılmaz" → "A. Y." — Kim Bu? ipucu. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase("tr-TR")}.`)
    .join(" ");

/** Seviyeye göre iki değerin en az ne oranda farklı olması gerektiği. */
const minRatio = (level: number) => (level <= 1 ? 1.8 : level === 2 ? 1.5 : level === 3 ? 1.3 : level === 4 ? 1.18 : 1.08);

/** Yakın ama farklı sayısal şıklar: doğru değer + 3 çeldirici. */
function numericOptions(value: number, rand: Rand, level: number): number[] {
  const spread = Math.max(2, Math.round(value * (level <= 2 ? 0.45 : 0.25)));
  const set = new Set<number>([value]);
  let guard = 0;
  while (set.size < 4 && guard < 60) {
    guard += 1;
    const delta = 1 + Math.floor(rand() * spread);
    const candidate = value + (rand() < 0.5 ? -delta : delta);
    if (candidate >= 0) set.add(candidate);
  }
  return shuffle([...set], rand);
}

/* ═════════════════════════ METRİKLER ═════════════════════════ */

interface Metric {
  key: string;
  tag: string;
  prompt: string;
  value: (p: QuizPlayer) => number;
  show: (p: QuizPlayer) => string;
  minLevel: number;
  /** Anlamlı bir karşılaştırma için en az maç sayısı. */
  minMatches: number;
}

const METRICS: Metric[] = [
  { key: "goals", tag: "GOL DÜELLOSU", prompt: "Hangisi daha çok gol attı?", value: (p) => p.goals, show: (p) => `${p.goals} gol`, minLevel: 1, minMatches: 1 },
  { key: "matches", tag: "MAÇ DÜELLOSU", prompt: "Hangisi daha çok maça çıktı?", value: (p) => p.matches, show: (p) => `${p.matches} maç`, minLevel: 1, minMatches: 1 },
  { key: "assists", tag: "ASİST DÜELLOSU", prompt: "Hangisi daha çok asist yaptı?", value: (p) => p.assists, show: (p) => `${p.assists} asist`, minLevel: 2, minMatches: 1 },
  { key: "points", tag: "PUAN DÜELLOSU", prompt: "Hangisinin toplam oyuncu puanı daha yüksek?", value: (p) => p.points, show: (p) => `${formatNum(p.points)} puan`, minLevel: 2, minMatches: 1 },
  {
    key: "gpm",
    tag: "GOL ORTALAMASI",
    prompt: "Maç başına hangisi daha çok gol atıyor?",
    value: (p) => (p.matches ? p.goals / p.matches : 0),
    show: (p) => `${fmt1(p.matches ? p.goals / p.matches : 0)} gol/maç`,
    minLevel: 3,
    minMatches: 3,
  },
];

/* ═════════════════════════ ARENA — OYUNCU DÜELLOLARI ═════════════════════════ */

function duel(pool: QuizPlayer[], level: number, rand: Rand, recent: Set<string>): QuizQuestion | null {
  const metrics = METRICS.filter((m) => m.minLevel <= level);
  const ratio = minRatio(level);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const metric = pick(metrics, rand);
    const a = pick(pool, rand);
    const b = pick(pool, rand);
    if (!a || !b || a.id === b.id) continue;
    if (a.matches < metric.minMatches || b.matches < metric.minMatches) continue;
    if (attempt < 60 && (recent.has(pKey(a)) || recent.has(pKey(b)))) continue;
    const va = metric.value(a);
    const vb = metric.value(b);
    if (va === vb || Math.max(va, vb) <= 0) continue;
    const r = Math.max(va, vb) / Math.max(0.0001, Math.min(va, vb));
    // Kolay seviyede belirgin fark; zorlaştıkça değerler birbirine yaklaşır.
    if (r < ratio || (level >= 4 && attempt < 50 && r > ratio * 2.2)) continue;
    const winner = va > vb ? a : b;
    return {
      id: `duel-${metric.key}-${a.id}-${b.id}`,
      tag: metric.tag,
      prompt: metric.prompt,
      visual: { type: "duel", metric: metric.key, players: [a, b], values: [metric.show(a), metric.show(b)] },
      options: [playerOption(a), playerOption(b)],
      answer: pKey(winner),
      reveal: `${winner.name}: ${metric.show(winner)} · ${(winner === a ? b : a).name}: ${metric.show(winner === a ? b : a)}`,
      seconds: secondsFor(level, 10, 5),
      layout: "duel",
      subjects: [pKey(a), pKey(b)],
    };
  }
  return null;
}

/** "X'in 12 golü var. Y daha fazla mı daha az mı attı?" */
function higherLower(pool: QuizPlayer[], level: number, rand: Rand, recent: Set<string>): QuizQuestion | null {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const a = pick(pool, rand);
    const b = pick(pool, rand);
    if (!a || !b || a.id === b.id || a.goals === b.goals) continue;
    if (attempt < 40 && recent.has(pKey(b))) continue;
    const r = Math.max(a.goals, b.goals) / Math.max(1, Math.min(a.goals, b.goals));
    if (r < minRatio(level) * 0.9) continue;
    const more = b.goals > a.goals;
    return {
      id: `hl-${a.id}-${b.id}`,
      tag: "DAHA FAZLA MI, DAHA AZ MI?",
      prompt: `${a.name} ${a.goals} gol attı. ${b.name} kaç gol attı?`,
      visual: { type: "spotlight", player: b, caption: `${a.name}: ${a.goals} gol` },
      options: [
        { key: "more", label: "Daha fazla", sub: `${a.goals} golden fazla` },
        { key: "less", label: "Daha az", sub: `${a.goals} golden az` },
      ],
      answer: more ? "more" : "less",
      reveal: `${b.name}: ${b.goals} gol`,
      seconds: secondsFor(level, 10, 5),
      layout: "list",
      subjects: [pKey(b)],
    };
  }
  return null;
}

/** "Bu kapsamın gol kralı kim?" — sıralamanın tepesinden. */
function topScorer(pool: QuizPlayer[], level: number, rand: Rand, scopeLabel: string, recent: Set<string>): QuizQuestion | null {
  const ranked = pool.slice().sort((x, y) => y.goals - x.goals);
  if (ranked.length < 4 || ranked[0].goals === ranked[1].goals) return null;
  const king = ranked[0];
  if (recent.has(pKey(king))) return null;
  const others = shuffle(ranked.slice(1, level >= 5 ? 5 : 10), rand).slice(0, 3);
  return {
    id: `king-${king.id}`,
    tag: "GOL KRALI",
    prompt: `${scopeLabel} gol krallığında zirvede kim var?`,
    visual: { type: "none" },
    options: shuffle([king, ...others], rand).map((p) => playerOption(p)),
    answer: pKey(king),
    reveal: `${king.name} ${king.goals} golle zirvede.`,
    seconds: secondsFor(level, 12, 6),
    layout: "list",
    subjects: [pKey(king)],
  };
}

/** "X kaç gol attı?" — yakın sayısal şıklar. */
function howMany(pool: QuizPlayer[], level: number, rand: Rand, recent: Set<string>): QuizQuestion | null {
  const candidates = pool.filter((p) => p.goals >= 3 && !recent.has(pKey(p)));
  if (!candidates.length) return null;
  const p = pick(candidates, rand);
  const values = numericOptions(p.goals, rand, level);
  return {
    id: `count-${p.id}`,
    tag: "SAYILARLA",
    prompt: `${p.name} toplam kaç gol attı?`,
    visual: { type: "spotlight", player: p, caption: `${p.matches} maç` },
    options: values.map((v) => ({ key: `n${v}`, label: `${v} gol` })),
    answer: `n${p.goals}`,
    reveal: `${p.name}: ${p.matches} maçta ${p.goals} gol`,
    seconds: secondsFor(level, 11, 6),
    layout: "list",
    subjects: [pKey(p)],
  };
}

export function arenaQuestion(
  pool: QuizPlayer[],
  level: number,
  recent: Set<string>,
  scopeLabel: string,
  rand: Rand = Math.random,
): QuizQuestion | null {
  const roll = rand();
  let q: QuizQuestion | null = null;
  if (level >= 4 && roll < 0.12) q = topScorer(pool, level, rand, scopeLabel, recent);
  else if (level >= 3 && roll < 0.3) q = howMany(pool, level, rand, recent);
  else if (level >= 2 && roll < 0.5) q = higherLower(pool, level, rand, recent);
  return q ?? duel(pool, level, rand, recent);
}

/* ═════════════════════════ KİM BU? — OYUNCU BİLMECELERİ ═════════════════════════ */

/** Çeldiriciler: seviye yükseldikçe aynı takımdan / benzer gol sayısından. */
function distractors(pool: QuizPlayer[], secret: QuizPlayer, level: number, rand: Rand, count: number): QuizPlayer[] {
  const others = pool.filter((p) => p.id !== secret.id && p.name !== secret.name);
  let near: QuizPlayer[] = [];
  if (level >= 3) near = others.filter((p) => p.team && p.team === secret.team);
  if (near.length < count && level >= 2) {
    const byGoals = others.slice().sort((x, y) => Math.abs(x.goals - secret.goals) - Math.abs(y.goals - secret.goals));
    near = [...near, ...byGoals.slice(0, 8).filter((p) => !near.includes(p))];
  }
  const chosen = shuffle(near, rand).slice(0, count);
  const rest = shuffle(others.filter((p) => !chosen.includes(p)), rand);
  return [...chosen, ...rest].slice(0, count);
}

function mystery(pool: QuizPlayer[], level: number, rand: Rand, recent: Set<string>): QuizQuestion | null {
  const candidates = pool.filter((p) => p.matches >= 2 && !recent.has(pKey(p)));
  if (candidates.length < 1 || pool.length < 4) return null;
  // Erken seviyede tanınan (çok gol atan) oyuncular; sonra herkes.
  const ranked = candidates.slice().sort((x, y) => y.goals - x.goals);
  const reach = level <= 1 ? 15 : level === 2 ? 30 : level === 3 ? 60 : ranked.length;
  const secret = pick(ranked.slice(0, Math.max(4, reach)), rand);
  const hints = [
    secret.team ? `Takımı: ${secret.team}` : `${secret.matches} maça çıktı`,
    `${secret.matches} maç · ${secret.goals} gol · ${secret.assists} asist`,
    `Baş harfleri: ${initials(secret.name)}`,
  ];
  return {
    id: `who-${secret.id}`,
    tag: "GİZEMLİ OYUNCU",
    prompt: "Bu oyuncu kim? İpuçları açıldıkça puan azalır.",
    visual: { type: "mystery", player: secret, hints },
    options: shuffle([secret, ...distractors(pool, secret, level, rand, 3)], rand).map((p) => playerOption(p, "")),
    answer: pKey(secret),
    reveal: `${secret.name}${secret.team ? ` · ${secret.team}` : ""}`,
    seconds: secondsFor(level, 15, 9),
    layout: "list",
    subjects: [pKey(secret)],
  };
}

function whichTeam(pool: QuizPlayer[], level: number, rand: Rand, recent: Set<string>): QuizQuestion | null {
  const teams = [...new Set(pool.map((p) => p.team).filter(Boolean))];
  if (teams.length < 4) return null;
  const candidates = pool.filter((p) => p.team && !recent.has(pKey(p)));
  if (!candidates.length) return null;
  const secret = pick(candidates.slice(0, level <= 2 ? 40 : candidates.length), rand);
  const wrong = shuffle(teams.filter((t) => t !== secret.team), rand).slice(0, 3);
  return {
    id: `team-${secret.id}`,
    tag: "HANGİ TAKIM?",
    prompt: `${secret.name} hangi takımda oynuyor?`,
    visual: { type: "spotlight", player: secret, caption: `${secret.matches} maç · ${secret.goals} gol` },
    options: shuffle([secret.team, ...wrong], rand).map((t) => ({ key: `t${t}`, label: t })),
    answer: `t${secret.team}`,
    reveal: `${secret.name} · ${secret.team}`,
    seconds: secondsFor(level, 11, 6),
    layout: "list",
    subjects: [pKey(secret)],
  };
}

function whoPlaysFor(pool: QuizPlayer[], level: number, rand: Rand, recent: Set<string>): QuizQuestion | null {
  const byTeam = new Map<string, QuizPlayer[]>();
  pool.forEach((p) => {
    if (!p.team) return;
    byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
  });
  const teams = [...byTeam.keys()];
  if (teams.length < 4) return null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const team = pick(teams, rand);
    const members = byTeam.get(team) ?? [];
    const secret = pick(members, rand);
    if (!secret || recent.has(pKey(secret))) continue;
    const others = shuffle(pool.filter((p) => p.team && p.team !== team), rand).slice(0, 3);
    if (others.length < 3) return null;
    return {
      id: `member-${secret.id}`,
      tag: "TAKIM ARKADAŞI",
      prompt: `Hangisi ${team} oyuncusu?`,
      visual: { type: "none" },
      options: shuffle([secret, ...others], rand).map((p) => playerOption(p, "")),
      answer: pKey(secret),
      reveal: `${secret.name} · ${team}`,
      seconds: secondsFor(level, 11, 6),
      layout: "list",
      subjects: [pKey(secret)],
    };
  }
  return null;
}

export function kimbuQuestion(pool: QuizPlayer[], level: number, recent: Set<string>, rand: Rand = Math.random): QuizQuestion | null {
  const roll = rand();
  let q: QuizQuestion | null = null;
  if (roll < 0.22) q = whichTeam(pool, level, rand, recent);
  else if (roll < 0.38) q = whoPlaysFor(pool, level, rand, recent);
  else if (level >= 3 && roll < 0.48) q = howMany(pool, level, rand, recent);
  return q ?? mystery(pool, level, rand, recent) ?? whichTeam(pool, level, rand, new Set());
}

/* ═════════════════════════ SKOR TAHMİNİ ═════════════════════════ */

export const RESULT_KEYS = { home: "home", draw: "draw", away: "away" } as const;

export function matchQuestion(pool: QuizMatch[], level: number, recent: Set<string>, rand: Rand = Math.random): QuizQuestion | null {
  const fresh = pool.filter((m) => !recent.has(`m${m.id}`));
  const source = fresh.length ? fresh : pool;
  if (!source.length) return null;
  const m = pick(source, rand);
  const answer = m.homeScore > m.awayScore ? "home" : m.homeScore < m.awayScore ? "away" : "draw";
  return {
    id: `match-${m.id}`,
    tag: m.league ? m.league.toLocaleUpperCase("tr-TR") : "MAÇ",
    prompt: "Bu maçı kim kazandı?",
    visual: { type: "match", match: m },
    options: [
      { key: "home", label: `${m.home} kazandı` },
      { key: "draw", label: "Berabere" },
      { key: "away", label: `${m.away} kazandı` },
    ],
    answer,
    reveal: `${m.home} ${m.homeScore} – ${m.awayScore} ${m.away}`,
    seconds: secondsFor(level, 9, 4),
    layout: "triple",
    subjects: [`m${m.id}`],
  };
}

/* ═════════════════════════ HAVUZ DÖNÜŞTÜRÜCÜLERİ ═════════════════════════ */

const JUNK = /hükmen|hukmen|antpl/i;

export interface RawPlayer {
  id: number | string;
  name?: string | null;
  image?: string | null;
  teamName?: string | null;
  goals?: number | string | null;
  matches?: number | string | null;
  points?: number | string | null;
  assists?: number | string | null;
}

export function toPlayers(rows: RawPlayer[]): QuizPlayer[] {
  return rows
    .filter((p) => p.name && !JUNK.test(p.name))
    .map((p) => ({
      id: Number(p.id),
      name: String(p.name).trim(),
      image: p.image ?? null,
      team: p.teamName && !JUNK.test(p.teamName) ? p.teamName : "",
      goals: Number(p.goals) || 0,
      matches: Number(p.matches) || 0,
      points: Math.round(Number(p.points) || 0),
      assists: Number(p.assists) || 0,
    }))
    .filter((p) => p.id && p.matches > 0);
}

export interface RawMatch {
  id: number;
  first_team_name?: string | null;
  second_team_name?: string | null;
  first_team_score?: number | string | null;
  second_team_score?: number | string | null;
  league_name?: string | null;
  date?: string | null;
  city?: string | null;
  mac_durumu?: string | null;
}

export function toMatches(rows: RawMatch[]): QuizMatch[] {
  return rows
    .filter(
      (m) =>
        m.first_team_name &&
        m.second_team_name &&
        !JUNK.test(m.first_team_name) &&
        !JUNK.test(m.second_team_name) &&
        m.first_team_score != null &&
        m.second_team_score != null &&
        String(m.first_team_score) !== "" &&
        String(m.second_team_score) !== "" &&
        (!m.mac_durumu || m.mac_durumu === "yayinlanmis"),
    )
    .map((m) => ({
      id: Number(m.id),
      home: String(m.first_team_name).trim(),
      away: String(m.second_team_name).trim(),
      homeScore: Number(m.first_team_score),
      awayScore: Number(m.second_team_score),
      league: m.league_name ?? "",
      date: m.date ?? "",
      city: m.city ?? "",
    }))
    .filter((m) => Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore));
}
