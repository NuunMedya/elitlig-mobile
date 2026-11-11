/**
 * GRUPLAR, ETAPLAR, KUPALAR — puan durumundaki sekme mantığı (saf işlevler).
 *
 * Web istemcisindeki `components/groups/cups.js`, `qualification.js` ve
 * `HomeAltStandings` sekme kurgusunun birebir karşılığıdır; iki istemci aynı
 * sezonu aynı sekmelere böler.
 *
 *   · "grup"  → lig usulü, puan tablosu sekmesi.
 *   · "etap"  → eşleşmeler. Bir etabın kontenjanları başka bir etabın eşleşme
 *     GALİPLERİNDEN geliyorsa ikisi aynı KUPANIN ardışık turlarıdır (Son 16 →
 *     Çeyrek Final → …). Kaynağı sıralama, doğrudan takım ya da başka etabın
 *     MAĞLUPLARI olan etap yeni bir kupanın ilk turudur (Gümüş Kupa).
 *   · İstisna: yarı final mağluplarının tek eşleşmelik etabı ayrı kupa değil,
 *     o kupanın üçüncülük maçıdır.
 */

import type {
  GroupMatchup,
  GroupTeam,
  MatchupMatch,
  MatchupSide,
  QualificationZone,
  SeasonGroup,
  SeasonOverview,
} from "@/lib/api/seasonGroups";

const STAGE = "etap";

/** Etap adının sonundaki tur ifadesi (Son 16, Çeyrek Final, Final …). */
const STAGE_PATTERN =
  /\s*[-–·:]?\s*((SON|LAST)\s*\d+(\s*TURU)?|ÇEYREK\s*F[İI]NAL|YARI\s*F[İI]NAL|F[İI]NAL|\d+\.\s*(ELEME\s*)?TURU?|ELEME\s*TURU|PLAY[\s-]?OFF|ÜÇÜNCÜLÜK(\s*MAÇI)?)\s*$/iu;

const upper = (value: unknown) => String(value ?? "").toLocaleUpperCase("tr-TR");

/* Türkçe büyük harfe çevrilmiş adda aranır; parçalar özgün yazımla kesilir. */
function splitStage(name: unknown): { rest: string; stage: string } {
  const original = String(name ?? "").trim();
  const match = upper(original).match(STAGE_PATTERN);
  if (!match || match.index == null) return { rest: original, stage: "" };
  return {
    rest: original.slice(0, match.index).trim(),
    stage: original.slice(match.index).replace(/^[\s\-–·:]+/u, "").trim(),
  };
}

/** Adların kelime bazında ortak öneki ("ALTIN KUPA SON 16" + "ALTIN KUPA FİNAL" → "ALTIN KUPA"). */
export function commonWordPrefix(names: string[]): string {
  const split = names.map((name) => String(name ?? "").trim().split(/\s+/u).filter(Boolean));
  if (!split.length) return "";
  const prefix: string[] = [];
  for (let index = 0; index < split[0].length; index += 1) {
    const word = split[0][index];
    if (!split.every((words) => words[index] !== undefined && upper(words[index]) === upper(word))) break;
    prefix.push(word);
  }
  return prefix.join(" ");
}

/** Turun kısa adı: kupa adı (ortak önek) çıkarılmış hâli. */
export function stageLabel(name: string, cupName: string): string {
  const trimmed = String(name ?? "").trim();
  if (cupName && upper(trimmed).startsWith(upper(cupName))) {
    const rest = trimmed.slice(cupName.length).replace(/^[\s\-–·:]+/u, "").trim();
    if (rest) return rest;
  }
  return splitStage(trimmed).stage || trimmed;
}

export type CupTone = "gold" | "silver" | "bronze";

export function cupTone(name: string): CupTone {
  const value = upper(name);
  if (/GÜMÜŞ|GUMUS|SILVER/u.test(value)) return "silver";
  if (/BRONZ|BRONZE/u.test(value)) return "bronze";
  return "gold";
}

const priorityOf = (group: SeasonGroup) =>
  group.group_priority == null ? 999 : Number(group.group_priority);

const compareStages = (a: SeasonGroup, b: SeasonGroup) =>
  (Number(a.depth) || 0) - (Number(b.depth) || 0) ||
  priorityOf(a) - priorityOf(b) ||
  Number(a.id) - Number(b.id);

