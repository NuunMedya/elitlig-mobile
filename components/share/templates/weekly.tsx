/**
 * HAFTANIN ENLERİ ŞABLONLARI.
 *
 *   Haftanın oyuncusu · Haftanın kadrosu (saha) · Ödüller
 */

import React from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Rect, Stop } from "react-native-svg";

import { shortName, splitName, upper } from "@/lib/share/format";
import { alpha } from "@/lib/share/palette";
import { Poster, Spacer } from "../canvas/Layout";
import { CText, Crest, FillBox, FitName, Glass, Glyph, Halo, Overline, Portrait, SigBar, StatTile, useSvgId } from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";

export interface WeeklyPerson {
  id: number;
  award: string;
  /** Ödül adı ("Haftanın kalecisi"). */
  label: string;
  name: string;
  image: string | null;
  isTeam: boolean;
  teamName: string | null;
  teamLogo: string | null;
  /** Sahadaki hat: GK / DEF / MID / FWD. */
  line: "GK" | "DEF" | "MID" | "FWD" | null;
  goals: number;
  assists: number;
  rating: number | null;
}

export interface WeeklyShareData {
  week: string;
  formation: string | null;
  star: WeeklyPerson | null;
  honors: WeeklyPerson[];
  squad: WeeklyPerson[];
  league: string | null;
  season: string | null;
  city: string | null;
  footer: string | null;
}

const statText = (p: WeeklyPerson) =>
  [p.goals ? `${p.goals} gol` : null, p.assists ? `${p.assists} asist` : null, p.rating ? `${p.rating.toFixed(1)} puan` : null]
    .filter(Boolean)
    .join(" · ");

function WeekHead({ f, d, title }: { f: ShareFrame; d: WeeklyShareData; title: string }) {
  const { u, story } = f;
  return (
    <View style={{ marginTop: u(story ? 8 : 0) }}>
      <Overline f={f}>{d.week}</Overline>
      <CText f={f} k="title" scale={story ? 1.05 : 0.8} style={{ marginTop: u(2) }}>{title}</CText>
      <SigBar f={f} width={36} height={3} style={{ marginTop: u(story ? 8 : 5) }} />
    </View>
  );
}

/* ═════════ Haftanın oyuncusu ═════════ */

function WeeklyStar({ f, d }: { f: ShareFrame; d: WeeklyShareData }) {
  const { u, t, story } = f;
  const p = d.star;
  if (!p) return null;
  const { first, last } = splitName(p.name);
  return (
    <Poster f={f} mood="center" title={d.league} meta={[d.city, d.season].filter(Boolean).join(" · ")} footer={d.footer}>
      <View style={{ alignItems: "center", marginTop: u(story ? 10 : 0) }}>
        <FillBox f={f} radius={14} tone="gold" style={{ paddingHorizontal: u(12), paddingVertical: u(5) }}>
          <Overline f={f} color={t.medalInk} scale={1.05}>Haftanın oyuncusu</Overline>
        </FillBox>
        <CText f={f} k="body" color={t.inkMuted} style={{ marginTop: u(6) }}>{d.week}</CText>
      </View>
      <Spacer f={f} grow={0.6} min={10} />
      <View style={{ flexDirection: story ? "column" : "row", alignItems: "center", gap: u(story ? 0 : 16) }}>
        <View style={{ alignItems: "center" }}>
          <Halo f={f} size={story ? 300 : 190} color={t.gold[1]} power={0.6} />
          {p.isTeam ? (
            <Crest f={f} logo={p.teamLogo} name={p.name} size={story ? 170 : 110} />
          ) : (
            <Portrait f={f} image={p.image} name={p.name} size={story ? 184 : 116} ring="gold" halo />
          )}
        </View>
        <View style={{ alignItems: story ? "center" : "flex-start", flex: story ? undefined : 1, marginTop: u(story ? 16 : 0) }}>
          {first ? <FitName f={f} k="hero" text={first} room={16} lines={1} caps scale={story ? 0.72 : 0.6} color={t.inkSoft} align={story ? "center" : "left"} /> : null}
          <FitName f={f} k="poster" text={last} room={story ? 9 : 7} lines={1} caps scale={story ? 0.8 : 0.56} min={0.45} align={story ? "center" : "left"} />
          {p.teamName && !p.isTeam ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: u(6), marginTop: u(6) }}>
              <Crest f={f} logo={p.teamLogo} name={p.teamName} size={18} />
              <FitName f={f} k="row" text={p.teamName} room={24} lines={1} align="left" color={t.inkSoft} />
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: u(8), marginTop: u(story ? 22 : 12) }}>
        <StatTile f={f} value={p.goals} label="Gol" scale={story ? 1 : 0.78} />
        <StatTile f={f} value={p.assists} label="Asist" scale={story ? 1 : 0.78} />
        <StatTile f={f} value={p.rating ? p.rating.toFixed(1) : "–"} label="Reyting" accent={t.gold[0]} scale={story ? 1 : 0.78} />
      </View>
      <Spacer f={f} />
    </Poster>
  );
}

