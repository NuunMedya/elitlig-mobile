/**
 * OYUNCU SIRALAMASI ŞABLONLARI — gol krallığı, asist krallığı ve diğer
 * ölçütler (Oyuncular sekmesindeki seçili ölçüt).
 *
 *   Lider · Liste
 *
 * "Lider": pencerenin ilk sırası büyük fotoğraflı lider bloğu, kalanı ince
 * satırlar. "Liste": on eşit satır, değer çubuklarıyla.
 */

import React from "react";
import { View } from "react-native";

import { splitName } from "@/lib/share/format";
import { fonts } from "@/theme/fonts";
import { Poster, Spacer } from "../canvas/Layout";
import { CText, Crest, FillBox, FitName, Glass, Overline, Portrait, RankChip, SigBar } from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";

export interface RankedPlayer {
  rank: number;
  id: number;
  name: string;
  image: string | null;
  teamName: string | null;
  teamLogo: string | null;
  /** Ekrandaki değer ("24", "2,15"). */
  value: string;
  /** Çubuk oranı için sayı. */
  amount: number;
  /** Satır altı bilgi ("18 maç · 6 asist"). */
  sub: string | null;
}

export interface PlayersShareData {
  rows: RankedPlayer[];
  /** "Gol krallığı" */
  metricLabel: string;
  /** "gol" */
  unit: string;
  focusId: number | null;
  league: string | null;
  season: string | null;
  city: string | null;
  footer: string | null;
}

function Title({ f, d }: { f: ShareFrame; d: PlayersShareData }) {
  const { u, t, story } = f;
  const first = d.rows[0]?.rank ?? 1;
  const last = d.rows[d.rows.length - 1]?.rank ?? first;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: u(story ? 8 : 0) }}>
      <View style={{ flex: 1 }}>
        <Overline f={f}>{d.season || "Sezon"}</Overline>
        <FitName f={f} k="title" text={d.metricLabel} room={14} lines={1} align="left" scale={story ? 1.1 : 0.8} style={{ marginTop: u(2) }} />
        <SigBar f={f} width={36} height={3} style={{ marginTop: u(story ? 8 : 5) }} />
      </View>
      <Glass f={f} radius={14} strong style={{ paddingHorizontal: u(10), paddingVertical: u(5), marginBottom: u(2) }}>
        <CText f={f} k="numStrong" scale={0.9}>
          {first}–{last}
          <CText f={f} k="label" color={t.inkMuted}>{"  SIRA"}</CText>
        </CText>
      </Glass>
    </View>
  );
}

/** İnce satır: sıra · portre · ad/takım · değer. */
function PlayerLine({ f, row, focus, h, bar, max }: { f: ShareFrame; row: RankedPlayer; focus: boolean; h: number; bar?: boolean; max?: number }) {
  const { u, t, story } = f;
  const avatar = Math.min(h - 6, story ? 30 : 22);
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", height: u(h), paddingHorizontal: u(10), gap: u(8) }}>
      <View style={{ width: u(story ? 22 : 18), alignItems: "center" }}>
        <RankChip f={f} rank={row.rank} size={story ? 19 : 15} />
      </View>
      <Portrait f={f} image={row.image} name={row.name} size={avatar} ring="none" />
      <View style={{ flex: 1 }}>
        <FitName
          f={f}
          k="row"
          text={row.name}
          room={story ? 19 : 22}
          lines={1}
          align="left"
          scale={story ? 1.05 : 0.9}
          min={0.65}
          color={focus ? t.ink : t.inkSoft}
          style={focus ? { fontFamily: fonts.heading } : undefined}
        />
        {bar && max ? (
          <View style={{ height: u(3), marginTop: u(4), borderRadius: u(2), backgroundColor: t.glass }}>
            <FillBox f={f} radius={1.5} style={{ height: u(3), width: `${Math.max(4, (row.amount / max) * 100)}%` }} />
          </View>
        ) : row.teamName ? (
          <FitName f={f} k="body" text={row.teamName} room={story ? 30 : 36} lines={1} align="left" scale={story ? 0.88 : 0.78} color={t.inkMuted} />
        ) : null}
      </View>
      <CText f={f} k="numStrong" scale={story ? 1.3 : 1.05} color={focus ? t.accent : t.ink} align="right" style={{ minWidth: u(30) }}>
        {row.value}
      </CText>
    </View>
  );
  if (!focus) return body;
  return (
    <FillBox f={f} radius={12} tone="soft" style={{ borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine }}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: u(3), backgroundColor: t.sigB }} />
      {body}
    </FillBox>
  );
}