/** Kontenjanların hepsi tek bir etabın `type` kaynağından geliyorsa o etabın kimliği. */
function singleSource(group: SeasonGroup, type: string, stageIds: Set<number>): number {
  const slots = group.slots ?? [];
  if (!slots.length) return 0;
  const sources = new Set<number>();
  for (const slot of slots) {
    const id = Number(slot.source_group_id);
    if (slot.source_type !== type || !stageIds.has(id)) return 0;
    sources.add(id);
  }
  return sources.size === 1 ? [...sources][0] : 0;
}

/** Rövanş maçları: ilk maçın kontenjan ikilisiyle bulunur ("ev:deplasman"). */
function secondLegs(group: SeasonGroup): Record<string, GroupMatchup> {
  const map: Record<string, GroupMatchup> = {};
  (group.schedule ?? []).forEach((round) =>
    (round.meetings ?? []).forEach((meeting) => {
      if (Number(meeting.leg) === 2) map[`${meeting.away_slot_id}:${meeting.home_slot_id}`] = meeting;
    }),
  );
  return map;
}

export interface CupStage {
  group: SeasonGroup;
  label: string;
  /** Ağaç sırasında (bağlantı çizgileri kesişmez). */
  matchups: GroupMatchup[];
  legs2: Record<string, GroupMatchup>;
}

export interface Cup {
  key: string;
  rootId: number;
  name: string;
  tone: CupTone;
  stages: CupStage[];
  thirdPlace: CupStage | null;
  champion: GroupTeam | null;
  groupIds: number[];
}

/**
 * Eşleşmeleri ağaç sırasına dizer: son turdan geriye doğru, bir eşleşmenin
 * iki tarafını besleyen önceki tur eşleşmeleri alt alta gelir.
 */
function orderMatchups(stages: CupStage[]): CupStage[] {
  const ordered = stages.map((stage) => ({ ...stage, matchups: [...stage.matchups] }));
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const next = ordered[index + 1];
    const prevId = Number(ordered[index].group.id);
    const slotById = new Map((next.group.slots ?? []).map((slot) => [Number(slot.id), slot]));
    const byIndex = new Map(ordered[index].matchups.map((matchup) => [Number(matchup.index), matchup]));
    const result: GroupMatchup[] = [];
    next.matchups.forEach((matchup) => {
      [matchup.home_slot_id, matchup.away_slot_id].forEach((slotId) => {
        const slot = slotById.get(Number(slotId));
        if (slot && slot.source_type === "MATCH_WINNER" && Number(slot.source_group_id) === prevId) {
          const source = byIndex.get(Number(slot.source_matchup));
          if (source) {
            result.push(source);
            byIndex.delete(Number(slot.source_matchup));
          }
        }
      });
    });
    ordered[index].matchups = [...result, ...byIndex.values()];
  }
  return ordered;
}

function championOf(lastStage: CupStage | undefined): GroupTeam | null {
  if (!lastStage || lastStage.matchups.length !== 1) return null;
  const final = lastStage.matchups[0];
  const winner = Number(final.winner_team_id) || 0;
  if (!winner) return null;
  return (
    [final.home?.team, final.away?.team].find((team) => team && Number(team.team_id) === winner) ?? null
  );
}

const buildStage = (group: SeasonGroup, cupName: string): CupStage => ({
  group,
  label: stageLabel(group.group_name, cupName),
  matchups: Array.isArray(group.matchups) ? group.matchups : [],
  legs2: secondLegs(group),
});

/** Kupaya girmeyen tek etap (eşleşme listesi sekmesi) için tur nesnesi. */
export function looseStage(group: SeasonGroup): CupStage {
  const stage = buildStage(group, "");
  return { ...stage, label: group.group_name };
}

