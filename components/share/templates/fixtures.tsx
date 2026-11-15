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
import { CText, Crest, FitName, Glass, Kicker, Overline } from "../canvas/Primitives";
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
    <View style={{ marginTop: u(story ? 6 : 0) }}>
      <Kicker f={f}>{d.kicker}</Kicker>
      <FitName f={f} k="title" text={d.title} width={316} lines={1} align="left" scale={story ? 1.08 : 0.82} min={0.6} style={{ marginTop: u(6) }} />
      <CText f={f} k="body" color={t.inkMuted} style={{ marginTop: u(4) }}>
        {d.matches.length} maç{d.season ? ` · ${d.season}` : ""}
      </CText>
    </View>
  );
}

/**
 * Yayın akışı satırı — solda saat (oynanmamış) ya da "MS" (bitmiş) ve saha;
 * sağda iki takım alt alta (arma + ad), bitmişse her takımın skoru satırın
 * sonunda. Kazanan tam mürekkep, kaybeden sönük.
 */
function ProgramRow({ f, m, h }: { f: ShareFrame; m: FixtureItem; h: number }) {
  const { u, t, story } = f;
  const crest = story ? 22 : 17;
  const hs = m.homeScore ?? 0;
  const as = m.awayScore ?? 0;
  const line = (team: ShareTeamRef, score: number | null, lost: boolean, win: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: u(8) }}>
      <Crest f={f} logo={team.logo} name={team.name} size={crest} />
      <FitName
        f={f}
        k="row"
        text={team.name}
        width={story ? 170 : 180}
        lines={1}
        caps
        align="left"
        scale={story ? 1.02 : 0.9}
        min={0.6}
        color={lost ? t.inkSoft : t.ink}
        style={{ flex: 1 }}
      />
      {m.finished ? (
        <CText f={f} k="numStrong" scale={story ? 1.35 : 1.1} color={win ? t.accent : lost ? t.inkMuted : t.ink} align="right" style={{ minWidth: u(20) }}>
          {score ?? "-"}
        </CText>
      ) : null}
    </View>
  );
  return (
    <View style={{ height: u(h), flexDirection: "row", alignItems: "center", paddingHorizontal: u(12), gap: u(12) }}>
      <View style={{ width: u(story ? 58 : 50), alignItems: "flex-start" }}>
        {m.finished ? (
          <CText f={f} k="numStrong" scale={story ? 1.3 : 1.1} color={t.inkMuted}>MS</CText>
        ) : (
          <CText f={f} k="numStrong" scale={story ? 1.5 : 1.25} color={t.accent}>
            {clock(m.time) || "—"}
          </CText>
        )}
        {m.venue ? (
          <FitName f={f} k="micro" text={upper(m.venue)} width={story ? 58 : 50} lines={2} align="left" color={t.inkMuted} min={0.8} style={{ marginTop: u(3) }} />
        ) : null}
      </View>
      <View style={{ width: Math.max(1, u(0.7)), alignSelf: "stretch", marginVertical: u(h * 0.18), backgroundColor: t.line }} />
      <View style={{ flex: 1, gap: u(story ? 7 : 5) }}>
        {line(m.home, m.homeScore, m.finished && hs < as, m.finished && hs > as)}
        {line(m.away, m.awayScore, m.finished && as < hs, m.finished && as > hs)}
      </View>
    </View>
  );
}

function FixturesProgram({ f, d }: { f: ShareFrame; d: FixturesShareData }) {
  const { u, t, story } = f;
  // Taşma satırı ("+n maç daha") da yer kaplar: sığmayan varsa bir maç az.
  const fit = story ? 7 : 4;
  const cap = d.matches.length > fit ? fit - 1 : fit;
  const shown = d.matches.slice(0, cap);
  const rest = d.matches.length - shown.length;
  const h = story ? (shown.length > 5 ? 56 : 64) : 52;
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

function FixtureCard({ f, m, wide }: { f: ShareFrame; m: FixtureItem; wide?: boolean }) {
  const { u, t, story } = f;
  const line = (team: ShareTeamRef, score: number | null, win: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: u(6) }}>
      <Crest f={f} logo={team.logo} name={team.name} size={story ? (wide ? 28 : 20) : 16} />
      <FitName f={f} k="row" text={team.name} room={wide ? 24 : 12} lines={1} caps align="left" scale={story ? (wide ? 1.15 : 0.95) : 0.85} min={0.62} color={win || !m.finished ? t.ink : t.inkSoft} style={{ flex: 1 }} />
      {m.finished ? (
        <CText f={f} k="numStrong" scale={story ? (wide ? 1.6 : 1.2) : 1} color={win ? t.accent : t.ink}>
          {score ?? "-"}
        </CText>
      ) : null}
    </View>
  );
  const h = m.homeScore ?? 0;
  const a = m.awayScore ?? 0;
  return (
    <Glass f={f} radius={16} style={{ width: wide ? "100%" : "48.5%", padding: u(story ? (wide ? 14 : 10) : 7), gap: u(story ? (wide ? 10 : 7) : 4) }}>
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
  const cap = d.matches.length > (story ? 8 : 6) ? (story ? 7 : 5) : story ? 8 : 6;
  const shown = d.matches.slice(0, cap);
  const rest = d.matches.length - shown.length;
  return (
    <Poster f={f} mood="low" title={d.league} meta={d.city} footer={d.footer}>
      <Heading f={f} d={d} />
      <Spacer f={f} grow={0.4} min={story ? 14 : 8} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: u(story ? 8 : 6) }}>
        {shown.map((m) => (
          <FixtureCard key={m.id} f={f} m={m} wide={story && shown.length <= 4} />
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
