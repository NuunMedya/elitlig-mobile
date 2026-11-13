/**
 * MAÇ ŞABLONLARI — maç günü (2) ve maç sonucu (5).
 *
 *   Maç günü:   Afiş · Karşı karşıya
 *   Maç sonucu: Sade · Golcüler · Künye · Kazanan · Maçın yıldızı
 *
 * Her şablon iki ayrı yerleşimle çizilir (`f.story`): Story dikey ritimle
 * nefes alır, Post aynı hiyerarşiyi sıkıştırır ve ikincil blokları bırakır.
 */

import React from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

import { clock, dayMonth, groupScorers, shortName, splitName, weekday, type ScorerGroup } from "@/lib/share/format";
import { alpha } from "@/lib/share/palette";
import { upperTR } from "@/theme";
import { Poster, Spacer } from "../canvas/Layout";
import {
  CText,
  Crest,
  FillBox,
  FitName,
  Glass,
  Glyph,
  Halo,
  Overline,
  Portrait,
  SigBar,
  StatTile,
  useSvgId,
} from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";

export interface ShareTeamRef {
  name: string;
  logo: string | null;
}

export interface MatchShareData {
  id: number;
  home: ShareTeamRef;
  away: ShareTeamRef;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  date: string;
  time: string;
  venue: string | null;
  league: string | null;
  season: string | null;
  city: string | null;
  /** Alt bant sağı (instagram adı ya da şehir). */
  footer: string | null;
  scorers: {
    home: { name: string; minute: number | null; ownGoal?: boolean }[];
    away: { name: string; minute: number | null; ownGoal?: boolean }[];
  };
  mvp: {
    name: string;
    image: string | null;
    goals: number;
    assists: number;
    rating: number | null;
    team: ShareTeamRef | null;
  } | null;
  stats: { label: string; home: number; away: number }[];
}

const meta = (d: MatchShareData) => [d.city, d.season].filter(Boolean).join(" · ");

/* ══════════════════════════ ORTAK PARÇALAR ══════════════════════════ */

/** Arma + ad sütunu. */
function Side({ f, team, size, room, halo, dim }: { f: ShareFrame; team: ShareTeamRef; size: number; room: number; halo?: boolean; dim?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: f.u(10) }}>
      <Crest f={f} logo={team.logo} name={team.name} size={size} halo={halo} dim={dim} />
      <FitName f={f} text={team.name} room={room} caps min={0.6} />
    </View>
  );
}

/** "16 – 1" — iki basamaklı skorlarda punto düşer. */
function ScoreText({
  f,
  home,
  away,
  scale = 1,
  k = "mega",
  maxWidth,
}: {
  f: ShareFrame;
  home: number | null;
  away: number | null;
  scale?: number;
  k?: "mega" | "score";
  /** Sığması gereken genişlik (birim); verilirse punto buna göre iner. */
  maxWidth?: number;
}) {
  const digits = String(home ?? "-").length + String(away ?? "-").length;
  const base = k === "mega" ? 132 : 84;
  // Archivo rakamı ~0.6 em; tire 0.62 ölçekte + iki yan boşluk.
  const estimate = base * (digits * 0.6 + 0.4) + 24;
  const fit = maxWidth ? Math.min(1, maxWidth / (estimate * scale)) : digits <= 3 ? 1 : digits === 4 ? 0.8 : 0.66;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <CText f={f} k={k} scale={scale * fit}>
        {home ?? "-"}
      </CText>
      <CText f={f} k={k} scale={scale * fit * 0.62} color={f.t.accent} style={{ marginHorizontal: f.u(12 * scale * fit) }}>
        –
      </CText>
      <CText f={f} k={k} scale={scale * fit}>
        {away ?? "-"}
      </CText>
    </View>
  );
}

/** Degrade hap etiket ("MAÇ SONU"). */
function TagPill({ f, label, tone = "sig" }: { f: ShareFrame; label: string; tone?: "sig" | "gold" }) {
  return (
    <FillBox f={f} radius={20} tone={tone} style={{ alignSelf: "center", paddingHorizontal: f.u(14), paddingVertical: f.u(6) }}>
      <Overline f={f} color={tone === "gold" ? f.t.medalInk : f.t.onFill} scale={1.05}>
        {label}
      </Overline>
    </FillBox>
  );
}

