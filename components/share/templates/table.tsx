/**
 * PUAN DURUMU ŞABLONLARI — 10 takımlık pencere.
 *
 *   Tablo · Odak
 *
 * Pencere (from–to) giriş bileşeninde hesaplanır: kullanıcının takımı varsa
 * onu ortalayan 10'luk dilim, yoksa kullanıcının seçtiği aralık. Odak takım
 * satırı imza degradeli zemin + sol şeritle vurgulanır.
 */

import React from "react";
import { View } from "react-native";

import { num } from "@/lib/share/format";
import { fonts } from "@/theme/fonts";
import { defaultZoneRules, zoneColor, zoneForRank } from "@/theme/zones";
import { Poster, Spacer } from "../canvas/Layout";
import { CText, Crest, FillBox, FitName, FormRow, Glass, Overline, RankChip, SigBar } from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";

export interface TableRowData {
  team_id: number;
  team_name: string;
  logo: string | null;
  played: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  goals_for: number | string;
  goals_against: number | string;
  goal_diff: number | string;
  display_points: number | string;
  last5: string;
}

export interface TableShareData {
  /** Tüm tablo (sıralı). */
  rows: TableRowData[];
  /** 1 tabanlı, dahil. */
  from: number;
  to: number;
  focusTeamId: number | null;
  league: string | null;
  season: string | null;
  city: string | null;
  footer: string | null;
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

function zoneOf(f: ShareFrame, rank: number, total: number): string | null {
  return zoneColor(f.t.zones, zoneForRank(rank, defaultZoneRules(total)));
}

/* ══════════════════════════ TABLO ══════════════════════════ */

const COLS = ["O", "G", "B", "M", "AV"] as const;

function HeadRow({ f, compact }: { f: ShareFrame; compact: boolean }) {
  const { u, t } = f;
  const col = compact ? 19 : 20;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: u(10), paddingBottom: u(6) }}>
      <CText f={f} k="micro" color={t.inkMuted} style={{ width: u(compact ? 46 : 54) }}>#</CText>
      <CText f={f} k="micro" color={t.inkMuted} style={{ flex: 1 }}>TAKIM</CText>
      {COLS.map((label) => (
        <CText key={label} f={f} k="micro" color={t.inkMuted} align="center" style={{ width: u(col) }}>
          {label}
        </CText>
      ))}
      <CText f={f} k="micro" color={t.inkMuted} align="right" style={{ width: u(28) }}>P</CText>
    </View>
  );
}

function TableLine({
  f,
  row,
  rank,
  total,
  focus,
  compact,
}: {
  f: ShareFrame;
  row: TableRowData;
  rank: number;
  total: number;
  focus: boolean;
  compact: boolean;
}) {
  const { u, t } = f;
  const h = compact ? 25 : 43;
  const col = compact ? 19 : 20;
  const zone = zoneOf(f, rank, total);
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", height: u(h), paddingHorizontal: u(10) }}>
      {zone ? (
        <View style={{ position: "absolute", left: 0, top: u(h * 0.22), bottom: u(h * 0.22), width: u(2.5), borderRadius: u(2), backgroundColor: zone }} />
      ) : null}
      <View style={{ width: u(compact ? 20 : 24), alignItems: "flex-start" }}>
        <RankChip f={f} rank={rank} size={compact ? 15 : 19} />
      </View>
      <View style={{ width: u(compact ? 26 : 30) }}>
        <Crest f={f} logo={row.logo} name={row.team_name} size={compact ? 17 : 22} />
      </View>
      <View style={{ flex: 1, paddingRight: u(4) }}>
        <FitName
          f={f}
          k="row"
          text={row.team_name}
          room={compact ? 18 : 15}
          lines={1}
          align="left"
          scale={compact ? 0.92 : 1.05}
          min={0.62}
          color={focus ? t.ink : t.inkSoft}
          style={focus ? { fontFamily: fonts.heading } : undefined}
        />
        {!compact && row.last5 ? (
          <View style={{ marginTop: u(3) }}>
            <FormRow f={f} last5={row.last5} size={8.5} />
          </View>
        ) : null}
      </View>
      {[row.played, row.wins, row.draws, row.losses].map((value, index) => (
        <CText key={index} f={f} k="num" scale={compact ? 0.88 : 0.95} color={t.inkSoft} align="center" style={{ width: u(col) }}>
          {num(value)}
        </CText>
      ))}
      <CText f={f} k="num" scale={compact ? 0.88 : 0.95} color={t.inkMuted} align="center" style={{ width: u(col) }}>
        {signed(num(row.goal_diff))}
      </CText>
      <CText f={f} k="numStrong" scale={compact ? 1 : 1.12} color={focus ? t.accent : t.ink} align="right" style={{ width: u(28) }}>
        {num(row.display_points)}
      </CText>
    </View>
  );
  if (!focus) return inner;
  return (
    <FillBox f={f} radius={12} tone="soft" style={{ borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine }}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: u(3), backgroundColor: t.sigB }} />
      {inner}
    </FillBox>
  );
}

