/**
 * FANTEZİ ELİTLİG — ekrandan bağımsız saf yardımcılar (services/fantasy.js
 * kurallarının istemci aynası). Sunucu son sözü söyler; buradaki denetim
 * yalnız kaydetmeden ÖNCE açıklayıcı ipucu göstermek içindir.
 *
 *   Kadro   5 oyuncu · 1 kaleci + 4 saha oyuncusu · aynı saha hattından en
 *           çok 2 · aynı takımdan en çok 2 · bütçe (yeni sunucu 45 kredi).
 *   Kaptan  ×2. Yardımcı kaptan: kaptan haftada oynamazsa ×2.
 *   Fiyat   son form + aktiflik + sezon gücü; hafta içinde sabit.
 */

import type { FantasyLine, FantasyPlayer, FantasyRules } from "@/lib/api/community";
import { colors } from "@/theme";

export const LINES: FantasyLine[] = ["GK", "DEF", "MID", "FWD"];

export const LINE_META: Record<FantasyLine, { short: string; label: string }> = {
  GK: { short: "KL", label: "Kaleci" },
  DEF: { short: "DEF", label: "Defans" },
  MID: { short: "OS", label: "Orta saha" },
  FWD: { short: "FOR", label: "Hücum" },
  ANY: { short: "–", label: "Mevkisiz" },
};

export const asLine = (value: string | null | undefined): FantasyLine =>
  value === "GK" || value === "DEF" || value === "MID" || value === "FWD" ? value : "ANY";

/** Mevki rengi (tema paletinden; iki temada da okunur). */
export function lineColor(line: FantasyLine): string {
  switch (line) {
    case "GK":
      return colors.posKeeper;
    case "DEF":
      return colors.posDefense;
    case "MID":
      return colors.posMidfield;
    case "FWD":
      return colors.posForward;
    default:
      return colors.posUnknown;
  }
}

/** 8.5 → "8,5" · 9 → "9,0" (kredi her zaman bir ondalıkla). */
export const formatCredit = (value: number): string => value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatNumber = (value: number | null | undefined, digits = 1): string =>
  value == null ? "–" : value.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: digits });

export const weekNo = (key: string | null | undefined): string => String(key ?? "").split("-W")[1] ?? "";

/** Varsayılan kurallar (eski sunucu alan göndermezse). */
export function normalizeRules(rules: Partial<FantasyRules> | undefined, pool?: { budget?: number; size?: number; maxPerTeam?: number }) {
  return {
    budget: rules?.budget ?? pool?.budget ?? 45,
    size: rules?.size ?? pool?.size ?? 5,
    maxPerTeam: rules?.maxPerTeam ?? pool?.maxPerTeam ?? 2,
    maxPerLine: rules?.maxPerLine ?? null,
    requireGoalkeeper: rules?.requireGoalkeeper ?? false,
    captainMultiplier: rules?.captainMultiplier ?? 2,
    viceCaptain: rules?.viceCaptain ?? false,
  };
}
export type NormalRules = ReturnType<typeof normalizeRules>;

export type HintTone = "ok" | "warn" | "danger";
export interface LineupHint {
  key: string;
  tone: HintTone;
  text: string;
}

const lineCount = (players: FantasyPlayer[], line: FantasyLine) => players.filter((p) => asLine(p.line) === line).length;

/**
 * Kadro ipuçları: kaydetmeyi engelleyen sorunlar "danger", eksikler "warn",
 * tamamlanan kurallar "ok". `blocking` true ise kaydet düğmesi kapalı tutulur.
 */