/** Tarih · saha satırı. */
function WhenWhere({ f, d, align = "center" }: { f: ShareFrame; d: MatchShareData; align?: "center" | "left" }) {
  const parts = [dayMonth(d.date), d.finished ? null : clock(d.time), d.venue].filter(Boolean).join("  ·  ");
  return (
    <FitName f={f} k="body" text={parts} room={46} lines={2} color={f.t.inkSoft} align={align} min={0.8} />
  );
}

function scorerCap(f: ShareFrame, compact: boolean) {
  return f.story ? (compact ? 4 : 7) : compact ? 3 : 4;
}

/** Bir takımın golcü sütunu: ad + dakikalar. */
function ScorerColumn({
  f,
  groups,
  align,
  cap,
  compact = false,
}: {
  f: ShareFrame;
  groups: ScorerGroup[];
  align: "left" | "right";
  cap: number;
  compact?: boolean;
}) {
  const shown = groups.slice(0, cap);
  const rest = groups.length - shown.length;
  const right = align === "right";
  return (
    <View style={{ flex: 1, gap: f.u(compact ? 5 : 8), alignItems: right ? "flex-end" : "flex-start" }}>
      {shown.map((group) => (
        <View key={group.name + group.ownGoal} style={{ alignItems: right ? "flex-end" : "flex-start", maxWidth: "100%" }}>
          <View style={{ flexDirection: right ? "row-reverse" : "row", alignItems: "center", gap: f.u(4), maxWidth: "100%" }}>
            <Glyph f={f} name="football" size={compact ? 8 : 9} color={f.t.accent} />
            <FitName
              f={f}
              k="row"
              text={`${upperTR(shortName(group.name))}${group.ownGoal ? " (K.K.)" : ""}`}
              room={compact ? 17 : 15}
              lines={1}
              align={align}
              scale={compact ? 0.92 : 1.05}
              min={0.7}
              style={{ flexShrink: 1 }}
            />
          </View>
          <CText f={f} k="num" scale={compact ? 0.78 : 0.86} color={f.t.inkMuted} lines={2} align={align}>
            {group.minutes.length > 1 && compact ? `${group.minutes.length} gol` : group.minutes.filter(Boolean).join("  ") || "gol"}
          </CText>
        </View>
      ))}
      {rest > 0 ? (
        <CText f={f} k="body" scale={0.85} color={f.t.inkMuted}>
          +{rest} oyuncu
        </CText>
      ) : null}
    </View>
  );
}

/* ══════════════════════════ MAÇ GÜNÜ ══════════════════════════ */