function PlayersLeader({ f, d }: { f: ShareFrame; d: PlayersShareData }) {
  const { u, t, story } = f;
  const [lead, ...rest] = d.rows;
  if (!lead) return null;
  const { first, last } = splitName(lead.name);
  const gold = lead.rank === 1;
  return (
    <Poster f={f} mood="top" title={d.league} meta={d.city} footer={d.footer} watermark={false}>
      <Title f={f} d={d} />
      <Spacer f={f} grow={0.3} min={story ? 12 : 6} />
      <FillBox f={f} radius={24} tone="soft" style={{ borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine, padding: u(story ? 16 : 10), flexDirection: "row", alignItems: "center", gap: u(story ? 16 : 12) }}>
        <View>
          <Portrait f={f} image={lead.image} name={lead.name} size={story ? 112 : 70} ring={gold ? "gold" : "sig"} halo />
          <View style={{ position: "absolute", right: -u(2), bottom: -u(2) }}>
            <RankChip f={f} rank={lead.rank} size={story ? 30 : 22} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          {first ? <FitName f={f} k="name" text={first} room={16} lines={1} align="left" scale={story ? 0.95 : 0.8} color={t.inkSoft} caps /> : null}
          <FitName f={f} k="hero" text={last} room={11} lines={1} align="left" caps scale={story ? 1.05 : 0.8} min={0.55} />
          {lead.teamName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: u(6), marginTop: u(story ? 8 : 4) }}>
              <Crest f={f} logo={lead.teamLogo} name={lead.teamName} size={story ? 18 : 14} />
              <FitName f={f} k="body" text={lead.teamName} room={22} lines={1} align="left" color={t.inkSoft} style={{ flexShrink: 1 }} />
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: u(6), marginTop: u(story ? 10 : 4) }}>
            <CText f={f} k="score" scale={story ? 0.72 : 0.5} color={gold ? t.gold[0] : t.accent}>{lead.value}</CText>
            <Overline f={f} color={t.inkMuted} style={{ marginBottom: u(story ? 8 : 5) }}>{d.unit}</Overline>
          </View>
        </View>
      </FillBox>
      <Spacer f={f} grow={0.3} min={story ? 10 : 6} />
      <Glass f={f} radius={20} style={{ paddingVertical: u(story ? 6 : 3), paddingHorizontal: u(2) }}>
        {rest.map((row) => (
          <PlayerLine key={row.id} f={f} row={row} focus={row.id === d.focusId} h={story ? 38 : 23} />
        ))}
      </Glass>
      <Spacer f={f} />
    </Poster>
  );
}

function PlayersList({ f, d }: { f: ShareFrame; d: PlayersShareData }) {
  const { u, story } = f;
  const max = Math.max(...d.rows.map((row) => row.amount), 1);
  return (
    <Poster f={f} mood="low" title={d.league} meta={d.city} footer={d.footer} watermark={false}>
      <Title f={f} d={d} />
      <Spacer f={f} grow={0.5} min={story ? 14 : 8} />
      <Glass f={f} radius={20} style={{ paddingVertical: u(story ? 8 : 4), paddingHorizontal: u(2), gap: u(story ? 2 : 0) }}>
        {d.rows.map((row) => (
          <PlayerLine key={row.id} f={f} row={row} focus={row.id === d.focusId} h={story ? 44 : 30} bar max={max} />
        ))}
      </Glass>
      <Spacer f={f} />
    </Poster>
  );
}

export function playersTemplates(d: PlayersShareData): ShareTemplateDef[] {
  return [
    { key: "lider", label: "Lider", render: (f) => <PlayersLeader f={f} d={d} /> },
    { key: "liste", label: "Liste", render: (f) => <PlayersList f={f} d={d} /> },
  ];
}
