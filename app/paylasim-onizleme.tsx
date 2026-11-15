/* GEÇİCİ ÖNİZLEME ROTASI — ekran görüntüsü için; iş bitince silinir. */
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { View } from "react-native";

import { ShareStudio } from "@/components/share/ShareStudio";
import { makeFrame, type ShareTemplateDef } from "@/components/share/canvas/types";
import { compareTemplates, type CompareShareData } from "@/components/share/templates/compare";
import { fixturesTemplates } from "@/components/share/templates/fixtures";
import { matchTemplates, type MatchShareData } from "@/components/share/templates/match";
import { playersTemplates } from "@/components/share/templates/players";
import { playerTemplates, teamTemplates } from "@/components/share/templates/profiles";
import { tableTemplates } from "@/components/share/templates/table";
import { weeklyTemplates } from "@/components/share/templates/weekly";
import { shareTheme, type ShareThemeKey } from "@/lib/share/palette";

const I = (n: string) => `http://127.0.0.1:8098/img/${n}`;
const T = {
  saint: { name: "Saint Diriliş", logo: I("saint.png") },
  haymana: { name: "Haymana Gençlik", logo: I("haymana.png") },
  ankara: { name: "Ankara Gençlerbirliği SK", logo: I("ankara.png") },
  kuzey: { name: "Kuzey Yıldızları", logo: I("kuzey.png") },
  baskent: { name: "Başkent FK", logo: I("baskent.png") },
  cankaya: { name: "Çankaya Futbol", logo: I("cankaya.png") },
  yildiz: { name: "Yıldız Spor", logo: I("yildiz.png") },
  etimesgut: { name: "Etimesgut Gücü", logo: I("etimesgut.png") },
  golbasi: { name: "Gölbaşı United", logo: I("golbasi.png") },
  pursaklar: { name: "Pursaklar Akademi", logo: null },
};
const common = { league: "FREELİG Süper Lig", season: "2026 Sonbahar", city: "Ankara", footer: "@elitligankara" };
const future = new Date(Date.now() + 3 * 86400000);
const futureDay = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

const baseMatch: MatchShareData = {
  id: 1,
  home: T.saint,
  away: T.haymana,
  homeScore: 4,
  awayScore: 2,
  finished: true,
  date: "2026-11-14",
  time: "21:30:00",
  venue: "Çayyolu Arena Halı Saha",
  ...common,
  scorers: {
    home: [
      { name: "Burak Gönen", minute: 12 },
      { name: "Burak Gönen", minute: 31 },
      { name: "Burak Gönen", minute: 44 },
      { name: "Emre Aydın", minute: 52 },
    ],
    away: [
      { name: "Kerem Yıldırım", minute: 18 },
      { name: "Mert Kaya", minute: 49, ownGoal: false },
    ],
  },
  mvp: { name: "Burak Gönen", image: I("p1.jpg"), goals: 3, assists: 1, rating: 9.2, team: T.saint },
  players: [{ name: "Burak Gönen", image: I("p1.jpg"), goals: 3, assists: 1, rating: 9.2, team: T.saint }],
  stats: [
    { label: "Goller", home: 4, away: 2 },
    { label: "Asistler", home: 3, away: 1 },
    { label: "Kurtarışlar", home: 6, away: 9 },
    { label: "Şutlar", home: 14, away: 8 },
    { label: "Sarı Kart", home: 1, away: 3 },
    { label: "Kırmızı Kart", home: 0, away: 1 },
  ],
};

const pcompare: CompareShareData = {
  kind: "player",
  a: { name: "Burak Gönen", image: I("p1.jpg"), crest: T.saint.logo, sub: T.saint.name, role: "Forvet", form: "GGBGM" },
  b: { name: "Kerem Yıldırım", image: I("p3.jpg"), crest: T.haymana.logo, sub: T.haymana.name, role: "Orta saha", form: "GMGGB" },
  caption: "Kariyer",
  metrics: [
    { key: "m", label: "Maç", a: 42, b: 51 },
    { key: "g", label: "Gol", a: 61, b: 38 },
    { key: "gpm", label: "Maç başı gol", a: 1.5, b: 0.7 },
    { key: "pts", label: "Ort. puan", a: 7.8, b: 7.1 },
    { key: "w", label: "Galibiyet", a: 27, b: 30 },
    { key: "wr", label: "Galibiyet oranı", a: 64, b: 59, unit: "%" },
    { key: "y", label: "Sarı kart", a: 4, b: 2, lowerIsBetter: true },
  ],
  ...common,
};