export function lineupHints(selected: FantasyPlayer[], rules: NormalRules, captainId: number | null, viceId: number | null, savedUnchanged = false) {
  const hints: LineupHint[] = [];
  const cost = selected.reduce((sum, p) => sum + p.price, 0);
  const missing = rules.size - selected.length;
  hints.push(
    missing > 0
      ? { key: "size", tone: "warn", text: `${missing} oyuncu daha seç (${selected.length}/${rules.size}).` }
      : { key: "size", tone: "ok", text: `${rules.size} oyuncu tamam.` },
  );
  const gk = lineCount(selected, "GK");
  if (gk > 1) hints.push({ key: "gk", tone: "danger", text: "Kadroda yalnız bir kaleci olabilir." });
  else if (rules.requireGoalkeeper) {
    hints.push(gk === 1 ? { key: "gk", tone: "ok", text: "Kaleci seçildi." } : { key: "gk", tone: "warn", text: "Bir kaleci seç: 1 kaleci + 4 saha oyuncusu." });
  }
  if (rules.maxPerLine) {
    for (const line of ["DEF", "MID", "FWD"] as FantasyLine[]) {
      const n = lineCount(selected, line);
      if (n > rules.maxPerLine) hints.push({ key: `line-${line}`, tone: "danger", text: `${LINE_META[line].label} hattında ${n} oyuncu var; en çok ${rules.maxPerLine}.` });
    }
  }
  const perTeam = new Map<number, { n: number; name: string }>();
  selected.forEach((p) => perTeam.set(p.teamId, { n: (perTeam.get(p.teamId)?.n ?? 0) + 1, name: p.teamName ?? "Takım" }));
  for (const [teamId, item] of perTeam) {
    if (item.n > rules.maxPerTeam) hints.push({ key: `team-${teamId}`, tone: "danger", text: `${item.name}: en çok ${rules.maxPerTeam} oyuncu.` });
  }
  if (cost > rules.budget) {
    // Kayıtlı (değişmemiş) kadro eski fiyatlarla kurulmuş olabilir: geçerlidir, yalnız uyarılır.
    hints.push(
      savedUnchanged
        ? { key: "budget", tone: "warn", text: `Kayıtlı kadron bugünkü fiyatlarla ${formatCredit(cost - rules.budget)} kredi fazla; geçerli, ama değiştirirsen bütçeye uymalı.` }
        : { key: "budget", tone: "danger", text: `Bütçe ${formatCredit(cost - rules.budget)} kredi aşıldı.` },
    );
  }
  if (selected.length && captainId == null) hints.push({ key: "captain", tone: "warn", text: "Bir kaptan seç (puanı ×2)." });
  if (rules.viceCaptain && selected.length >= 2 && captainId != null && viceId == null) {
    hints.push({ key: "vice", tone: "warn", text: "Yardımcı kaptan seç: kaptan oynamazsa onun puanı ×2." });
  }
  const blocking = hints.some((h) => h.tone === "danger") || missing !== 0 || captainId == null || (rules.requireGoalkeeper && gk !== 1);
  return { hints, cost, blocking };
}

/**
 * Bir oyuncu kadroya eklenebilir mi? Eklenemiyorsa kısa Türkçe gerekçe.
 * Kilit, bütçe, takım sınırı, kaleci ve hat sınırı sırasıyla denetlenir.
 */
export function pickBlocker(player: FantasyPlayer, selected: FantasyPlayer[], rules: NormalRules, budgetLeft: number, lockedTeams: Set<number>): string | null {
  if (lockedTeams.has(player.teamId)) return "Maçı başladı";
  if (selected.length >= rules.size) return "Kadro dolu";
  if (player.price > budgetLeft + 1e-9) return "Bütçe yetmiyor";
  if (selected.filter((p) => p.teamId === player.teamId).length >= rules.maxPerTeam) return `Takımdan ${rules.maxPerTeam} oyuncu var`;
  const line = asLine(player.line);
  if (line === "GK" && lineCount(selected, "GK") >= 1) return "Kaleci seçili";
  if (rules.maxPerLine && line !== "GK" && line !== "ANY" && lineCount(selected, line) >= rules.maxPerLine) return `${LINE_META[line].label} hattı dolu`;
  // Kaleci şartı varsa son boş yer kaleciye kalır.
  if (rules.requireGoalkeeper && line !== "GK" && lineCount(selected, "GK") === 0 && selected.length === rules.size - 1) return "Son yer kaleci için";
  return null;
}

