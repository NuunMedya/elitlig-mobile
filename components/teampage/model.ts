/**
 * TAKIM SAYFASI — saf veri modeli ve yardımcılar.
 *
 * NEDEN AYRI DOSYA: `app/takim/[id].tsx` eskiden 2700 satırdı; sekme
 * bileşenleri `components/teampage/` altına taşınınca hepsinin ortak
 * kullandığı tipler ve hesaplar (maçı takımın gözünden okuma, rekorlar,
 * mevki gruplaması) tek yerde durmalıydı. Bu dosya React içe aktarmaz; yan
 * etkisi yoktur, yalnız hesap yapar.
 *
 * UYDURMA YOK İLKESİ: buradaki her sayı sunucunun döndürdüğü bir kayıttan
 * sayılır. Kaynak eksikse alan boş (null) kalır, varsayılan değer yazılmaz.
 */

import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControlProps,
} from "react-native";
import type React from "react";
import { POSITIONS } from "@/lib/api/team";
import { matchState } from "@/lib/match";
import type { ApiMatch, StandingRow } from "@/lib/types";

/* ══════════════════════════════════════════════════════════════════════════
   Sekme kabuğu — her sekmenin kaydırıcısına aynı iki parça gider
   ══════════════════════════════════════════════════════════════════════════ */