function MatchDayPoster({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  return (
    <Poster f={f} title={d.league} meta={meta(d)} footer={d.footer}>
      <View style={{ marginTop: u(story ? 26 : 4) }}>
        {story ? (
          <>
            <CText f={f} k="poster" scale={1.18}>MAÇ</CText>
            <CText f={f} k="poster" scale={1.18} color={t.accent}>GÜNÜ</CText>
          </>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <CText f={f} k="poster" scale={0.62}>
              MAÇ <CText f={f} k="poster" scale={0.62} color={t.accent}>GÜNÜ</CText>
            </CText>
            <View style={{ alignItems: "flex-end", paddingBottom: u(4) }}>
              <Overline f={f} color={t.inkMuted}>{weekday(d.date)}</Overline>
              <CText f={f} k="numStrong" scale={1.1}>{dayMonth(d.date)}</CText>
            </View>
          </View>
        )}
        <SigBar f={f} width={story ? 56 : 44} height={3.5} style={{ marginTop: u(story ? 14 : 8) }} />
      </View>

      <Spacer f={f} />

      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Side f={f} team={d.home} size={story ? 112 : 80} room={13} halo />
        <View style={{ height: u(story ? 112 : 80), justifyContent: "center", paddingHorizontal: u(6) }}>
          <FillBox f={f} radius={story ? 24 : 18} style={{ width: u(story ? 48 : 36), height: u(story ? 48 : 36), alignItems: "center", justifyContent: "center" }}>
            <CText f={f} k="numStrong" scale={story ? 1.2 : 0.95} color={t.onFill}>VS</CText>
          </FillBox>
        </View>
        <Side f={f} team={d.away} size={story ? 112 : 80} room={13} halo />
      </View>

      <Spacer f={f} />

      <Glass f={f} radius={20} style={{ flexDirection: "row", paddingVertical: u(story ? 16 : 10) }}>
        {story ? (
          <InfoCell f={f} label="Tarih" value={dayMonth(d.date)} sub={weekday(d.date)} />
        ) : null}
        <InfoCell f={f} label="Saat" value={clock(d.time) || "—"} big divider={story} weight={1.2} />
        <InfoCell f={f} label="Saha" value={d.venue || "—"} divider wide />
      </Glass>
    </Poster>
  );
}

function InfoCell({ f, label, value, sub, big, divider, wide, weight }: { f: ShareFrame; label: string; value: string; sub?: string; big?: boolean; divider?: boolean; wide?: boolean; weight?: number }) {
  const { u, t } = f;
  return (
    <View
      style={{
        flex: weight ?? (wide ? 1.4 : 1),
        paddingHorizontal: u(12),
        borderLeftWidth: divider ? Math.max(1, u(0.7)) : 0,
        borderLeftColor: t.line,
        justifyContent: "center",
      }}
    >
      <Overline f={f} color={t.inkMuted}>{label}</Overline>
      {big ? (
        <CText f={f} k="score" scale={0.3} style={{ marginTop: u(4) }}>{value}</CText>
      ) : (
        <FitName f={f} k="name" text={value} room={12} lines={2} align="left" scale={0.9} min={0.7} style={{ marginTop: u(4) }} />
      )}
      {sub ? <CText f={f} k="body" color={t.inkMuted} scale={0.9}>{sub}</CText> : null}
    </View>
  );
}

/** Diyagonal bölünmüş sahne: ev sahibi sol üst, deplasman sağ alt; ortada eğik bant. */
function MatchDaySplit({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, W, story } = f;
  const crest = story ? 118 : 84;
  return (
    <Poster
      f={f}
      mood="split"
      title={d.league}
      meta={meta(d)}
      footer={d.venue}
      streaks={false}
      decor={
        <>
          <SplitDecor f={f} d={d} />
          <View style={{ position: "absolute", left: u(14), top: u(story ? 100 : 66), width: W * 0.52, alignItems: "center", gap: u(8) }}>
            <Crest f={f} logo={d.home.logo} name={d.home.name} size={crest} halo />
            <FitName f={f} text={d.home.name} room={13} caps />
          </View>
          <View style={{ position: "absolute", right: u(14), top: u(story ? 362 : 262), width: W * 0.52, alignItems: "center", gap: u(8) }}>
            <Crest f={f} logo={d.away.logo} name={d.away.name} size={crest} halo />
            <FitName f={f} text={d.away.name} room={13} caps />
          </View>
        </>
      }
    >
      {null}
    </Poster>
  );
}

function SplitDecor({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const id = useSvgId("sp");
  const { W, H, t, u, story } = f;
  const cy = H * (story ? 0.52 : 0.54);
  const dy = H * (story ? 0.22 : 0.2);
  const bt = u(story ? 70 : 54);
  const L = cy + dy / 2;
  const R = cy - dy / 2;
  const angle = (Math.atan2(-dy, W) * 180) / Math.PI;
  return (
    <>
      <Svg width={W} height={H} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.glowA} stopOpacity={t.dark ? 0.42 : 0.2} />
            <Stop offset="1" stopColor={t.glowA} stopOpacity={0.02} />
          </LinearGradient>
          <LinearGradient id={`${id}a`} x1="1" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={t.glowB} stopOpacity={t.dark ? 0.36 : 0.18} />
            <Stop offset="1" stopColor={t.glowB} stopOpacity={0.02} />
          </LinearGradient>
          <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={t.sigA} />
            <Stop offset="1" stopColor={t.sigB} />
          </LinearGradient>
        </Defs>
        <Polygon points={`0,0 ${W},0 ${W},${R - bt / 2} 0,${L - bt / 2}`} fill={`url(#${id}h)`} />
        <Polygon points={`0,${L + bt / 2} ${W},${R + bt / 2} ${W},${H} 0,${H}`} fill={`url(#${id}a)`} />
        <Polygon points={`0,${L - bt / 2} ${W},${R - bt / 2} ${W},${R + bt / 2} 0,${L + bt / 2}`} fill={`url(#${id}b)`} />
      </Svg>
      <View
        style={{
          position: "absolute",
          left: -W * 0.2,
          width: W * 1.4,
          top: cy - bt / 2,
          height: bt,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: `${angle}deg` }],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: u(10) }}>
          <CText f={f} k="poster" scale={story ? 0.6 : 0.48} color={t.onFill}>MAÇ GÜNÜ</CText>
          <View style={{ width: u(5), height: u(5), borderRadius: u(3), backgroundColor: t.onFill }} />
          <CText f={f} k="poster" scale={story ? 0.6 : 0.48} color={t.onFill}>{clock(d.time)}</CText>
        </View>
        <Overline f={f} color={alpha(t.onFill, 0.88)} scale={story ? 1.05 : 0.9} style={{ marginTop: u(2) }}>
          {[weekday(d.date), dayMonth(d.date)].filter(Boolean).join(" · ")}
        </Overline>
      </View>
    </>
  );
}

