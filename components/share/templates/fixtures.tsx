/**
 * FİKSTÜR ŞABLONLARI — bir günün (ya da haftanın) maç listesi.
 *
 *   Program · Kartlar
 *
 * Oynanmış maçta skor, oynanmamışta saat yazılır. Sığmayan maçlar
 * "+n maç daha" ile özetlenir; liste kırpılmaz, sayısı söylenir.
 */

import React from "react";
import { View } from "react-native";

import { clock, upper } from "@/lib/share/format";
import { Poster, Spacer } from "../canvas/Layout";
import { CText, Crest, FillBox, FitName, Glass, Overline, SigBar } from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";
import type { ShareTeamRef } from "./match";

export interface FixtureItem {
  id: number;
  home: ShareTeamRef;
  away: ShareTeamRef;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  time: string;
  venue: string | null;
}

export interface FixturesShareData {
  /** "12 Kasım Perşembe" */
  title: string;
  /** "Maç programı" / "Sonuçlar" */
  kicker: string;
  matches: FixtureItem[];
  league: string | null;
  season: string | null;
  city: string | null;
  footer: string | null;
}

function Heading({ f, d }: { f: ShareFrame; d: FixturesShareData }) {
  const { u, t, story } = f;
  return (
    <View style={{ marginTop: u(story ? 8 : 0) }}>
      <Overline f={f}>{d.kicker}</Overline>
      <FitName f={f} k="title" text={d.title} room={16} lines={1} align="left" scale={story ? 1.05 : 0.8} style={{ marginTop: u(2) }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: u(8), marginTop: u(story ? 8 : 5) }}>
        <SigBar f={f} width={36} height={3} />
        <CText f={f} k="body" color={t.inkMuted}>
          {d.matches.length} maç{d.season ? ` · ${d.season}` : ""}
        </CText>
      </View>
    </View>
  );
}

function Middle({ f, m, scale = 1 }: { f: ShareFrame; m: FixtureItem; scale?: number }) {
  const { u, t } = f;
  if (m.finished) {
    return (
      <FillBox f={f} radius={10} style={{ paddingHorizontal: u(8 * scale), paddingVertical: u(4 * scale), minWidth: u(54 * scale), alignItems: "center" }}>
        <CText f={f} k="numStrong" scale={1.1 * scale} color={t.onFill}>
          {m.homeScore ?? "-"} – {m.awayScore ?? "-"}
        </CText>
      </FillBox>
    );
  }
  return (
    <Glass f={f} radius={10} strong style={{ paddingHorizontal: u(8 * scale), paddingVertical: u(4 * scale), minWidth: u(54 * scale), alignItems: "center" }}>
      <CText f={f} k="numStrong" scale={1.1 * scale} color={t.accent}>
        {clock(m.time) || "—"}
      </CText>
    </Glass>
  );
}

function ProgramRow({ f, m, h }: { f: ShareFrame; m: FixtureItem; h: number }) {
  const { u, t, story } = f;
  const crest = story ? 26 : 20;
  return (
    <View style={{ height: u(h), justifyContent: "center", paddingHorizontal: u(10) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: u(8) }}>
        <FitName f={f} k="row" text={m.home.name} room={13} lines={2} align="right" scale={story ? 1 : 0.9} min={0.7} style={{ flex: 1 }} />
        <Crest f={f} logo={m.home.logo} name={m.home.name} size={crest} />
        <Middle f={f} m={m} scale={story ? 1 : 0.85} />
        <Crest f={f} logo={m.away.logo} name={m.away.name} size={crest} />
        <FitName f={f} k="row" text={m.away.name} room={13} lines={2} align="left" scale={story ? 1 : 0.9} min={0.7} style={{ flex: 1 }} />
      </View>
      {story && m.venue ? (
        <CText f={f} k="body" scale={0.82} color={t.inkMuted} align="center" style={{ marginTop: u(4) }}>
          {upper(m.venue)}
        </CText>
      ) : null}
    </View>
  );
}