const tcompare: CompareShareData = {
  kind: "team",
  a: { name: T.saint.name, image: null, crest: T.saint.logo, sub: "1. sıra · 28 puan", form: "GGBGG" },
  b: { name: T.haymana.name, image: null, crest: T.haymana.logo, sub: "3. sıra · 21 puan", form: "GMGBM" },
  caption: "Karşılaşmalar ve puan tablosu",
  metrics: [
    { key: "w", label: "Galibiyet", a: 4, b: 2 },
    { key: "g", label: "Atılan gol", a: 23, b: 17 },
    { key: "gpm", label: "Maç başı gol", a: 3.3, b: 2.4 },
    { key: "rank", label: "Sıra", a: 1, b: 3, lowerIsBetter: true },
    { key: "pts", label: "Puan", a: 28, b: 21 },
    { key: "av", label: "Averaj", a: 19, b: 6 },
    { key: "form", label: "Form puanı", a: 13, b: 7 },
  ],
  h2h: {
    played: 7,
    aWins: 4,
    draws: 1,
    bWins: 2,
    aGoals: 23,
    bGoals: 17,
    recent: [
      { id: 1, date: "2026-11-14", homeName: T.saint.name, awayName: T.haymana.name, homeScore: 4, awayScore: 2, result: "G" },
      { id: 2, date: "2026-06-02", homeName: T.haymana.name, awayName: T.saint.name, homeScore: 3, awayScore: 3, result: "B" },
      { id: 3, date: "2026-03-21", homeName: T.saint.name, awayName: T.haymana.name, homeScore: 2, awayScore: 5, result: "M" },
      { id: 4, date: "2025-11-08", homeName: T.haymana.name, awayName: T.saint.name, homeScore: 1, awayScore: 4, result: "G" },
      { id: 5, date: "2025-06-19", homeName: T.saint.name, awayName: T.haymana.name, homeScore: 6, awayScore: 1, result: "G" },
    ],
  },
  ...common,
};

const teamsArr = [T.saint, T.kuzey, T.haymana, T.baskent, T.ankara, T.cankaya, T.yildiz, T.etimesgut, T.golbasi, T.pursaklar];
const rows = teamsArr.map((tm, i) => ({
  team_id: i + 1,
  team_name: tm.name,
  logo: tm.logo,
  played: 10,
  wins: 9 - i,
  draws: i % 3,
  losses: i,
  goals_for: 48 - i * 3,
  goals_against: 20 + i * 2,
  goal_diff: 28 - i * 5,
  display_points: 28 - i * 3,
  last5: ["GGBGG", "GGGMB", "GMGBM", "BGMGG", "MGGBM", "GBMMG", "MMGBG", "BMMGM", "MMBMG", "MMMBM"][i],
}));

const ranked = [
  ["Burak Gönen", "p1.jpg", T.saint, 24],
  ["Kerem Yıldırım", "p3.jpg", T.haymana, 19],
  ["Emre Aydın", "p2.jpg", T.saint, 17],
  ["Mert Kaya", "p5.jpg", T.kuzey, 15],
  ["Onur Demir", "p4.jpg", T.baskent, 14],
  ["Can Öztürk", "p6.jpg", T.ankara, 12],
  ["Serkan Polat", null, T.cankaya, 11],
  ["Ali Rıza Şahin", null, T.yildiz, 10],
  ["Yusuf Koç", null, T.etimesgut, 9],
  ["Hakan Arslan", null, T.golbasi, 8],
] as const;