/* ══════════════════════════ MAÇ SONUCU ══════════════════════════ */

function resultLine(d: MatchShareData): string {
  const h = d.homeScore ?? 0;
  const a = d.awayScore ?? 0;
  if (h === a) return "Puanlar paylaşıldı";
  return `${h > a ? d.home.name : d.away.name} kazandı`;
}

/** (a) Sade — dev skor + armalar. */
function ResultMinimal({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const crest = story ? 92 : 62;
  return (
    <Poster f={f} mood="center" title={d.league} meta={meta(d)} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.8 : 0.3} />
      <TagPill f={f} label="Maç sonu" />
      <Spacer f={f} grow={story ? 0.6 : 0.3} min={10} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: u(12) }}>
        <Side f={f} team={d.home} size={crest} room={12} />
        <Side f={f} team={d.away} size={crest} room={12} />
      </View>
      <View style={{ marginTop: u(story ? 18 : 4) }}>
        <ScoreText f={f} home={d.homeScore} away={d.awayScore} scale={story ? 1 : 0.78} />
      </View>
      <View style={{ alignItems: "center", gap: u(6), marginTop: u(story ? 10 : 2) }}>
        <FitName f={f} k="label" text={resultLine(d)} room={34} lines={1} caps color={t.accent} scale={1.15} />
        <WhenWhere f={f} d={d} />
      </View>
      <Spacer f={f} />
    </Poster>
  );
}

/** Skor şeridi: arma · ad / skor / ad · arma (golcüler ve künye için). */
function ScoreStrip({ f, d, crest, scale, inner = 324 }: { f: ShareFrame; d: MatchShareData; crest: number; scale: number; inner?: number }) {
  const { u } = f;
  // Yan sütunlar sabit genişlikte: skor ne kadar büyük olursa olsun ad
  // sütunu daralmaz; skor ortadaki boşluğa sığacak kadar küçülür.
  const side = Math.max(crest + 16, 96);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ width: u(side), alignItems: "center", gap: u(6) }}>
        <Crest f={f} logo={d.home.logo} name={d.home.name} size={crest} />
        <FitName f={f} text={d.home.name} room={9.5} caps scale={0.8} />
      </View>
      <View style={{ flex: 1, height: u(crest), justifyContent: "center" }}>
        <ScoreText f={f} home={d.homeScore} away={d.awayScore} k="score" scale={scale} maxWidth={inner - side * 2 - 8} />
      </View>
      <View style={{ width: u(side), alignItems: "center", gap: u(6) }}>
        <Crest f={f} logo={d.away.logo} name={d.away.name} size={crest} />
        <FitName f={f} text={d.away.name} room={9.5} caps scale={0.8} />
      </View>
    </View>
  );
}

