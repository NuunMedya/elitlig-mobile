/**
 * PROFİL ŞABLONLARI — takım sezon kartı ve oyuncu kartı.
 *
 *   Takım:   Sezon kartı · Sıra rozeti   (+ puan tablosu şablonları, odak = takım)
 *   Oyuncu:  Oyuncu kartı · Poster
 */

import React from "react";
import { View } from "react-native";

import { formLetters, splitName } from "@/lib/share/format";
import { Poster, Spacer } from "../canvas/Layout";
import { CText, Crest, FillBox, FitName, FormRow, Glass, Halo, Overline, Portrait, SigBar, StatTile } from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";

/* ══════════════════════════ TAKIM ══════════════════════════ */

export interface TeamShareData {
  name: string;
  logo: string | null;
  league: string | null;
  season: string | null;
  city: string | null;
  footer: string | null;
  rank: number | null;
  teams: number;
  points: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  last5: string;
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Galibiyet / beraberlik / mağlubiyet oranı tek şerit. */
function RecordBar({ f, w, d, l }: { f: ShareFrame; w: number; d: number; l: number }) {
  const { u, t } = f;
  const total = Math.max(1, w + d + l);
  const seg = (value: number, color: string) =>
    value > 0 ? <View style={{ flex: value / total, backgroundColor: color, borderRadius: u(3) }} /> : null;
  return (
    <View style={{ flexDirection: "row", height: u(7), gap: u(3), borderRadius: u(4), overflow: "hidden", backgroundColor: t.glass }}>
      {seg(w, t.win)}
      {seg(d, t.draw)}
      {seg(l, t.loss)}
    </View>
  );
}

function TeamSeason({ f, d }: { f: ShareFrame; d: TeamShareData }) {
  const { u, t, story } = f;
  const gd = d.goalsFor - d.goalsAgainst;
  return (
    <Poster f={f} mood="top" title={d.league} meta={[d.city, d.season].filter(Boolean).join(" · ")} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.5 : 0.1} />
      <View style={{ flexDirection: story ? "column" : "row", alignItems: "center", gap: u(story ? 14 : 14) }}>
        <Crest f={f} logo={d.logo} name={d.name} size={story ? 128 : 78} halo />
        <View style={{ alignItems: story ? "center" : "flex-start", flex: story ? undefined : 1 }}>
          <Overline f={f}>Sezon kartı</Overline>
          <FitName f={f} k="hero" text={d.name} room={14} lines={2} caps scale={story ? 1.15 : 0.85} align={story ? "center" : "left"} style={{ marginTop: u(4) }} />
        </View>
      </View>

      <Spacer f={f} grow={0.4} min={story ? 16 : 8} />

      <FillBox f={f} radius={22} tone="soft" style={{ flexDirection: "row", alignItems: "center", padding: u(story ? 16 : 10), borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          <CText f={f} k="score" scale={story ? 0.9 : 0.62}>
            {d.rank ?? "–"}
            <CText f={f} k="score" scale={story ? 0.42 : 0.3} color={t.accent}>.</CText>
          </CText>
          <Overline f={f} color={t.inkMuted}>{d.teams ? `${d.teams} takım içinde` : "Sıra"}</Overline>
        </View>
        <View style={{ width: Math.max(1, u(0.7)), alignSelf: "stretch", backgroundColor: t.line }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <CText f={f} k="score" scale={story ? 0.9 : 0.62} color={t.accent}>{d.points ?? "–"}</CText>
          <Overline f={f} color={t.inkMuted}>Puan</Overline>
        </View>
      </FillBox>

      <View style={{ flexDirection: "row", gap: u(8), marginTop: u(story ? 10 : 6) }}>
        <StatTile f={f} value={d.played} label="Maç" scale={story ? 0.9 : 0.66} />
        <StatTile f={f} value={d.wins} label="Galibiyet" accent={t.win} scale={story ? 0.9 : 0.66} />
        <StatTile f={f} value={d.draws} label="Beraberlik" accent={t.draw} scale={story ? 0.9 : 0.66} />
        <StatTile f={f} value={d.losses} label="Mağlubiyet" accent={t.loss} scale={story ? 0.9 : 0.66} />
      </View>

      {story ? (
        <Glass f={f} radius={20} style={{ marginTop: u(10), padding: u(14), gap: u(12) }}>
          <RecordBar f={f} w={d.wins} d={d.draws} l={d.losses} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Overline f={f} color={t.inkMuted}>Gol</Overline>
              <CText f={f} k="numStrong" scale={1.25} style={{ marginTop: u(3) }}>
                {d.goalsFor} : {d.goalsAgainst}
                <CText f={f} k="numStrong" scale={1} color={gd >= 0 ? t.win : t.loss}>{`  ${signed(gd)}`}</CText>
              </CText>
            </View>
            {formLetters(d.last5).length ? (
              <View style={{ alignItems: "flex-end", gap: u(5) }}>
                <Overline f={f} color={t.inkMuted}>Son maçlar</Overline>
                <FormRow f={f} last5={d.last5} size={15} />
              </View>
            ) : null}
          </View>
        </Glass>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: u(8) }}>
          <CText f={f} k="body" color={t.inkSoft}>
            Gol {d.goalsFor}:{d.goalsAgainst} ({signed(gd)})
          </CText>
          <FormRow f={f} last5={d.last5} size={12} />
        </View>
      )}
      <Spacer f={f} />
    </Poster>
  );
}

/** Sıra rozeti — dev sıra rakamı, armanın arkasında. */
function TeamRank({ f, d }: { f: ShareFrame; d: TeamShareData }) {
  const { u, t, story, W } = f;
  return (
    <Poster f={f} mood="center" title={d.league} meta={[d.city, d.season].filter(Boolean).join(" · ")} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.6 : 0.2} />
      <View style={{ alignItems: "center", justifyContent: "center", height: u(story ? 280 : 180) }}>
        <CText
          f={f}
          k="mega"
          scale={story ? 2.4 : 1.55}
          color={t.dark ? t.glassStrong : t.line}
          align="center"
          style={{ position: "absolute", width: W, textAlign: "center" }}
        >
          {d.rank ?? "–"}
        </CText>
        <Halo f={f} size={story ? 320 : 220} />
        <Crest f={f} logo={d.logo} name={d.name} size={story ? 132 : 92} />
      </View>
      <View style={{ alignItems: "center", marginTop: u(story ? 6 : 2) }}>
        <FillBox f={f} radius={16} style={{ paddingHorizontal: u(14), paddingVertical: u(5) }}>
          <Overline f={f} color={t.onFill} scale={1.1}>
            {d.rank ? `${d.rank}. sırada` : "Sezon"}
          </Overline>
        </FillBox>
        <FitName f={f} k="hero" text={d.name} room={15} lines={2} caps scale={story ? 1.1 : 0.85} style={{ marginTop: u(10) }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: u(14), marginTop: u(story ? 14 : 8) }}>
          <MiniFact f={f} value={d.points ?? "–"} label="Puan" accent />
          <MiniFact f={f} value={`${d.wins}-${d.draws}-${d.losses}`} label="G-B-M" />
          <MiniFact f={f} value={signed(d.goalsFor - d.goalsAgainst)} label="Averaj" />
        </View>
        {story ? (
          <View style={{ marginTop: u(16) }}>
            <FormRow f={f} last5={d.last5} size={16} />
          </View>
        ) : null}
      </View>
      <Spacer f={f} />
    </Poster>
  );
}