/** Sezonun kupaları. */
export function buildCups(groups: SeasonGroup[]): Cup[] {
  const stages = (Array.isArray(groups) ? groups : []).filter(
    (group) => group.group_kind === STAGE && group.show_in_bracket !== false,
  );
  if (!stages.length) return [];

  const byId = new Map(stages.map((group) => [Number(group.id), group]));
  const stageIds = new Set(byId.keys());
  const parentOf = new Map(
    stages.map((group) => [Number(group.id), singleSource(group, "MATCH_WINNER", stageIds)]),
  );

  const rootOf = (id: number) => {
    const seen = new Set<number>();
    let current = id;
    while (parentOf.get(current) && !seen.has(current)) {
      seen.add(current);
      current = parentOf.get(current) as number;
    }
    return current;
  };

  const byRoot = new Map<number, SeasonGroup[]>();
  stages.forEach((group) => {
    const root = rootOf(Number(group.id));
    byRoot.set(root, [...(byRoot.get(root) ?? []), group]);
  });

  /* Üçüncülük maçı: tek eşleşme, iki tarafı da AYNI kupanın yarı finali
     (son turdan bir önceki, 2 eşleşmeli tur) mağlupları. */
  const thirdPlaceOf = new Map<number, SeasonGroup>();
  [...byRoot.entries()].forEach(([root, list]) => {
    if (list.length !== 1) return;
    const group = list[0];
    const source = singleSource(group, "MATCH_LOSER", stageIds);
    if (!source || (group.matchups ?? []).length !== 1) return;
    const sourceRoot = rootOf(source);
    const sourceList = byRoot.get(sourceRoot) ?? [];
    if (sourceRoot === root || !sourceList.length) return;
    const semi = sourceList.slice().sort(compareStages);
    const semiIndex = semi.findIndex((item) => Number(item.id) === source);
    const isSemi = semiIndex === semi.length - 2 && (byId.get(source)?.matchups ?? []).length === 2;
    if (isSemi && !thirdPlaceOf.has(sourceRoot)) {
      thirdPlaceOf.set(sourceRoot, group);
      byRoot.delete(root);
    }
  });

  const cups: Cup[] = [];
  byRoot.forEach((list, root) => {
    const sorted = list.slice().sort(compareStages);
    const names = sorted.map((group) => group.group_name);
    let name = names.length > 1 ? commonWordPrefix(names) : "";
    if (!name) name = splitStage(names[0]).rest;
    const built = orderMatchups(sorted.map((group) => buildStage(group, name)));
    const third = thirdPlaceOf.get(root);
    cups.push({
      key: `kupa-${root}`,
      rootId: root,
      name,
      tone: cupTone(name),
      stages: built,
      thirdPlace: third ? buildStage(third, name) : null,
      champion: championOf(built[built.length - 1]),
      groupIds: [...sorted.map((group) => Number(group.id)), ...(third ? [Number(third.id)] : [])],
    });
  });

  cups.sort(
    (a, b) => priorityOf(a.stages[0].group) - priorityOf(b.stages[0].group) || a.rootId - b.rootId,
  );

  /* Adsız kupalar (yalnız tur adları): tek kupaysa "Eleme Turları", birden
     fazlaysa ilk turun adıyla anılır. */
  cups.forEach((cup) => {
    if (cup.name) return;
    cup.name = cups.length === 1 ? "Eleme Turları" : `${cup.stages[0].label} Kupası`;
    cup.tone = cupTone(cup.name);
  });
  return cups;
}

/** Henüz belli olmayan tarafın kısa açıklaması ("Ç. Final 2. galibi"). */
export function pendingLabel(side: MatchupSide | null | undefined, cup?: Cup | null): string {
  const label = String(side?.label ?? "");
  const match = label.match(/^(.*)\s+(\d+)\.\s*eşleşme\s+(galibi|mağlubu)$/iu);
  if (match) {
    let stageName = match[1].trim();
    const stage = [...(cup?.stages ?? []), ...(cup?.thirdPlace ? [cup.thirdPlace] : [])].find(
      (item) => upper(item.group.group_name) === upper(stageName),
    );
    if (stage) stageName = stage.label;
    stageName = stageName.replace(/ÇEYREK\s*F[İI]NAL/iu, "Ç. Final").replace(/YARI\s*F[İI]NAL/iu, "Y. Final");
    return `${stageName} ${match[2]}. ${match[3].toLocaleLowerCase("tr-TR")}`;
  }
  return label || "Belirlenecek";
}

/* ══════════════════════════ EŞLEŞME ÖZETİ ══════════════════════════ */

const LIVE = "canli";
const PUBLISHED = "yayinlanmis";
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatWhen(match: MatchupMatch): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(match.date ?? ""));
  if (!parts) return "";
  const date = `${Number(parts[3])} ${MONTHS[Number(parts[2]) - 1] ?? ""}`.trim();
  const time = match.time ? String(match.time).slice(0, 5) : "";
  return time ? `${date} · ${time}` : date;
}

interface Leg {
  id: number;
  live: boolean;
  played: boolean;
  home: number;
  away: number;
  when: string;
  venue: string;
}