/** (b) Golcüler — skor + dakikalarıyla gol atanlar. */
function ResultScorers({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const home = groupScorers(d.scorers.home);
  const away = groupScorers(d.scorers.away);
  const cap = scorerCap(f, false);
  return (
    <Poster f={f} mood="top" title={d.league} meta={meta(d)} footer={d.footer}>
      <View style={{ alignItems: "center", gap: u(4), marginTop: u(story ? 8 : 0) }}>
        <Overline f={f} scale={1.1}>Maç sonu</Overline>
        <WhenWhere f={f} d={d} />
      </View>
      <View style={{ marginTop: u(story ? 22 : 10) }}>
        <ScoreStrip f={f} d={d} crest={story ? 72 : 52} scale={story ? 1 : 0.78} />
      </View>
      <Spacer f={f} grow={0.5} min={story ? 18 : 10} />
      <Glass f={f} radius={22} style={{ paddingHorizontal: u(16), paddingVertical: u(story ? 16 : 12) }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: u(8), marginBottom: u(story ? 12 : 8) }}>
          <SigBar f={f} width={16} height={2} />
          <Overline f={f} color={t.ink}>Goller</Overline>
          <SigBar f={f} width={16} height={2} />
        </View>
        {home.length || away.length ? (
          <View style={{ flexDirection: "row", gap: u(14) }}>
            <ScorerColumn f={f} groups={home} align="left" cap={cap} />
            <View style={{ width: Math.max(1, u(0.7)), backgroundColor: t.line }} />
            <ScorerColumn f={f} groups={away} align="right" cap={cap} />
          </View>
        ) : (
          <CText f={f} k="body" color={t.inkMuted} align="center">
            Golcü bilgisi girilmedi
          </CText>
        )}
      </Glass>
      <Spacer f={f} />
    </Poster>
  );
}

/** Karşılaştırma çubuğu: ev (mor) ↔ deplasman (camgöbeği). */
function StatLine({ f, label, home, away }: { f: ShareFrame; label: string; home: number; away: number }) {
  const { u, t } = f;
  const total = Math.max(1, home + away);
  return (
    <View style={{ gap: u(4) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <CText f={f} k="numStrong" scale={0.9}>{home}</CText>
        <Overline f={f} color={t.inkMuted} scale={0.95}>{label}</Overline>
        <CText f={f} k="numStrong" scale={0.9}>{away}</CText>
      </View>
      <View style={{ flexDirection: "row", height: u(4), gap: u(3) }}>
        <View style={{ flex: 1, flexDirection: "row-reverse", backgroundColor: t.glass, borderRadius: u(2) }}>
          <View style={{ width: `${(home / total) * 100}%`, backgroundColor: t.sigA, borderRadius: u(2) }} />
        </View>
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: t.glass, borderRadius: u(2) }}>
          <View style={{ width: `${(away / total) * 100}%`, backgroundColor: t.sigB, borderRadius: u(2) }} />
        </View>
      </View>
    </View>
  );
}

const STAT_ORDER = ["Goller", "Asistler", "Kurtarışlar", "Sarı Kart", "Kırmızı Kart"];