/* ═════════ Haftanın kadrosu ═════════ */

function Pitch({ f, w, h }: { f: ShareFrame; w: number; h: number }) {
  const id = useSvgId("pt");
  const { t, u } = f;
  const line = alpha(t.dark ? t.ink : t.crestInk, t.dark ? 0.22 : 0.16);
  const sw = Math.max(1, u(1));
  const box = w * 0.5;
  const stripes = 8;
  return (
    <Svg width={w} height={h} style={{ position: "absolute" }}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.sigA} stopOpacity={t.dark ? 0.26 : 0.14} />
          <Stop offset="1" stopColor={t.sigB} stopOpacity={t.dark ? 0.16 : 0.1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={u(22)} fill={`url(#${id})`} />
      {Array.from({ length: stripes }, (_, i) =>
        i % 2 ? <Rect key={i} x={0} y={(h / stripes) * i} width={w} height={h / stripes} fill={t.ink} opacity={0.025} /> : null,
      )}
      <Rect x={sw} y={sw} width={w - sw * 2} height={h - sw * 2} rx={u(22)} stroke={line} strokeWidth={sw} fill="none" />
      <Line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={line} strokeWidth={sw} />
      <Circle cx={w / 2} cy={h / 2} r={w * 0.13} stroke={line} strokeWidth={sw} fill="none" />
      <Rect x={(w - box) / 2} y={h - h * 0.14} width={box} height={h * 0.14} stroke={line} strokeWidth={sw} fill="none" />
      <Rect x={(w - box) / 2} y={0} width={box} height={h * 0.14} stroke={line} strokeWidth={sw} fill="none" />
    </Svg>
  );
}

function PitchPlayer({ f, p, size }: { f: ShareFrame; p: WeeklyPerson; size: number }) {
  const { u, t } = f;
  return (
    <View style={{ alignItems: "center", width: u(size + 26) }}>
      <View>
        <Portrait f={f} image={p.image} name={p.name} size={size} ring="sig" />
        {p.rating ? (
          <FillBox f={f} radius={6} tone="gold" style={{ position: "absolute", right: -u(6), top: -u(2), paddingHorizontal: u(3), paddingVertical: u(1) }}>
            <CText f={f} k="numStrong" scale={0.62} color={t.medalInk}>{p.rating.toFixed(1)}</CText>
          </FillBox>
        ) : null}
      </View>
      <FitName f={f} k="row" text={upper(shortName(p.name))} room={10} lines={1} scale={0.82} min={0.6} style={{ marginTop: u(3) }} />
    </View>
  );
}