function FixturesProgram({ f, d }: { f: ShareFrame; d: FixturesShareData }) {
  const { u, t, story } = f;
  const cap = story ? 8 : 5;
  const shown = d.matches.slice(0, cap);
  const rest = d.matches.length - shown.length;
  const h = story ? (shown.length > 6 ? 50 : 58) : 46;
  return (
    <Poster f={f} mood="top" title={d.league} meta={d.city} footer={d.footer}>
      <Heading f={f} d={d} />
      <Spacer f={f} grow={0.4} min={story ? 14 : 8} />
      <Glass f={f} radius={20} style={{ paddingVertical: u(4) }}>
        {shown.map((m, index) => (
          <View key={m.id} style={{ borderTopWidth: index ? Math.max(1, u(0.6)) : 0, borderTopColor: t.line }}>
            <ProgramRow f={f} m={m} h={h} />
          </View>
        ))}
      </Glass>
      {rest > 0 ? (
        <CText f={f} k="body" color={t.inkMuted} align="center" style={{ marginTop: u(8) }}>
          +{rest} maç daha · elitlig.com
        </CText>
      ) : null}
      <Spacer f={f} />
    </Poster>
  );
}

function FixtureCard({ f, m }: { f: ShareFrame; m: FixtureItem }) {
  const { u, t, story } = f;
  const line = (team: ShareTeamRef, score: number | null, win: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: u(6) }}>
      <Crest f={f} logo={team.logo} name={team.name} size={story ? 20 : 16} />
      <FitName f={f} k="row" text={team.name} room={12} lines={1} align="left" scale={story ? 0.95 : 0.85} min={0.62} color={win || !m.finished ? t.ink : t.inkSoft} style={{ flex: 1 }} />
      {m.finished ? (
        <CText f={f} k="numStrong" scale={story ? 1.2 : 1} color={win ? t.accent : t.ink}>
          {score ?? "-"}
        </CText>
      ) : null}
    </View>
  );
  const h = m.homeScore ?? 0;
  const a = m.awayScore ?? 0;
  return (
    <Glass f={f} radius={16} style={{ width: "48.5%", padding: u(story ? 10 : 7), gap: u(story ? 7 : 4) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Overline f={f} color={m.finished ? t.inkMuted : t.accent} scale={0.9}>
          {m.finished ? "Maç sonu" : clock(m.time) || "Saat yok"}
        </Overline>
      </View>
      {line(m.home, m.homeScore, m.finished && h > a)}
      {line(m.away, m.awayScore, m.finished && a > h)}
    </Glass>
  );
}

function FixturesCards({ f, d }: { f: ShareFrame; d: FixturesShareData }) {
  const { u, t, story } = f;
  const cap = story ? 10 : 6;
  const shown = d.matches.slice(0, cap);
  const rest = d.matches.length - shown.length;
  return (
    <Poster f={f} mood="low" title={d.league} meta={d.city} footer={d.footer}>
      <Heading f={f} d={d} />
      <Spacer f={f} grow={0.4} min={story ? 14 : 8} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: u(story ? 8 : 6) }}>
        {shown.map((m) => (
          <FixtureCard key={m.id} f={f} m={m} />
        ))}
      </View>
      {rest > 0 ? (
        <CText f={f} k="body" color={t.inkMuted} align="center" style={{ marginTop: u(8) }}>
          +{rest} maç daha · elitlig.com
        </CText>
      ) : null}
      <Spacer f={f} />
    </Poster>
  );
}

export function fixturesTemplates(d: FixturesShareData): ShareTemplateDef[] {
  return [
    { key: "program", label: "Program", render: (f) => <FixturesProgram f={f} d={d} /> },
    { key: "kartlar", label: "Kartlar", render: (f) => <FixturesCards f={f} d={d} /> },
  ];
}