/** (c) Künye — golcüler + maçın yıldızı + kısa istatistik. */
function ResultDetail({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const home = groupScorers(d.scorers.home);
  const away = groupScorers(d.scorers.away);
  const stats = d.stats
    .filter((row) => STAT_ORDER.includes(row.label) && row.home + row.away > 0)
    .sort((a, b) => STAT_ORDER.indexOf(a.label) - STAT_ORDER.indexOf(b.label))
    .slice(0, story ? 4 : 0);
  return (
    <Poster f={f} mood="low" title={d.league} meta={meta(d)} footer={d.footer}>
      <Glass f={f} radius={22} strong style={{ paddingVertical: u(story ? 14 : 10), paddingHorizontal: u(8) }}>
        <View style={{ alignItems: "center", marginBottom: u(story ? 8 : 4) }}>
          <Overline f={f}>{`Maç sonu · ${dayMonth(d.date)}`}</Overline>
        </View>
        <ScoreStrip f={f} d={d} crest={story ? 56 : 42} scale={story ? 0.82 : 0.62} inner={308} />
        {home.length || away.length ? (
          <View style={{ flexDirection: "row", gap: u(12), marginTop: u(story ? 12 : 8), paddingHorizontal: u(8), paddingTop: u(story ? 10 : 8), borderTopWidth: Math.max(1, u(0.7)), borderTopColor: t.line }}>
            <ScorerColumn f={f} groups={home} align="left" cap={scorerCap(f, true)} compact />
            <ScorerColumn f={f} groups={away} align="right" cap={scorerCap(f, true)} compact />
          </View>
        ) : null}
      </Glass>

      {d.mvp ? (
        <FillBox f={f} radius={22} tone="soft" style={{ marginTop: u(story ? 12 : 8), flexDirection: "row", alignItems: "center", gap: u(12), padding: u(story ? 14 : 10), borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine }}>
          <Portrait f={f} image={d.mvp.image} name={d.mvp.name} size={story ? 64 : 48} ring="gold" />
          <View style={{ flex: 1 }}>
            <Overline f={f} color={t.gold[0]}>Maçın yıldızı</Overline>
            <FitName f={f} k="hero" text={d.mvp.name} room={16} lines={1} align="left" scale={story ? 0.8 : 0.68} min={0.6} style={{ marginTop: u(2) }} />
            <CText f={f} k="body" color={t.inkSoft} style={{ marginTop: u(3) }}>
              {[
                d.mvp.goals ? `${d.mvp.goals} gol` : null,
                d.mvp.assists ? `${d.mvp.assists} asist` : null,
                d.mvp.rating ? `${d.mvp.rating.toFixed(1)} puan` : null,
                d.mvp.team?.name ?? null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </CText>
          </View>
        </FillBox>
      ) : null}

      {stats.length ? (
        <Glass f={f} radius={22} style={{ marginTop: u(12), padding: u(14), gap: u(10) }}>
          {stats.map((row) => (
            <StatLine key={row.label} f={f} label={row.label} home={row.home} away={row.away} />
          ))}
        </Glass>
      ) : null}

      <Spacer f={f} />
      <View style={{ alignItems: "center" }}>
        <WhenWhere f={f} d={d} />
      </View>
    </Poster>
  );
}

/** Kazanan vurgulu sahne süsü: kazananın yarısı aydınlık. */
function WinnerDecor({ f }: { f: ShareFrame }) {
  const id = useSvgId("wd");
  const { W, H, t } = f;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.sigA} stopOpacity={t.dark ? 0.5 : 0.22} />
          <Stop offset="1" stopColor={t.sigB} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Polygon points={`0,0 ${W},0 ${W},${H * 0.42} 0,${H * 0.62}`} fill={`url(#${id})`} />
    </Svg>
  );
}

/** (d) Kazanan — kazanan takım afişi (beraberlikte iki arma). */
function ResultWinner({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const h = d.homeScore ?? 0;
  const a = d.awayScore ?? 0;
  const draw = h === a;
  const winner = h >= a ? d.home : d.away;
  const loser = h >= a ? d.away : d.home;
  const big = story ? 150 : 100;
  return (
    <Poster f={f} mood="split" title={d.league} meta={meta(d)} footer={d.footer} decor={<WinnerDecor f={f} />}>
      <Spacer f={f} grow={story ? 0.7 : 0.2} />
      {draw ? (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: u(14) }}>
          <Crest f={f} logo={d.home.logo} name={d.home.name} size={big * 0.75} halo />
          <Crest f={f} logo={d.away.logo} name={d.away.name} size={big * 0.75} halo />
        </View>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Crest f={f} logo={winner.logo} name={winner.name} size={big} halo />
        </View>
      )}
      <View style={{ alignItems: "center", marginTop: u(story ? 22 : 10) }}>
        <CText f={f} k="poster" scale={story ? 1.05 : 0.78} align="center">
          {draw ? "BERABERE" : "KAZANDI"}
        </CText>
        {draw ? null : (
          <FitName f={f} k="hero" text={winner.name} room={18} caps lines={2} scale={story ? 1 : 0.82} color={t.accent} style={{ marginTop: u(4) }} />
        )}
      </View>
      <Spacer f={f} grow={0.5} min={story ? 16 : 8} />
      <View style={{ alignItems: "center" }}>
        <FillBox f={f} radius={24} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: u(20), paddingVertical: u(story ? 10 : 6), gap: u(12) }}>
          <CText f={f} k="score" scale={story ? 0.62 : 0.48} color={t.onFill}>
            {h} – {a}
          </CText>
        </FillBox>
        {draw ? (
          <FitName f={f} k="body" text={`${d.home.name} – ${d.away.name}`} room={40} lines={2} color={t.inkSoft} style={{ marginTop: u(10) }} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: u(8), marginTop: u(story ? 12 : 8), maxWidth: "100%" }}>
            <CText f={f} k="body" color={t.inkMuted}>rakip</CText>
            <Crest f={f} logo={loser.logo} name={loser.name} size={story ? 26 : 20} />
            <FitName f={f} k="row" text={loser.name} room={24} lines={1} align="left" color={t.inkSoft} style={{ flexShrink: 1 }} />
          </View>
        )}
      </View>
      <Spacer f={f} />
      <View style={{ alignItems: "center" }}>
        <WhenWhere f={f} d={d} />
      </View>
    </Poster>
  );
}