/** Eşleşmenin bir ayağı; skor eşleşmenin ev sahibine göre çevrilir. */
function legInfo(match: MatchupMatch | null | undefined, homeTeamId: number): Leg | null {
  if (!match || !match.id) return null;
  const live = String(match.status ?? "") === LIVE;
  const hasScore = match.home_score != null && match.away_score != null;
  const played = String(match.status ?? "") === PUBLISHED && hasScore;
  let home = Number(match.home_score) || 0;
  let away = Number(match.away_score) || 0;
  if (homeTeamId && match.home_team_id && Number(match.home_team_id) !== homeTeamId) {
    [home, away] = [away, home];
  }
  return { id: Number(match.id), live, played, home, away, when: formatWhen(match), venue: match.venue ?? "" };
}

export interface TieSide {
  team: GroupTeam | null;
  /** Takım adı ya da bekleyen kaynağın kısa adı. */
  name: string;
  score: number | null;
  won: boolean;
  out: boolean;
  /** Penaltılarla / kurayla tur atladı. */
  manual: boolean;
}

export interface Tie {
  key: string;
  index: number;
  home: TieSide;
  away: TieSide;
  live: boolean;
  decided: boolean;
  /** Berabere bitti, galip henüz girilmedi. */
  awaitingWinner: boolean;
  /** Durum satırı: "8 Kas · 21:30", "MS", "Rövanş: …", "Maç programı bekleniyor". */
  meta: string;
  venue: string;
  /** Dokununca açılacak maç (yoksa satır pasif). */
  matchId: number | null;
}

/** Bir eşleşmeyi çizime hazır özetine çevirir (iki ayaklı turlar dahil). */
export function describeTie(matchup: GroupMatchup, stage: CupStage, cup?: Cup | null): Tie {
  const homeTeamId = Number(matchup.home?.team?.team_id) || 0;
  const double = Boolean(stage.group.double_round);
  const leg1 = legInfo(matchup.match, homeTeamId);
  const rematch = double ? stage.legs2[`${matchup.home_slot_id}:${matchup.away_slot_id}`] : null;
  const leg2 = rematch ? legInfo(rematch.match, homeTeamId) : null;
  const winner = Number(matchup.winner_team_id) || 0;
  const live = Boolean(leg1?.live || leg2?.live);
  const anyScore = Boolean(leg1?.played || leg1?.live || leg2?.played || leg2?.live);
  const linkId = leg2 && (leg2.live || leg1?.played) ? leg2.id : leg1?.id || 0;

  const scoreOf = (side: "home" | "away"): number | null => {
    if (double && matchup.aggregate && matchup.aggregate[side] != null) return Number(matchup.aggregate[side]);
    let total: number | null = null;
    [leg1, leg2].forEach((leg) => {
      if (leg && (leg.played || leg.live)) total = (total ?? 0) + leg[side];
    });
    return total;
  };

  let meta: string;
  if (live) meta = "Canlı";
  else if (leg1 && !leg1.played) meta = leg1.when || "Tarih belli değil";
  else if (leg2 && !leg2.played) meta = `Rövanş: ${leg2.when || "tarih belli değil"}`;
  else if (leg1) meta = double && leg2 ? `MS · ${leg1.home}-${leg1.away}, ${leg2.home}-${leg2.away}` : "MS";
  else meta = "Maç programı bekleniyor";

  const side = (key: "home" | "away"): TieSide => {
    const team = matchup[key]?.team ?? null;
    const teamId = Number(team?.team_id) || 0;
    const won = Boolean(winner && teamId === winner);
    return {
      team,
      name: team ? team.team_name : pendingLabel(matchup[key], cup),
      score: anyScore ? scoreOf(key) : null,
      won,
      out: Boolean(winner && teamId && teamId !== winner),
      manual: won && matchup.decided_by === "manual",
    };
  };

  return {
    key: matchup.key ?? `${stage.group.id}:${matchup.index}`,
    index: Number(matchup.index) || 0,
    home: side("home"),
    away: side("away"),
    live,
    decided: Boolean(winner),
    awaitingWinner: Boolean(matchup.drawn && !winner),
    meta,
    venue: leg1 && !leg1.played && !live ? leg1.venue : "",
    matchId: linkId || null,
  };
}