function setOf(s: string): ShareTemplateDef[] {
  switch (s) {
    case "matchday":
      return matchTemplates({ ...baseMatch, finished: false, homeScore: null, awayScore: null, date: futureDay });
    case "result":
      return matchTemplates(baseMatch);
    case "pcompare":
      return compareTemplates(pcompare);
    case "tcompare":
      return compareTemplates(tcompare);
    case "team":
      return [
        ...teamTemplates({ name: T.saint.name, logo: T.saint.logo, ...common, rank: 1, teams: 10, points: 28, played: 10, wins: 9, draws: 1, losses: 0, goalsFor: 48, goalsAgainst: 20, last5: "GGBGG" }),
        ...tableTemplates({ rows, from: 1, to: 10, focusTeamId: 1, ...common }),
      ];
    case "player":
      return playerTemplates({ name: "Burak Gönen", image: I("p1.jpg"), position: "Forvet", jersey: 9, teamName: T.saint.name, teamLogo: T.saint.logo, matches: 42, goals: 61, assists: 18, average: 7.8, wins: 27, draws: 6, losses: 9, ...common });
    case "table":
      return tableTemplates({ rows, from: 1, to: 10, focusTeamId: 3, ...common });
    case "players":
      return playersTemplates({
        rows: ranked.map(([name, img, tm, v], i) => ({ rank: i + 1, id: i + 1, name, image: img ? I(img) : null, teamName: tm.name, teamLogo: tm.logo, value: String(v), amount: v, sub: null })),
        metricLabel: "Gol krallığı",
        unit: "gol",
        focusId: 3,
        ...common,
      });
    case "fixtures":
      return fixturesTemplates({
        title: "16 Kasım Pazartesi",
        kicker: "Maç programı",
        matches: [
          [T.saint, T.haymana, "19:00"],
          [T.kuzey, T.baskent, "20:00"],
          [T.ankara, T.cankaya, "20:30"],
          [T.yildiz, T.etimesgut, "21:30"],
          [T.golbasi, T.pursaklar, "22:30"],
        ].map(([h, a, time], i) => ({ id: i + 1, home: h as typeof T.saint, away: a as typeof T.saint, homeScore: null, awayScore: null, finished: false, time: time as string, venue: i % 2 ? "Çayyolu Arena" : "Ümitköy Spor Tesisi" })),
        ...common,
      });
    case "results":
      return fixturesTemplates({
        title: "14 Kasım Cumartesi",
        kicker: "Sonuçlar",
        matches: [
          [T.saint, T.haymana, 4, 2],
          [T.kuzey, T.baskent, 3, 3],
          [T.ankara, T.cankaya, 1, 5],
          [T.yildiz, T.etimesgut, 7, 6],
        ].map(([h, a, hs, as], i) => ({ id: i + 1, home: h as typeof T.saint, away: a as typeof T.saint, homeScore: hs as number, awayScore: as as number, finished: true, time: "21:00", venue: "Çayyolu Arena" })),
        ...common,
      });
    case "weekly": {
      const P = (id: number, award: string, label: string, name: string, img: string | null, line: "GK" | "DEF" | "MID" | "FWD" | null, tm = T.saint) => ({ id, award, label, name, image: img ? I(img) : null, isTeam: false, teamName: tm.name, teamLogo: tm.logo, line, goals: line === "FWD" ? 3 : 1, assists: 1, rating: 8.4 });
      const squad = [
        P(11, "WEEKLY_SQUAD_PLAYER", "", "Onur Demir", "p4.jpg", "GK", T.baskent),
        P(12, "WEEKLY_SQUAD_PLAYER", "", "Mert Kaya", "p5.jpg", "DEF", T.kuzey),
        P(13, "WEEKLY_SQUAD_PLAYER", "", "Can Öztürk", "p6.jpg", "DEF", T.ankara),
        P(14, "WEEKLY_SQUAD_PLAYER", "", "Emre Aydın", "p2.jpg", "MID"),
        P(15, "WEEKLY_SQUAD_PLAYER", "", "Kerem Yıldırım", "p3.jpg", "MID", T.haymana),
        P(16, "WEEKLY_SQUAD_PLAYER", "", "Burak Gönen", "p1.jpg", "FWD"),
      ];
      const honors = [
        P(1, "WEEKLY_PLAYER", "Haftanın oyuncusu", "Burak Gönen", "p1.jpg", "FWD"),
        P(2, "WEEKLY_GOALKEEPER", "Haftanın kalecisi", "Onur Demir", "p4.jpg", "GK", T.baskent),
        P(3, "WEEKLY_DEFENDER", "Haftanın defansı", "Mert Kaya", "p5.jpg", "DEF", T.kuzey),
        P(4, "WEEKLY_MIDFIELDER", "Haftanın orta sahası", "Kerem Yıldırım", "p3.jpg", "MID", T.haymana),
        P(5, "WEEKLY_FORWARD", "Haftanın forveti", "Emre Aydın", "p2.jpg", "FWD"),
        { ...P(6, "WEEKLY_TEAM", "Haftanın takımı", T.saint.name, null, null), isTeam: true },
      ];
      return weeklyTemplates({ week: "11. hafta", formation: "1-2-2-1", star: honors[0], honors, squad, ...common });
    }
    default:
      return [];
  }
}

export default function PaylasimOnizleme() {
  const p = useLocalSearchParams<{ s?: string; k?: string; th?: string; fmt?: string; studio?: string }>();
  const list = useMemo(() => setOf(String(p.s ?? "result")), [p.s]);
  const theme = shareTheme((p.th as ShareThemeKey) ?? "gece");
  const fmt = p.fmt === "post" ? "post" : "story";
  if (p.studio) {
    return (
      <ShareStudio visible onClose={() => {}} title="Maç sonucu" subtitle="Saint Diriliş – Haymana Gençlik" templates={list} fileParts={["onizleme"]} initialTheme={(p.th as ShareThemeKey) ?? "gece"} />
    );
  }
  const item = list.find((x) => x.key === p.k) ?? list[0];
  const frame = makeFrame(fmt, 360, theme);
  return (
    <View style={{ width: 360, height: frame.H, overflow: "hidden" }} testID="canvas" nativeID="canvas">
      {item ? item.render(frame) : null}
    </View>
  );
}