function WeeklySquad({ f, d }: { f: ShareFrame; d: WeeklyShareData }) {
  const { u, story, W } = f;
  const lines: ("FWD" | "MID" | "DEF" | "GK")[] = ["FWD", "MID", "DEF", "GK"];
  const byLine = lines.map((key) => d.squad.filter((p) => (p.line ?? "MID") === key)).filter((row) => row.length);
  const pw = W - u(44);
  const ph = u(story ? 420 : 272);
  const size = story ? 44 : 30;
  return (
    <Poster f={f} mood="top" title={d.league} meta={d.city} footer={d.footer} watermark={false}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <WeekHead f={f} d={d} title="Haftanın kadrosu" />
        {d.formation ? (
          <Glass f={f} radius={14} strong style={{ paddingHorizontal: u(10), paddingVertical: u(5), marginBottom: u(4) }}>
            <CText f={f} k="numStrong" scale={0.95}>{d.formation}</CText>
          </Glass>
        ) : null}
      </View>
      <Spacer f={f} grow={0.4} min={story ? 12 : 8} />
      <View style={{ width: pw, height: ph, justifyContent: "space-around", paddingVertical: u(story ? 14 : 8) }}>
        <Pitch f={f} w={pw} h={ph} />
        {byLine.map((row, index) => (
          <View key={index} style={{ flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start" }}>
            {row.map((p) => (
              <PitchPlayer key={p.id} f={f} p={p} size={size} />
            ))}
          </View>
        ))}
      </View>
      <Spacer f={f} />
    </Poster>
  );
}

/* ═════════ Ödüller ═════════ */

const AWARD_GLYPH: Record<string, React.ComponentProps<typeof Glyph>["name"]> = {
  WEEKLY_PLAYER: "star",
  WEEKLY_GOALKEEPER: "hand-left",
  WEEKLY_DEFENDER: "shield",
  WEEKLY_MIDFIELDER: "git-network",
  WEEKLY_FORWARD: "flash",
  WEEKLY_FAIR_PLAY: "heart",
  WEEKLY_TEAM: "trophy",
};

function WeeklyAwards({ f, d }: { f: ShareFrame; d: WeeklyShareData }) {
  const { u, t, story } = f;
  const list = d.honors.slice(0, story ? 7 : 5);
  const h = story ? 58 : 44;
  return (
    <Poster f={f} mood="low" title={d.league} meta={d.city} footer={d.footer}>
      <WeekHead f={f} d={d} title="Haftanın enleri" />
      <Spacer f={f} grow={0.4} min={story ? 12 : 8} />
      <Glass f={f} radius={20} style={{ paddingVertical: u(4) }}>
        {list.map((p, index) => (
          <View
            key={p.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              height: u(h),
              paddingHorizontal: u(12),
              gap: u(10),
              borderTopWidth: index ? Math.max(1, u(0.6)) : 0,
              borderTopColor: t.line,
            }}
          >
            <FillBox f={f} radius={10} tone={p.award === "WEEKLY_PLAYER" ? "gold" : "sig"} style={{ width: u(story ? 26 : 22), height: u(story ? 26 : 22), alignItems: "center", justifyContent: "center" }}>
              <Glyph f={f} name={AWARD_GLYPH[p.award] ?? "ribbon"} size={story ? 13 : 11} color={p.award === "WEEKLY_PLAYER" ? t.medalInk : t.onFill} />
            </FillBox>
            {p.isTeam ? (
              <Crest f={f} logo={p.teamLogo} name={p.name} size={story ? 36 : 28} />
            ) : (
              <Portrait f={f} image={p.image} name={p.name} size={story ? 38 : 30} ring="none" />
            )}
            <View style={{ flex: 1 }}>
              <Overline f={f} scale={0.85}>{p.label}</Overline>
              <FitName f={f} k="row" text={p.name} room={20} lines={1} align="left" scale={story ? 1.1 : 0.95} min={0.65} style={{ marginTop: u(2) }} />
              {story ? (
                <CText f={f} k="body" scale={0.82} color={t.inkMuted}>
                  {[p.isTeam ? null : p.teamName, statText(p)].filter(Boolean).join(" · ") || " "}
                </CText>
              ) : null}
            </View>
          </View>
        ))}
      </Glass>
      <Spacer f={f} />
    </Poster>
  );
}

export function weeklyTemplates(d: WeeklyShareData): ShareTemplateDef[] {
  const list: ShareTemplateDef[] = [];
  if (d.star) list.push({ key: "oyuncu", label: "Haftanın oyuncusu", render: (f) => <WeeklyStar f={f} d={d} /> });
  if (d.squad.length) list.push({ key: "kadro", label: "Kadro", render: (f) => <WeeklySquad f={f} d={d} /> });
  if (d.honors.length) list.push({ key: "oduller", label: "Ödüller", render: (f) => <WeeklyAwards f={f} d={d} /> });
  return list;
}