function MiniFact({ f, value, label, accent }: { f: ShareFrame; value: string | number; label: string; accent?: boolean }) {
  return (
    <View style={{ alignItems: "center" }}>
      <CText f={f} k="numStrong" scale={f.story ? 1.6 : 1.25} color={accent ? f.t.accent : f.t.ink}>{value}</CText>
      <Overline f={f} color={f.t.inkMuted} scale={0.85}>{label}</Overline>
    </View>
  );
}

export function teamTemplates(d: TeamShareData): ShareTemplateDef[] {
  return [
    { key: "sezon", label: "Sezon kartı", render: (f) => <TeamSeason f={f} d={d} /> },
    { key: "sira", label: "Sıra rozeti", render: (f) => <TeamRank f={f} d={d} /> },
  ];
}

/* ══════════════════════════ OYUNCU ══════════════════════════ */

export interface PlayerShareData {
  name: string;
  image: string | null;
  position: string | null;
  jersey: number | null;
  teamName: string | null;
  teamLogo: string | null;
  matches: number;
  goals: number;
  assists: number | null;
  average: number | null;
  wins: number;
  draws: number;
  losses: number;
  league: string | null;
  city: string | null;
  footer: string | null;
}

function PlayerCard({ f, d }: { f: ShareFrame; d: PlayerShareData }) {
  const { u, t, story } = f;
  const { first, last } = splitName(d.name);
  const cardPad = story ? 18 : 12;
  return (
    <Poster f={f} mood="center" title={d.league} meta={d.city} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.4 : 0.1} />
      <FillBox f={f} radius={28} tone="soft" vertical style={{ borderWidth: Math.max(1, u(1)), borderColor: t.glassLine, padding: u(cardPad), alignItems: story ? "center" : "stretch" }}>
        <View style={{ flexDirection: story ? "column" : "row", alignItems: "center", gap: u(story ? 0 : 14) }}>
          <View>
            <Portrait f={f} image={d.image} name={d.name} size={story ? 168 : 104} halo />
            {d.jersey ? (
              <FillBox f={f} radius={14} style={{ position: "absolute", left: 0, top: u(4), paddingHorizontal: u(8), paddingVertical: u(3) }}>
                <CText f={f} k="numStrong" scale={story ? 1.2 : 0.95} color={t.onFill}>#{d.jersey}</CText>
              </FillBox>
            ) : null}
          </View>
          <View style={{ alignItems: story ? "center" : "flex-start", flex: story ? undefined : 1, marginTop: u(story ? 14 : 0) }}>
            {d.position ? <Overline f={f}>{d.position}</Overline> : null}
            {first ? <FitName f={f} k="name" text={first} room={18} lines={1} caps scale={story ? 1.1 : 0.85} color={t.inkSoft} align={story ? "center" : "left"} style={{ marginTop: u(4) }} /> : null}
            <FitName f={f} k="poster" text={last} room={story ? 8.5 : 7} lines={1} caps scale={story ? 0.74 : 0.5} min={0.42} align={story ? "center" : "left"} />
            {d.teamName ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: u(6), marginTop: u(6) }}>
                <Crest f={f} logo={d.teamLogo} name={d.teamName} size={story ? 20 : 16} />
                <FitName f={f} k="row" text={d.teamName} room={22} lines={1} align="left" color={t.inkSoft} />
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ height: Math.max(1, u(0.7)), alignSelf: "stretch", backgroundColor: t.line, marginVertical: u(story ? 16 : 10) }} />
        <View style={{ flexDirection: "row", alignSelf: "stretch", justifyContent: "space-around" }}>
          <CardStat f={f} value={d.matches} label="Maç" />
          <CardStat f={f} value={d.goals} label="Gol" accent />
          {d.assists != null ? <CardStat f={f} value={d.assists} label="Asist" /> : null}
          {d.average != null ? <CardStat f={f} value={d.average.toFixed(1)} label="Ort. puan" gold /> : null}
        </View>
      </FillBox>
      <Spacer f={f} />
    </Poster>
  );
}