/** (e) Maçın yıldızı — oyuncu portresi afişi. */
function ResultStar({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const mvp = d.mvp;
  if (!mvp) return null;
  const { first, last } = splitName(mvp.name);
  return (
    <Poster f={f} mood="center" title={d.league} meta={meta(d)} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.5 : 0.5} />
      <View style={{ flexDirection: story ? "column" : "row", alignItems: "center", gap: u(story ? 0 : 16) }}>
        <View style={{ alignItems: "center" }}>
          <Halo f={f} size={story ? 300 : 190} color={t.gold[1]} power={0.6} />
          <Portrait f={f} image={mvp.image} name={mvp.name} size={story ? 176 : 118} ring="gold" halo />
        </View>
        <View style={{ alignItems: story ? "center" : "flex-start", flex: story ? undefined : 1, marginTop: u(story ? 18 : 0) }}>
          <FillBox f={f} radius={14} tone="gold" style={{ paddingHorizontal: u(10), paddingVertical: u(4) }}>
            <Overline f={f} color={t.medalInk}>Maçın yıldızı</Overline>
          </FillBox>
          {first ? (
            <FitName f={f} k="hero" text={first} room={18} lines={1} caps scale={story ? 0.72 : 0.6} color={t.inkSoft} align={story ? "center" : "left"} style={{ marginTop: u(10) }} />
          ) : null}
          <FitName f={f} k="poster" text={last} room={story ? 9 : 7} lines={1} caps scale={story ? 0.82 : 0.6} align={story ? "center" : "left"} min={0.45} />
          {mvp.team ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: u(6), marginTop: u(6) }}>
              <Crest f={f} logo={mvp.team.logo} name={mvp.team.name} size={18} />
              <FitName f={f} k="row" text={mvp.team.name} room={24} lines={1} color={t.inkSoft} align="left" />
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: u(8), marginTop: u(story ? 22 : 14) }}>
        <StatTile f={f} value={mvp.goals} label="Gol" scale={story ? 1 : 0.8} />
        <StatTile f={f} value={mvp.assists} label="Asist" scale={story ? 1 : 0.8} />
        {mvp.rating ? (
          <StatTile f={f} value={mvp.rating.toFixed(1)} label="Puan" accent={t.gold[0]} scale={story ? 1 : 0.8} />
        ) : (
          <StatTile f={f} value={mvp.goals + mvp.assists} label="Gol + Asist" accent={t.gold[0]} scale={story ? 1 : 0.8} />
        )}
      </View>
      <Spacer f={f} />
      <Glass f={f} radius={16} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: u(12), paddingVertical: u(story ? 10 : 7), gap: u(8) }}>
        <Crest f={f} logo={d.home.logo} name={d.home.name} size={22} />
        <FitName f={f} k="row" text={d.home.name} room={13} lines={1} caps align="right" style={{ flex: 1 }} />
        <CText f={f} k="numStrong" scale={1.15}>
          {d.homeScore ?? "-"}–{d.awayScore ?? "-"}
        </CText>
        <FitName f={f} k="row" text={d.away.name} room={13} lines={1} caps align="left" style={{ flex: 1 }} />
        <Crest f={f} logo={d.away.logo} name={d.away.name} size={22} />
      </Glass>
    </Poster>
  );
}

/* ══════════════════════════ LİSTE ══════════════════════════ */

export function matchTemplates(d: MatchShareData): ShareTemplateDef[] {
  if (!d.finished) {
    return [
      { key: "afis", label: "Afiş", render: (f) => <MatchDayPoster f={f} d={d} /> },
      { key: "karsi", label: "Karşı karşıya", render: (f) => <MatchDaySplit f={f} d={d} /> },
    ];
  }
  const list: ShareTemplateDef[] = [
    { key: "sade", label: "Sade", render: (f) => <ResultMinimal f={f} d={d} /> },
    { key: "golculer", label: "Golcüler", render: (f) => <ResultScorers f={f} d={d} /> },
    { key: "kunye", label: "Künye", render: (f) => <ResultDetail f={f} d={d} /> },
    { key: "kazanan", label: d.homeScore === d.awayScore ? "Berabere" : "Kazanan", render: (f) => <ResultWinner f={f} d={d} /> },
  ];
  if (d.mvp) list.push({ key: "yildiz", label: "Maçın yıldızı", render: (f) => <ResultStar f={f} d={d} /> });
  return list;
}