export interface ScrollChrome {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export interface TabShell {
  scrollProps: ScrollChrome;
  /** `useRefresh().control` — RefreshControl düğümü; tipi açık yazılmalı,
      aksi hâlde `ReactElement<unknown>` FlatList'in beklediğine oturmaz. */
  refreshControl: React.ReactElement<RefreshControlProps>;
}

export type LogoFor = (teamId?: number | null, teamName?: string | null) => string | null;

/** Grup içindeki satırın köşe/ayraç konumu. */
export type GroupPosition = "single" | "first" | "middle" | "last";

export function groupPosition(index: number, total: number): GroupPosition {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Dizeden gelen toplamları sayıya çevirir (MySQL sürücüsü metin döndürür). */
export const num = (value: number | string | null | undefined): number => Number(value ?? 0) || 0;

/** Averaj işaretli yazılır: +49 / 0 / -3. Sıfır işaretsiz kalır. */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Sunucu boş alanı bazen "0" ya da "null" DİZESİ olarak döndürüyor (yeni
 * kurulan takımda `current_league: "0"`); bu değerler kimlikte "0 · 0" diye
 * yazılıyordu. Anlamlı bir metin değilse null döner.
 */
export function meaningful(value?: string | number | null): string | null {
  const raw = String(value ?? "").trim();
  return raw && raw !== "0" && raw.toLowerCase() !== "null" ? raw : null;
}

/** Ondalıklı oran — "2,4". Türkçe ondalık ayırıcı virgüldür. */
export function decimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/* ══════════════════════════════════════════════════════════════════════════
   Mevki sözlüğü — kadro gruplaması
   ══════════════════════════════════════════════════════════════════════════ */

export type PosLine = "GK" | "DEF" | "MID" | "FWD" | "OTHER";

export const LINE_ORDER: PosLine[] = ["GK", "DEF", "MID", "FWD", "OTHER"];

export const LINE_LABEL: Record<PosLine, string> = {
  GK: "Kaleci",
  DEF: "Defans",
  MID: "Orta saha",
  FWD: "Forvet",
  /* "Diğer" değil: bu grup bir mevki DEĞİL, eksik bir kayıttır. Ad bunu
     söylemezse kullanıcı "Diğer" diye beşinci bir mevki arar. */
  OTHER: "Mevkisi girilmemiş",
};

/** Bileşik çubuk ve lejant için kısa etiket. */
export const LINE_SHORT: Record<PosLine, string> = {
  GK: "KAL",
  DEF: "DEF",
  MID: "ORT",
  FWD: "FOR",
  OTHER: "—",
};

/** Sunucudaki kısaltma sözlüğü (KL, STP, MOS…) → hat. */
const LINE_BY_CODE = new Map<string, PosLine>(POSITIONS.map((item) => [item.code, item.line as PosLine]));

/**
 * Mevki alanını hatta çevirir.
 *
 * NEDEN İKİ YOL: `PlayerTeams.team_position` kısaltma saklar (KL/STP/MOS),
 * `Players.player_position` ise serbest Türkçe metindir ("Kaleci", "Sol Bek").
 * Uç hangisini döndürürse döndürsün aynı gruba düşmeli.
 *
 * TUZAK: sunucu boş mevkiyi bazen `null`, bazen "null" DİZESİ olarak
 * döndürüyor; dize hâli eskiden "Diğer"e düşüyordu ama satırda "null" diye
 * yazılabiliyordu. İkisi de boş sayılır.
 */
export function lineOf(position?: string | null): PosLine {
  const raw = cleanPosition(position);
  if (!raw) return "OTHER";

  const code = LINE_BY_CODE.get(raw.toLocaleUpperCase("tr-TR"));
  if (code) return code;

  const text = raw.toLocaleLowerCase("tr-TR");
  if (text.includes("kaleci") || text.includes("kale")) return "GK";
  if (
    text.includes("defans") ||
    text.includes("stoper") ||
    text.includes("bek") ||
    text.includes("libero")
  ) {
    return "DEF";
  }
  if (
    text.includes("orta saha") ||
    text.includes("ortasaha") ||
    text.includes("kanat") ||
    text.includes("ofansif") ||
    text.includes("defansif")
  ) {
    return "MID";
  }
  if (text.includes("forvet") || text.includes("santr") || text.includes("golcü")) return "FWD";
  return "OTHER";
}

/** "null"/boş dizeyi ayıklar; gerçek mevki metnini olduğu gibi bırakır. */
export function cleanPosition(position?: string | null): string {
  const raw = String(position ?? "").trim();
  return raw && raw.toLowerCase() !== "null" ? raw : "";
}

export interface SquadEntry {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  line: PosLine;
  jersey: number | null;
  matches: number;
  goals: number;
  assists: number;
  /** Son maçların kadro puanı ortalaması; puan girilmemişse null. */
  rating: number | null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Maç yardımcıları
   ══════════════════════════════════════════════════════════════════════════ */

/** Maçın başlangıç anı (ms). Saat boşsa gün başı sayılır. */
export function matchTime(match: ApiMatch): number {
  return new Date(`${String(match.date).slice(0, 10)}T${match.time || "00:00:00"}`).getTime();
}

/**
 * Saati geçmiş ama sonucu girilmemiş maçın "gecikmiş" sayılma eşiği.
 * Halı saha maçı ~60 dk sürer; iki saat sonra hâlâ skor yoksa maç oynanmış
 * ama sonucu bekleniyordur. Bu maçı "Sıradaki maç" diye gösterip "Başlamak
 * üzere" yazmak (eski sürüm öyle yapıyordu) iki gün önceki bir maç için
 * yalan söylemekti.
 */
const OVERDUE_AFTER_MS = 2 * 3_600_000;

export interface SplitMatches {
  /** Canlı + saati gelmemiş — canlı olan en başta. */
  upcoming: ApiMatch[];
  /** Saati geçmiş, sonucu henüz girilmemiş maçlar (eskiden yeniye). */
  awaiting: ApiMatch[];
  /** Bitmiş maçlar, yeniden eskiye. */
  recent: ApiMatch[];
}

export function splitByState(matches: ApiMatch[], now = Date.now()): SplitMatches {
  const upcoming: ApiMatch[] = [];
  const awaiting: ApiMatch[] = [];
  const recent: ApiMatch[] = [];
  for (const match of matches) {
    const state = matchState(match);
    if (state === "finished") recent.push(match);
    else if (state === "live") upcoming.push(match);
    else if (now - matchTime(match) > OVERDUE_AFTER_MS) awaiting.push(match);
    else upcoming.push(match);
  }
  upcoming.sort((a, b) => {
    const liveA = matchState(a) === "live" ? 0 : 1;
    const liveB = matchState(b) === "live" ? 0 : 1;
    return liveA - liveB || matchTime(a) - matchTime(b);
  });
  awaiting.sort((a, b) => matchTime(a) - matchTime(b));
  recent.sort((a, b) => matchTime(b) - matchTime(a));
  return { upcoming, awaiting, recent };
}

export type Result = "W" | "D" | "L";

export interface Perspective {
  home: boolean;
  ours: number | null;
  theirs: number | null;
  opponentName: string;
  opponentId: number | null;
  result: Result | null;
}

/** Maçı bu takımın gözünden okur: rakip, skorlar, sonuç. */
export function perspective(match: ApiMatch, teamId: number, teamName: string): Perspective {
  const home = Number(match.home_team_id) === teamId || match.first_team_name === teamName;
  const ours = home ? match.first_team_score : match.second_team_score;
  const theirs = home ? match.second_team_score : match.first_team_score;
  return {
    home,
    ours: ours == null ? null : Number(ours),
    theirs: theirs == null ? null : Number(theirs),
    opponentName: String((home ? match.second_team_name : match.first_team_name) ?? ""),
    opponentId: (home ? match.away_team_id : match.home_team_id) ?? null,
    result:
      ours == null || theirs == null ? null : ours > theirs ? "W" : ours < theirs ? "L" : "D",
  };
}

/** Sonuç harfinin Türkçe tek harfi (FormChips ile aynı sözlük). */
export const RESULT_LETTER: Record<Result, string> = { W: "G", D: "B", L: "M" };
export const RESULT_LABEL: Record<Result, string> = {
  W: "Galibiyet",
  D: "Beraberlik",
  L: "Mağlubiyet",
};

const MONTHS_LONG = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/** "Ekim 2026" — maç listelerinin ay başlığı. Saat dilimine takılmasın diye
    tarih dizesinden okunur, `Date` ile çevrilmez. */
export function monthHeading(value?: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return "Tarihi belirsiz";
  return `${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Sezon yorumu ve rekorlar
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Takım performansını otomatik Türkçe metne çevirir (eski ekrandan KORUNAN
 * işlev).
 *
 * DÜZELTME: eski sürüm form dizisinde "G"/"M" harflerini arıyordu; oysa
 * `StandingRow.last5` İngilizce harf taşır ("WDLWW"). Sayaçlar hiç dolmuyordu,
 * form cümlesi hiç yazılmıyordu. Artık W/L üzerinden sayılıyor.
 */
export function buildAnalysis(row: StandingRow, teamName: string, position: number): string {
  const { played, wins, draws, losses, goals_for, goals_against, goal_diff, last5 } = row;
  if (!played) return `${teamName} bu sezon henüz maç oynamadı.`;

  const winRate = Math.round((wins / played) * 100);
  const form = last5 ? String(last5).slice(-5).split("") : [];
  const formWins = form.filter((letter) => letter === "W").length;
  const formLosses = form.filter((letter) => letter === "L").length;

  let text = `${teamName} bu sezon ${played} maç oynadı; ${wins} galibiyet, ${draws} beraberlik, ${losses} mağlubiyet aldı. `;
  text += `Ligde ${position}. sırada yer alıyor. `;

  if (goal_diff > 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek +${goal_diff} averajla avantajlı konumda. `;
  } else if (goal_diff < 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek ${goal_diff} averajla geride. `;
  } else {
    text += `${goals_for} gol atıp ${goals_against} gol yedi, averajı dengede. `;
  }

  if (winRate === 100) {
    text += "Kusursuz galibiyet oranıyla sezona damga vuruyor.";
  } else if (winRate >= 70) {
    text += `%${winRate} galibiyet oranıyla güçlü bir sezonu sürdürüyor.`;
  } else if (winRate >= 50) {
    text += `%${winRate} galibiyet oranıyla ligde rekabetçi konumunu koruyor.`;
  } else if (winRate >= 30) {
    text += `%${winRate} galibiyet oranıyla iyileşme arayan bir grafik çiziyor.`;
  } else {
    text += "Zorlu bir dönemden geçiyor; toparlanma adına kritik maçlar önünde.";
  }

  if (form.length >= 3) {
    if (formWins >= 3) text += ` Son maçlardaki ${formWins} galibiyet moralleri yüksek tutuyor.`;
    else if (formLosses >= 3) text += ` Ancak son ${formLosses} mağlubiyetle form kaybı yaşıyor.`;
  }

  return text.trim();
}

export interface SideRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface MatchHighlight {
  match: ApiMatch;
  ours: number;
  theirs: number;
  opponent: string;
  opponentId: number | null;
  home: boolean;
}

export interface TeamRecords {
  total: SideRecord;
  home: SideRecord;
  away: SideRecord;
  cleanSheets: number;
  blankGames: number;
  /** En uzun galibiyet serisi (ardışık bitmiş maç). */
  longestWinRun: number;
  /** Son maçlar (eskiden yeniye) — gol trendi çizgisi için. */
  trendFor: number[];
  trendAgainst: number[];
  bestWin: MatchHighlight | null;
  mostGoals: MatchHighlight | null;
  worstLoss: MatchHighlight | null;
}

export const emptySide = (): SideRecord => ({
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
});

/** Trend çizgisinin kaç maç geriye baktığı. */
export const TREND_SIZE = 10;

/**
 * Bitmiş maçlardan takım rekorlarını çıkarır. Uydurma yok, hepsi sayım.
 * `recent` yeniden eskiye sıralı gelir (bkz. `splitByState`).
 */
export function buildRecords(recent: ApiMatch[], teamId: number, teamName: string): TeamRecords {
  const total = emptySide();
  const home = emptySide();
  const away = emptySide();
  let cleanSheets = 0;
  let blankGames = 0;
  let bestWin: MatchHighlight | null = null;
  let mostGoals: MatchHighlight | null = null;
  let worstLoss: MatchHighlight | null = null;
  let longestWinRun = 0;
  let run = 0;
  const trendFor: number[] = [];
  const trendAgainst: number[] = [];

  // Seri ESKİDEN YENİYE sayılır; liste tersten dolaşılır.
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const match = recent[index];
    const view = perspective(match, teamId, teamName);
    if (view.ours == null || view.theirs == null) continue;

    const side = view.home ? home : away;
    for (const bucket of [total, side]) {
      bucket.played += 1;
      bucket.goalsFor += view.ours;
      bucket.goalsAgainst += view.theirs;
      if (view.result === "W") bucket.wins += 1;
      else if (view.result === "D") bucket.draws += 1;
      else bucket.losses += 1;
    }

    run = view.result === "W" ? run + 1 : 0;
    longestWinRun = Math.max(longestWinRun, run);

    if (view.theirs === 0) cleanSheets += 1;
    if (view.ours === 0) blankGames += 1;

    if (index < TREND_SIZE) {
      trendFor.push(view.ours);
      trendAgainst.push(view.theirs);
    }

    const highlight: MatchHighlight = {
      match,
      ours: view.ours,
      theirs: view.theirs,
      opponent: view.opponentName,
      opponentId: view.opponentId,
      home: view.home,
    };
    if (view.result === "W") {
      const margin = view.ours - view.theirs;
      if (!bestWin || margin > bestWin.ours - bestWin.theirs) bestWin = highlight;
    }
    if (!mostGoals || view.ours > mostGoals.ours) mostGoals = highlight;
    if (view.result === "L") {
      const margin = view.theirs - view.ours;
      if (!worstLoss || margin > worstLoss.theirs - worstLoss.ours) worstLoss = highlight;
    }
  }

  return {
    total,
    home,
    away,
    cleanSheets,
    blankGames,
    longestWinRun,
    trendFor,
    trendAgainst,
    bestWin,
    mostGoals,
    worstLoss,
  };
}

export interface CareerTotals {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface Discipline {
  yellow: number;
  red: number;
  players: number;
}