function CardStat({ f, value, label, accent, gold }: { f: ShareFrame; value: string | number; label: string; accent?: boolean; gold?: boolean }) {
  return (
    <View style={{ alignItems: "center" }}>
      <CText f={f} k="score" scale={f.story ? 0.46 : 0.36} color={gold ? f.t.gold[0] : accent ? f.t.accent : f.t.ink}>{value}</CText>
      <Overline f={f} color={f.t.inkMuted} scale={0.9}>{label}</Overline>
    </View>
  );
}

function PlayerPoster({ f, d }: { f: ShareFrame; d: PlayerShareData }) {
  const { u, t, story } = f;
  const { first, last } = splitName(d.name);
  return (
    <Poster f={f} mood="low" title={d.league} meta={d.city} footer={d.footer}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: u(story ? 10 : 0) }}>
        <View style={{ flex: 1 }}>
          <Overline f={f}>{d.position || "Oyuncu"}</Overline>
          {first ? <FitName f={f} k="hero" text={first} room={12} lines={1} caps scale={story ? 0.9 : 0.7} color={t.inkSoft} align="left" style={{ marginTop: u(6) }} /> : null}
          <FitName f={f} k="poster" text={last} room={story ? 6.5 : 7} lines={2} caps scale={story ? 0.9 : 0.62} min={0.5} align="left" />
          <SigBar f={f} width={44} height={3.5} style={{ marginTop: u(story ? 12 : 6) }} />
        </View>
        {story ? null : <Portrait f={f} image={d.image} name={d.name} size={110} halo />}
      </View>
      {story ? (
        <View style={{ alignItems: "center", marginTop: u(18) }}>
          <Portrait f={f} image={d.image} name={d.name} size={190} halo />
        </View>
      ) : null}
      <Spacer f={f} />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: u(10) }}>
        <View>
          <CText f={f} k="mega" scale={story ? 0.9 : 0.62} color={t.accent}>{d.goals}</CText>
          <Overline f={f} color={t.inkMuted}>Kariyer golü</Overline>
        </View>
        <View style={{ flex: 1, gap: u(story ? 8 : 5), paddingBottom: u(4) }}>
          <RecordBar f={f} w={d.wins} d={d.draws} l={d.losses} />
          <CText f={f} k="body" color={t.inkSoft}>
            {d.matches} maç · {d.wins}G {d.draws}B {d.losses}M
            {d.assists != null ? ` · ${d.assists} asist` : ""}
          </CText>
          {d.teamName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: u(6) }}>
              <Crest f={f} logo={d.teamLogo} name={d.teamName} size={16} />
              <FitName f={f} k="row" text={d.teamName} room={22} lines={1} align="left" color={t.ink} />
            </View>
          ) : null}
        </View>
      </View>
    </Poster>
  );
}

export function playerTemplates(d: PlayerShareData): ShareTemplateDef[] {
  return [
    { key: "kart", label: "Oyuncu kartı", render: (f) => <PlayerCard f={f} d={d} /> },
    { key: "poster", label: "Poster", render: (f) => <PlayerPoster f={f} d={d} /> },
  ];
}