export type SortKey = "price" | "form" | "points" | "cheap";
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Fiyat" },
  { key: "form", label: "Form" },
  { key: "points", label: "Puan" },
  { key: "cheap", label: "En ucuz" },
];

const fold = (value: string) => value.toLocaleLowerCase("tr-TR").trim();

export function filterPlayers(players: FantasyPlayer[], opts: { term: string; line: FantasyLine | "ALL"; sort: SortKey; exclude: number[] }) {
  const needle = fold(opts.term);
  const list = players.filter(
    (p) =>
      !opts.exclude.includes(p.id) &&
      (opts.line === "ALL" || asLine(p.line) === opts.line) &&
      (!needle || fold(`${p.name} ${p.teamName ?? ""}`).includes(needle)),
  );
  const byName = (a: FantasyPlayer, b: FantasyPlayer) => a.name.localeCompare(b.name, "tr");
  const sorters: Record<SortKey, (a: FantasyPlayer, b: FantasyPlayer) => number> = {
    price: (a, b) => b.price - a.price || (b.form ?? -99) - (a.form ?? -99) || byName(a, b),
    form: (a, b) => (b.form ?? -99) - (a.form ?? -99) || b.price - a.price || byName(a, b),
    points: (a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.ppm ?? 0) - (a.ppm ?? 0) || byName(a, b),
    cheap: (a, b) => a.price - b.price || (b.form ?? -99) - (a.form ?? -99) || byName(a, b),
  };
  return list.sort(sorters[opts.sort]);
}

/** Puan → çubuk tonu: yüksek yeşil, orta vurgu, düşük nötr, eksi kırmızı. */
export function pointsTone(points: number | null | undefined): string {
  if (points == null) return colors.border;
  if (points < 0) return colors.danger;
  if (points >= 10) return colors.win;
  if (points >= 5) return colors.accent;
  return colors.textTertiary;
}

/** "Nasıl oynanır" metinleri (sunucu kurallarıyla aynı). */
export const HOW_TO_PLAY: { icon: string; title: string; body: string }[] = [
  { icon: "people", title: "5 kişilik kadro", body: "1 kaleci + 4 saha oyuncusu. Aynı hattan (defans, orta saha, hücum) en çok 2, aynı takımdan en çok 2 oyuncu." },
  { icon: "wallet", title: "45 kredi bütçe", body: "Fiyat 4,0–13,0 kredi. Formdaki yıldızların hepsi bir kadroya sığmaz: dengeli kur, ucuz ama düzenli oynayan oyuncuları keşfet." },
  { icon: "trending-up", title: "Fiyat = son form", body: "Son 5 maçın puanı (yeni maçlar daha ağır), takımının maçlarında oynama oranı ve sezon gücü. Oynamayan oyuncu ucuzlar ve \"aktif değil\" işaretlenir. Fiyat hafta başında belirlenir, hafta içinde değişmez." },
  { icon: "star", title: "Kaptan ×2, yardımcı yedek", body: "Kaptanının puanı ikiye katlanır. Kaptan haftada hiç oynamazsa yardımcı kaptanın puanı ×2 olur." },
  { icon: "lock-closed", title: "Oyuncu başına kilit", body: "Takımının maçı başlayan oyuncu kadroya eklenemez, çıkarılamaz; kaptanlığı değişmez. Diğerlerini hafta boyunca değiştirebilirsin." },
  { icon: "football", title: "Puanlar", body: "Oynadı 2 · gol 6 (KL/DEF) 5 (OS) 4 (FOR) · asist 3 · maçın oyuncusu 3 · reyting 7,5+ 2 · her 3 kurtarış 1 · gol yemedi KL 4 / DEF 3 · her 4 yenen gol KL/DEF −1 · sarı −1 · kırmızı −3. Yalnız yayınlanmış maçlar sayılır." },
  { icon: "podium", title: "Sıralama", body: "Haftalık ve sezon. Eşitlikte haftada kadrosunu daha erken kaydeden, sezonda en iyi haftası yüksek olan öne geçer." },
];