function TitleBlock({ f, d, title }: { f: ShareFrame; d: TableShareData; title: string }) {
  const { u, t, story } = f;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: u(story ? 10 : 0) }}>
      <View>
        <Overline f={f}>{d.season ? `${d.season}` : "Sezon"}</Overline>
        <CText f={f} k="title" scale={story ? 1.15 : 0.82} style={{ marginTop: u(2) }}>{title}</CText>
        <SigBar f={f} width={36} height={3} style={{ marginTop: u(story ? 8 : 5) }} />
      </View>
      <Glass f={f} radius={14} strong style={{ paddingHorizontal: u(10), paddingVertical: u(5), marginBottom: u(2) }}>
        <CText f={f} k="numStrong" scale={0.9}>
          {d.from}–{d.to}
          <CText f={f} k="label" color={t.inkMuted}>{"  SIRA"}</CText>
        </CText>
      </Glass>
    </View>
  );
}

function StandingsTable({ f, d }: { f: ShareFrame; d: TableShareData }) {
  const { u, story } = f;
  const compact = !story;
  const slice = d.rows.slice(d.from - 1, d.to);
  return (
    <Poster f={f} mood="top" title={d.league} meta={d.city} footer={d.footer} watermark={false}>
      <TitleBlock f={f} d={d} title="Puan durumu" />
      <Spacer f={f} grow={story ? 0.6 : 0.2} min={story ? 14 : 8} />
      <Glass f={f} radius={20} style={{ paddingTop: u(story ? 12 : 8), paddingBottom: u(story ? 6 : 4), paddingHorizontal: u(2) }}>
        <HeadRow f={f} compact={compact} />
        {slice.map((row, index) => (
          <TableLine
            key={row.team_id}
            f={f}
            row={row}
            rank={d.from + index}
            total={d.rows.length}
            focus={d.focusTeamId != null && Number(row.team_id) === d.focusTeamId}
            compact={compact}
          />
        ))}
      </Glass>
      <Spacer f={f} />
      {story ? <ZoneLegend f={f} total={d.rows.length} /> : null}
    </Poster>
  );
}

function ZoneLegend({ f, total }: { f: ShareFrame; total: number }) {
  const { u, t } = f;
  const items = [
    { label: "Şampiyon", color: zoneOf(f, 1, total) },
    { label: "Play-off", color: zoneOf(f, 2, total) },
    { label: "Düşme hattı", color: zoneOf(f, total, total) },
  ].filter((item) => item.color);
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: u(14) }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: u(5) }}>
          <View style={{ width: u(8), height: u(3), borderRadius: u(2), backgroundColor: item.color as string }} />
          <CText f={f} k="body" scale={0.85} color={t.inkMuted}>{item.label}</CText>
        </View>
      ))}
    </View>
  );
}

/* ══════════════════════════ ODAK ══════════════════════════ */