/** Ağaç çizilebilir mi: her tur bir öncekinin yarısı kadar eşleşme taşımalı. */
export function isHalvingBracket(cup: Cup): boolean {
  if (cup.stages.length < 2) return false;
  return cup.stages.every((stage, index) => {
    if (stage.matchups.length === 0) return false;
    if (index === 0) return true;
    return cup.stages[index - 1].matchups.length === stage.matchups.length * 2;
  });
}

/* ═══════════════════════════════ SEKMELER ═══════════════════════════════ */

export type StandingsTab =
  | { key: string; kind: "overall"; label: string }
  | { key: string; kind: "group"; label: string; group: SeasonGroup }
  | { key: string; kind: "stage"; label: string; group: SeasonGroup }
  | { key: string; kind: "cup"; label: string; cup: Cup };

export const OVERALL_TAB = "genel";

/**
 * Puan durumunun sekmeleri. Tek sekme (yalnız "Genel") dönerse sekme şeridi
 * hiç çizilmez — grupsuz sezon bugünkü gibi tek tablodur.
 */
export function buildStandingsTabs(overview: SeasonOverview | null | undefined): {
  tabs: StandingsTab[];
  cups: Cup[];
  showOverall: boolean;
} {
  const groups = overview?.groups ?? [];
  const showOverall = overview?.settings ? overview.settings.show_overall_standings !== false : true;
  const cups = buildCups(groups);
  const inCup = new Set(cups.flatMap((cup) => cup.groupIds));

  const defaultGroup = groups.find((group) => group.is_default) ?? null;
  const display = groups.filter((group) => !group.is_default);
  const tables = display.filter((group) => group.group_kind !== STAGE);
  const looseStages = display.filter(
    (group) => group.group_kind === STAGE && !inCup.has(Number(group.id)),
  );
  const hasOther = tables.length + looseStages.length + cups.length > 0;

  const tabs: StandingsTab[] = [];
  if (showOverall || !hasOther) tabs.push({ key: OVERALL_TAB, kind: "overall", label: "Genel" });
  if (!showOverall && defaultGroup && hasOther) {
    tabs.push({ key: `g-${defaultGroup.id}`, kind: "group", label: defaultGroup.group_name, group: defaultGroup });
  }
  tables.forEach((group) =>
    tabs.push({ key: `g-${group.id}`, kind: "group", label: group.group_name, group }),
  );
  cups.forEach((cup) => tabs.push({ key: cup.key, kind: "cup", label: cup.name, cup }));
  looseStages.forEach((group) =>
    tabs.push({ key: `g-${group.id}`, kind: "stage", label: group.group_name, group }),
  );
  return { tabs, cups, showOverall };
}

/* ═════════════════════════ ELEME BÖLGELERİ ═════════════════════════ */

/** Web'deki dört ton; mobilde tablo bölgelerinin ray renklerine eşlenir. */
export const QUALIFICATION_TONES = 4;

function rangeLabel(ranks: number[]): string {
  const sorted = [...ranks].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const value = sorted[index];
    if (value === prev + 1) {
      prev = value;
      continue;
    }
    parts.push(start === prev ? `${start}.` : `${start}–${prev}.`);
    start = value;
    prev = value;
  }
  return `${parts.join(", ")} sıra`;
}

export interface QualificationLegend {
  /** 0 … QUALIFICATION_TONES-1 */
  tone: number;
  label: string;
}

/** Sıra → ton ve tablonun altındaki açıklamalar ("1–8. sıra → Altın Kupa Son 16"). */
export function buildQualification(zones: QualificationZone[] | null | undefined): {
  byRank: Map<number, number>;
  legend: QualificationLegend[];
} {
  const byTarget = new Map<string, number[]>();
  (zones ?? []).forEach((zone) => {
    const rank = Number(zone?.rank);
    const names = (zone?.targets ?? []).map((target) => target.group_name).filter(Boolean);
    if (!rank || !names.length) return;
    const key = names.join(" / ");
    byTarget.set(key, [...(byTarget.get(key) ?? []), rank]);
  });

  const byRank = new Map<number, number>();
  const legend: QualificationLegend[] = [];
  [...byTarget.entries()].forEach(([name, ranks], index) => {
    const tone = index % QUALIFICATION_TONES;
    legend.push({ tone, label: `${rangeLabel(ranks)} → ${name}` });
    ranks.forEach((rank) => byRank.set(rank, tone));
  });
  return { byRank, legend };
}