function StandingsFocus({ f, d }: { f: ShareFrame; d: TableShareData }) {
  const { u, t, story } = f;
  const all = d.rows;
  const focusIndex = d.focusTeamId != null ? all.findIndex((row) => Number(row.team_id) === d.focusTeamId) : -1;
  const heroIndex = focusIndex >= 0 ? focusIndex : d.from - 1;
  const hero = all[heroIndex];
  const rank = heroIndex + 1;
  const slice = all.slice(d.from - 1, d.to);
  if (!hero) return null;
  const caption = focusIndex >= 0 ? (rank === 1 ? "Zirvede" : `${rank}. sırada`) : rank === 1 ? "Lider" : `${rank}. sıra`;
  return (
    <Poster f={f} mood="center" title={d.league} meta={[d.city, d.season].filter(Boolean).join(" · ")} footer={d.footer}>
      <FillBox f={f} radius={24} tone="soft" style={{ padding: u(story ? 16 : 11), borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine, marginTop: u(story ? 8 : 0) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: u(12) }}>
          <View style={{ alignItems: "center", width: u(story ? 70 : 52) }}>
            <CText f={f} k="score" scale={story ? 0.82 : 0.6} color={t.ink}>
              {rank}
              <CText f={f} k="score" scale={story ? 0.4 : 0.3} color={t.accent}>.</CText>
            </CText>
            <Overline f={f} color={t.inkMuted} scale={0.9}>Sıra</Overline>
          </View>
          <Crest f={f} logo={hero.logo} name={hero.team_name} size={story ? 62 : 44} />
          <View style={{ flex: 1 }}>
            <Overline f={f}>{caption}</Overline>
            <FitName f={f} k="hero" text={hero.team_name} room={11} lines={2} align="left" scale={story ? 0.85 : 0.68} min={0.6} style={{ marginTop: u(2) }} />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <CText f={f} k="score" scale={story ? 0.5 : 0.38} color={t.accent}>{num(hero.display_points)}</CText>
            <Overline f={f} color={t.inkMuted} scale={0.9}>Puan</Overline>
          </View>
        </View>
        {story ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: u(14), paddingTop: u(12), borderTopWidth: Math.max(1, u(0.7)), borderTopColor: t.line }}>
            <Fact f={f} label="Maç" value={num(hero.played)} />
            <Fact f={f} label="G-B-M" value={`${num(hero.wins)}-${num(hero.draws)}-${num(hero.losses)}`} />
            <Fact f={f} label="Averaj" value={signed(num(hero.goal_diff))} />
            <View style={{ alignItems: "center", gap: u(4) }}>
              <FormRow f={f} last5={hero.last5} size={11} />
              <Overline f={f} color={t.inkMuted} scale={0.85}>Form</Overline>
            </View>
          </View>
        ) : null}
      </FillBox>

      <Spacer f={f} grow={0.4} min={story ? 14 : 8} />

      <View style={{ gap: u(story ? 4 : 1) }}>
        {slice.map((row, index) => {
          const r = d.from + index;
          const isHero = r === rank;
          return (
            <View
              key={row.team_id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: u(story ? 30 : 22),
                paddingHorizontal: u(10),
                borderRadius: u(10),
                backgroundColor: isHero ? f.t.glassStrong : "transparent",
              }}
            >
              <CText f={f} k="numStrong" scale={story ? 0.9 : 0.78} color={isHero ? t.accent : t.inkMuted} style={{ width: u(24) }}>
                {r}
              </CText>
              <View style={{ width: u(story ? 26 : 22) }}>
                <Crest f={f} logo={row.logo} name={row.team_name} size={story ? 18 : 15} />
              </View>
              <FitName f={f} k="row" text={row.team_name} room={22} lines={1} align="left" scale={story ? 1 : 0.88} color={isHero ? t.ink : t.inkSoft} style={{ flex: 1 }} />
              <CText f={f} k="num" scale={story ? 0.9 : 0.8} color={t.inkMuted} align="right" style={{ width: u(34) }}>
                {signed(num(row.goal_diff))}
              </CText>
              <CText f={f} k="numStrong" scale={story ? 1.05 : 0.9} color={isHero ? t.accent : t.ink} align="right" style={{ width: u(30) }}>
                {num(row.display_points)}
              </CText>
            </View>
          );
        })}
      </View>
      <Spacer f={f} />
    </Poster>
  );
}

function Fact({ f, label, value }: { f: ShareFrame; label: string; value: string | number }) {
  return (
    <View style={{ alignItems: "center", gap: f.u(3) }}>
      <CText f={f} k="numStrong" scale={1.2}>{value}</CText>
      <Overline f={f} color={f.t.inkMuted} scale={0.85}>{label}</Overline>
    </View>
  );
}

export function tableTemplates(d: TableShareData): ShareTemplateDef[] {
  return [
    { key: "tablo", label: "Tablo", render: (f) => <StandingsTable f={f} d={d} /> },
    { key: "odak", label: d.focusTeamId != null ? "Takımım" : "Lider", render: (f) => <StandingsFocus f={f} d={d} /> },
  ];
}
