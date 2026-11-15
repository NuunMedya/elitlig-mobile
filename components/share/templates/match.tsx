/**
 * MAÇ ŞABLONLARI — maç günü ve maç sonucu.
 *
 *   Maç günü (oynanmamış):  Afiş · Karşı karşıya · Geri sayım
 *   Maç sonucu:  Skor   — Skor · Kazanan
 *                Detay  — Golcüler · Künye · İstatistik
 *                Oyuncu — Maçın yıldızı · Golcü
 *
 * Her şablon iki yerleşimle çizilir (`f.story`): Story dikey ritimle nefes
 * alır, Post aynı hiyerarşiyi sıkıştırır ve ikincil blokları bırakır.
 * Künye (logo | lig | şehir · sezon) ve alt bant Poster'dan gelir; şablon
 * yalnız gövdeyi çizer. Ev sahibi daima solda (A rengi), deplasman sağda.
 */

import React from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

import { clock, dayMonth, groupScorers, shortName, splitName, weekday, type ScorerGroup } from "@/lib/share/format";
import { alpha } from "@/lib/share/palette";
import { upperTR } from "@/theme";
import { Poster, Spacer } from "../canvas/Layout";
import { DuelRow, InfoStrip, ScoreText, TagPill, TeamColumn, type ShareTeamRef } from "../canvas/Kit";
import {
  CText,
  Crest,
  FillBox,
  FitName,
  Glass,
  Glyph,
  Halo,
  Kicker,
  Overline,
  Portrait,
  StatTile,
  useSvgId,
} from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";

export type { ShareTeamRef };

export interface MatchSharePlayer {
  name: string;
  image: string | null;
  goals: number;
  assists: number;
  rating: number | null;
  team: ShareTeamRef | null;
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
  mvp: MatchSharePlayer | null;
  /** Maçın öne çıkan oyuncuları (fotoğraf eşlemesi için; ilk sıradaki MVP). */
  players?: MatchSharePlayer[];
  stats: { label: string; home: number; away: number }[];
}

const meta = (d: MatchShareData) => [d.city, d.season].filter(Boolean).join(" · ");

/* ══════════════════════════ ORTAK PARÇALAR ══════════════════════════ */

/** Tarih · saat · saha satırı. */
function WhenWhere({ f, d, align = "center" }: { f: ShareFrame; d: MatchShareData; align?: "center" | "left" }) {
  const parts = [dayMonth(d.date), d.finished ? null : clock(d.time), d.venue].filter(Boolean).join("  ·  ");
  return <FitName f={f} k="body" text={parts} room={46} lines={2} color={f.t.inkMuted} align={align} min={0.8} />;
}

function scorerCap(f: ShareFrame, compact: boolean) {
  return f.story ? (compact ? 4 : 6) : compact ? 3 : 4;
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
    <View style={{ flex: 1, gap: f.u(compact ? 6 : 9), alignItems: right ? "flex-end" : "flex-start" }}>
      {shown.map((group) => (
        <View key={group.name + group.ownGoal} style={{ alignItems: right ? "flex-end" : "flex-start", maxWidth: "100%" }}>
          <View style={{ flexDirection: right ? "row-reverse" : "row", alignItems: "center", gap: f.u(5), maxWidth: "100%" }}>
            <Glyph f={f} name="football" size={compact ? 8 : 9} color={right ? f.t.sideB : f.t.sideA} />
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

/** Skor şeridi: arma · ad / skor / ad · arma. */
function ScoreStrip({ f, d, crest, scale, inner = 316 }: { f: ShareFrame; d: MatchShareData; crest: number; scale: number; inner?: number }) {
  const { u } = f;
  // Yan sütunlar sabit genişlikte: skor ne kadar büyük olursa olsun ad
  // sütunu daralmaz; skor ortadaki boşluğa sığacak kadar küçülür.
  const side = Math.max(crest + 16, 92);
  const h = d.homeScore ?? 0;
  const a = d.awayScore ?? 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ width: u(side), alignItems: "center", gap: u(6) }}>
        <Crest f={f} logo={d.home.logo} name={d.home.name} size={crest} />
        <FitName f={f} text={d.home.name} room={9.5} caps scale={0.8} color={h < a ? f.t.inkSoft : f.t.ink} />
      </View>
      <View style={{ flex: 1, height: u(crest), justifyContent: "center" }}>
        <ScoreText f={f} home={d.homeScore} away={d.awayScore} k="score" scale={scale} maxWidth={inner - side * 2 - 8} winnerOnly />
      </View>
      <View style={{ width: u(side), alignItems: "center", gap: u(6) }}>
        <Crest f={f} logo={d.away.logo} name={d.away.name} size={crest} />
        <FitName f={f} text={d.away.name} room={9.5} caps scale={0.8} color={a < h ? f.t.inkSoft : f.t.ink} />
      </View>
    </View>
  );
}

/** Maç sonucu cümlesi. */
function resultLine(d: MatchShareData): string {
  const h = d.homeScore ?? 0;
  const a = d.awayScore ?? 0;
  if (h === a) return "Puanlar paylaşıldı";
  return `${h > a ? d.home.name : d.away.name} kazandı`;
}

/** İki takımın küçük künyesi (yıldız ve golcü kartlarının altı). */
function MiniScoreBar({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, story } = f;
  return (
    <Glass f={f} radius={16} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: u(12), paddingVertical: u(story ? 10 : 7), gap: u(8) }}>
      <Crest f={f} logo={d.home.logo} name={d.home.name} size={22} />
      <FitName f={f} k="row" text={d.home.name} room={13} lines={1} caps align="right" style={{ flex: 1 }} />
      <CText f={f} k="numStrong" scale={1.2}>
        {d.homeScore ?? "-"} – {d.awayScore ?? "-"}
      </CText>
      <FitName f={f} k="row" text={d.away.name} room={13} lines={1} caps align="left" style={{ flex: 1 }} />
      <Crest f={f} logo={d.away.logo} name={d.away.name} size={22} />
    </Glass>
  );
}

/* ══════════════════════════ MAÇ GÜNÜ ══════════════════════════ */

/** (a) Afiş — dev "MAÇ GÜNÜ" başlığı, karşı karşıya armalar, tarih · saat · saha şeridi. */
function MatchDayPoster({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const crest = story ? 108 : 76;
  return (
    <Poster f={f} title={d.league} meta={meta(d)} footer={d.footer}>
      <View style={{ marginTop: u(story ? 14 : 2) }}>
        <Kicker f={f}>{weekday(d.date) || "Maç günü"}</Kicker>
        <CText f={f} k="poster" scale={story ? 0.84 : 0.62} style={{ marginTop: u(story ? 6 : 2) }}>
          MAÇ <CText f={f} k="poster" scale={story ? 0.84 : 0.62} color={t.accent}>GÜNÜ</CText>
        </CText>
      </View>

      <Spacer f={f} />

      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <TeamColumn f={f} team={d.home} size={crest} halo />
        <View style={{ height: u(crest), justifyContent: "center", alignItems: "center", paddingHorizontal: u(4) }}>
          <CText f={f} k="poster" scale={story ? 0.42 : 0.34} color={t.inkMuted}>VS</CText>
        </View>
        <TeamColumn f={f} team={d.away} size={crest} halo />
      </View>

      <Spacer f={f} />

      <InfoStrip
        f={f}
        pad={story ? 16 : 10}
        items={[
          ...(story ? [{ label: "Tarih", value: dayMonth(d.date) || "—", sub: weekday(d.date), icon: "calendar-outline" as const }] : []),
          { label: "Saat", value: clock(d.time) || "—", big: true, weight: 1.1, icon: "time-outline" as const },
          { label: "Saha", value: d.venue || "—", weight: 1.4, icon: "location-outline" as const },
        ]}
      />
    </Poster>
  );
}

/** (b) Karşı karşıya — diyagonal bölünmüş sahne, ortada eğik bant. */
function MatchDaySplit({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, W, story } = f;
  const crest = story ? 112 : 80;
  return (
    <Poster
      f={f}
      mood="split"
      title={d.league}
      meta={meta(d)}
      footer={d.venue}
      streaks={false}
      grid={false}
      decor={
        <>
          <SplitDecor f={f} d={d} />
          <View style={{ position: "absolute", left: u(14), top: u(story ? 130 : 76), width: W * 0.5, alignItems: "center", gap: u(8) }}>
            <Crest f={f} logo={d.home.logo} name={d.home.name} size={crest} halo haloColor={f.t.sideA} />
            <FitName f={f} text={d.home.name} room={13} caps />
          </View>
          <View style={{ position: "absolute", right: u(14), top: u(story ? 388 : 262), width: W * 0.5, alignItems: "center", gap: u(8) }}>
            <Crest f={f} logo={d.away.logo} name={d.away.name} size={crest} halo haloColor={f.t.sideB} />
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
  const cy = H * (story ? 0.55 : 0.55);
  const dy = H * (story ? 0.2 : 0.2);
  const bt = u(story ? 66 : 52);
  const L = cy + dy / 2;
  const R = cy - dy / 2;
  const angle = (Math.atan2(-dy, W) * 180) / Math.PI;
  return (
    <>
      <Svg width={W} height={H} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.sideA} stopOpacity={t.dark ? 0.26 : 0.14} />
            <Stop offset="1" stopColor={t.sideA} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}a`} x1="1" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={t.sideB} stopOpacity={t.dark ? 0.26 : 0.14} />
            <Stop offset="1" stopColor={t.sideB} stopOpacity={0} />
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
          <CText f={f} k="poster" scale={story ? 0.56 : 0.46} color={t.onFill}>MAÇ GÜNÜ</CText>
          <View style={{ width: u(5), height: u(5), borderRadius: u(3), backgroundColor: t.onFill }} />
          <CText f={f} k="poster" scale={story ? 0.56 : 0.46} color={t.onFill}>{clock(d.time)}</CText>
        </View>
        <Overline f={f} color={alpha(t.onFill, 0.9)} scale={story ? 1.05 : 0.9} style={{ marginTop: u(2) }}>
          {[weekday(d.date), dayMonth(d.date)].filter(Boolean).join(" · ")}
        </Overline>
      </View>
    </>
  );
}

/** Bugünden maç gününe kalan gün (yerel takvim). Geçmişse null. */
function daysUntil(date: string): number | null {
  const day = String(date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, dd] = day.split("-").map(Number);
  const target = new Date(y, m - 1, dd).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((target - today) / 86_400_000);
  return diff >= 0 ? diff : null;
}

/** (c) Geri sayım — "MAÇA 3 GÜN": dev rakam, küçük armalar, saat ve saha. */
function MatchCountdown({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const left = daysUntil(d.date);
  const big = left == null ? "" : left === 0 ? "BUGÜN" : left === 1 ? "YARIN" : String(left);
  const word = left != null && left > 1;
  return (
    <Poster f={f} mood="center" title={d.league} meta={meta(d)} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.7 : 0.3} />
      <View style={{ alignItems: "center" }}>
        <Kicker f={f} align="center">{word ? "Maça kalan" : "Maç günü"}</Kicker>
        <View style={{ alignItems: "center", justifyContent: "center", marginTop: u(story ? 6 : 0) }}>
          <Halo f={f} size={story ? 300 : 200} power={0.7} />
          <CText f={f} k="mega" scale={word ? (story ? 1.75 : 1.15) : story ? 0.62 : 0.5} align="center">
            {big}
          </CText>
        </View>
        {word ? (
          <CText f={f} k="poster" scale={story ? 0.62 : 0.46} color={t.accent} align="center" style={{ marginTop: u(story ? 2 : 0) }}>
            GÜN
          </CText>
        ) : null}
      </View>
      <Spacer f={f} grow={story ? 0.6 : 0.3} min={story ? 16 : 8} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: u(14) }}>
        <View style={{ alignItems: "flex-end", flex: 1, gap: u(6) }}>
          <Crest f={f} logo={d.home.logo} name={d.home.name} size={story ? 58 : 42} />
          <FitName f={f} k="row" text={d.home.name} room={16} caps lines={2} align="right" />
        </View>
        <CText f={f} k="numStrong" scale={1.1} color={t.inkMuted}>VS</CText>
        <View style={{ alignItems: "flex-start", flex: 1, gap: u(6) }}>
          <Crest f={f} logo={d.away.logo} name={d.away.name} size={story ? 58 : 42} />
          <FitName f={f} k="row" text={d.away.name} room={16} caps lines={2} align="left" />
        </View>
      </View>
      <Spacer f={f} grow={story ? 0.5 : 0.3} min={story ? 16 : 8} />
      <View style={{ alignItems: "center", gap: u(4) }}>
        <CText f={f} k="numStrong" scale={story ? 1.25 : 1.05}>
          {[dayMonth(d.date), clock(d.time)].filter(Boolean).join("  ·  ")}
        </CText>
        {d.venue ? <FitName f={f} k="body" text={d.venue} room={44} lines={1} color={t.inkMuted} /> : null}
      </View>
      <Spacer f={f} grow={0.4} />
    </Poster>
  );
}

/* ══════════════════════════ MAÇ SONUCU ══════════════════════════ */

/** (a) Skor — dev skor + armalar; kaybedenin rakamı sönük. */
function ResultMinimal({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const crest = story ? 92 : 62;
  const h = d.homeScore ?? 0;
  const a = d.awayScore ?? 0;
  return (
    <Poster f={f} mood="center" title={d.league} meta={meta(d)} footer={d.footer} tag="Maç sonu">
      <Spacer f={f} grow={story ? 0.8 : 0.4} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: u(12) }}>
        <TeamColumn f={f} team={d.home} size={crest} room={12} dim={h < a} halo={h > a} haloColor={t.sideA} />
        <TeamColumn f={f} team={d.away} size={crest} room={12} dim={a < h} halo={a > h} haloColor={t.sideB} />
      </View>
      <View style={{ marginTop: u(story ? 16 : 12) }}>
        <ScoreText f={f} home={d.homeScore} away={d.awayScore} scale={story ? 1 : 0.66} winnerOnly />
      </View>
      <View style={{ alignItems: "center", gap: u(8), marginTop: u(story ? 12 : 4) }}>
        <TagPill f={f} label={resultLine(d)} />
        <WhenWhere f={f} d={d} />
      </View>
      <Spacer f={f} />
    </Poster>
  );
}

/** (b) Golcüler — skor + dakikalarıyla gol atanlar. */
function ResultScorers({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const home = groupScorers(d.scorers.home);
  const away = groupScorers(d.scorers.away);
  const cap = scorerCap(f, false);
  return (
    <Poster f={f} mood="top" title={d.league} meta={meta(d)} footer={d.footer} tag="Maç sonu">
      <Spacer f={f} grow={story ? 0.35 : 0} />
      <View style={{ alignItems: "center", gap: u(4), marginTop: u(story ? 8 : 0) }}>
        <WhenWhere f={f} d={d} />
      </View>
      <View style={{ marginTop: u(story ? 18 : 8) }}>
        <ScoreStrip f={f} d={d} crest={story ? 72 : 52} scale={story ? 1 : 0.78} />
      </View>
      <Spacer f={f} grow={0.5} min={story ? 18 : 10} />
      <Glass f={f} radius={20} style={{ paddingHorizontal: u(16), paddingVertical: u(story ? 16 : 12) }}>
        <Kicker f={f} align="center" color={t.ink} style={{ marginBottom: u(story ? 14 : 9) }}>
          Goller
        </Kicker>
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

const STAT_ORDER = ["Goller", "Asistler", "Kurtarışlar", "Sarı Kart", "Kırmızı Kart"];
const LOWER_IS_BETTER = new Set(["Sarı Kart", "Kırmızı Kart"]);

function keyStats(d: MatchShareData, cap: number) {
  return d.stats
    .filter((row) => row.home + row.away > 0)
    .sort((a, b) => {
      const ia = STAT_ORDER.indexOf(a.label);
      const ib = STAT_ORDER.indexOf(b.label);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .slice(0, cap);
}

/** (c) Künye — skor + golcüler + maçın yıldızı + kısa istatistik. */
function ResultDetail({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const home = groupScorers(d.scorers.home);
  const away = groupScorers(d.scorers.away);
  const stats = keyStats(d, story ? 3 : 2);
  return (
    <Poster f={f} mood="low" title={d.league} meta={meta(d)} footer={d.footer} tag="Maç sonu">
      <Glass f={f} radius={22} strong style={{ paddingVertical: u(story ? 14 : 10), paddingHorizontal: u(8) }}>
        <View style={{ alignItems: "center", marginBottom: u(story ? 8 : 4) }}>
          <Overline f={f} color={t.inkMuted}>{[dayMonth(d.date), d.venue].filter(Boolean).join(" · ")}</Overline>
        </View>
        <ScoreStrip f={f} d={d} crest={story ? 54 : 40} scale={story ? 0.82 : 0.62} inner={300} />
        {home.length || away.length ? (
          <View style={{ flexDirection: "row", gap: u(12), marginTop: u(story ? 12 : 8), paddingHorizontal: u(8), paddingTop: u(story ? 10 : 8), borderTopWidth: Math.max(1, u(0.7)), borderTopColor: t.line }}>
            <ScorerColumn f={f} groups={home} align="left" cap={scorerCap(f, true)} compact />
            <ScorerColumn f={f} groups={away} align="right" cap={scorerCap(f, true)} compact />
          </View>
        ) : null}
      </Glass>

      {d.mvp ? (
        <FillBox f={f} radius={22} tone="soft" style={{ marginTop: u(story ? 10 : 8), flexDirection: "row", alignItems: "center", gap: u(12), padding: u(story ? 12 : 10), borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine }}>
          <Portrait f={f} image={d.mvp.image} name={d.mvp.name} size={story ? 58 : 46} ring="gold" />
          <View style={{ flex: 1 }}>
            <Overline f={f} color={t.goldText}>Maçın yıldızı</Overline>
            <FitName f={f} k="hero" text={d.mvp.name} room={16} lines={1} align="left" scale={story ? 0.76 : 0.66} min={0.6} style={{ marginTop: u(2) }} />
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
        <Glass f={f} radius={22} style={{ marginTop: u(story ? 10 : 8), padding: u(story ? 14 : 10), gap: u(story ? 10 : 7) }}>
          {stats.map((row) => (
            <DuelRow key={row.label} f={f} label={row.label} a={row.home} b={row.away} lowerIsBetter={LOWER_IS_BETTER.has(row.label)} thick={4} scale={story ? 0.9 : 0.75} />
          ))}
        </Glass>
      ) : null}
      <Spacer f={f} />
    </Poster>
  );
}

/** (d) İstatistik — skor şeridi + tüm sayısal karşılaştırma çubukları. */
function ResultStats({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const rows = keyStats(d, story ? 7 : 4);
  return (
    <Poster f={f} mood="top" title={d.league} meta={meta(d)} footer={d.footer} tag="Maç sonu">
      <Kicker f={f} style={{ marginTop: u(story ? 6 : 0) }}>Maç istatistikleri</Kicker>
      <View style={{ marginTop: u(story ? 16 : 8) }}>
        <ScoreStrip f={f} d={d} crest={story ? 60 : 44} scale={story ? 0.9 : 0.7} />
      </View>
      <Spacer f={f} grow={0.4} min={story ? 14 : 8} />
      <Glass f={f} radius={20} style={{ paddingHorizontal: u(16), paddingVertical: u(story ? 18 : 12), gap: u(story ? 16 : 10) }}>
        {rows.map((row) => (
          <DuelRow key={row.label} f={f} label={row.label} a={row.home} b={row.away} lowerIsBetter={LOWER_IS_BETTER.has(row.label)} scale={story ? 1 : 0.85} />
        ))}
      </Glass>
      <Spacer f={f} />
      <View style={{ alignItems: "center" }}>
        <CText f={f} k="body" color={t.inkMuted}>{[dayMonth(d.date), d.venue].filter(Boolean).join("  ·  ")}</CText>
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
          <Stop offset="0" stopColor={t.sigA} stopOpacity={t.dark ? 0.34 : 0.1} />
          <Stop offset="1" stopColor={t.sigB} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Polygon points={`0,0 ${W},0 ${W},${H * 0.42} 0,${H * 0.6}`} fill={`url(#${id})`} />
    </Svg>
  );
}

/** (e) Kazanan — kazanan takım afişi (beraberlikte iki arma). */
function ResultWinner({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const h = d.homeScore ?? 0;
  const a = d.awayScore ?? 0;
  const draw = h === a;
  const winner = h >= a ? d.home : d.away;
  const loser = h >= a ? d.away : d.home;
  const big = story ? 144 : 96;
  return (
    <Poster f={f} mood="split" title={d.league} meta={meta(d)} footer={d.footer} decor={<WinnerDecor f={f} />}>
      <Spacer f={f} grow={story ? 0.7 : 0.2} />
      {draw ? (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: u(14) }}>
          <Crest f={f} logo={d.home.logo} name={d.home.name} size={big * 0.72} halo haloColor={t.sideA} />
          <Crest f={f} logo={d.away.logo} name={d.away.name} size={big * 0.72} halo haloColor={t.sideB} />
        </View>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Crest f={f} logo={winner.logo} name={winner.name} size={big} halo />
        </View>
      )}
      <View style={{ alignItems: "center", marginTop: u(story ? 22 : 10) }}>
        <FitName f={f} k="poster" text={draw ? "BERABERE" : "GALİBİYET"} width={316} lines={1} scale={story ? 1 : 0.76} min={0.5} />
        {draw ? null : (
          <FitName f={f} k="hero" text={winner.name} room={18} caps lines={2} scale={story ? 1 : 0.82} color={t.accent} style={{ marginTop: u(4) }} />
        )}
      </View>
      <Spacer f={f} grow={0.5} min={story ? 16 : 8} />
      <View style={{ alignItems: "center" }}>
        <FillBox f={f} radius={24} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: u(22), paddingVertical: u(story ? 9 : 6) }}>
          <CText f={f} k="score" scale={story ? 0.6 : 0.46} color={t.onFill}>
            {h} – {a}
          </CText>
        </FillBox>
        {draw ? (
          <FitName f={f} k="body" text={`${d.home.name} – ${d.away.name}`} room={40} lines={2} color={t.inkSoft} style={{ marginTop: u(10) }} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: u(8), marginTop: u(story ? 12 : 8), maxWidth: "100%" }}>
            <CText f={f} k="body" color={t.inkMuted}>rakip</CText>
            <Crest f={f} logo={loser.logo} name={loser.name} size={story ? 24 : 20} />
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

/** Ortak oyuncu afişi: portre + ad + istatistik kutuları + maç künyesi. */
function PlayerHero({
  f,
  d,
  p,
  badge,
  tone,
  tiles,
  extra,
}: {
  f: ShareFrame;
  d: MatchShareData;
  p: MatchSharePlayer;
  badge: string;
  tone: "gold" | "sig";
  tiles: { value: string | number; label: string; accent?: boolean }[];
  extra?: React.ReactNode;
}) {
  const { u, t, story } = f;
  const { first, last } = splitName(p.name);
  const glow = tone === "gold" ? t.gold[1] : t.sigB;
  return (
    <Poster f={f} mood="center" title={d.league} meta={meta(d)} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.4 : 0.4} />
      <View style={{ flexDirection: story ? "column" : "row", alignItems: "center", gap: u(story ? 0 : 16) }}>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Halo f={f} size={story ? 290 : 190} color={glow} power={0.6} />
          <Portrait f={f} image={p.image} name={p.name} size={story ? 172 : 116} ring={tone === "gold" ? "gold" : "sig"} />
        </View>
        <View style={{ alignItems: story ? "center" : "flex-start", flex: story ? undefined : 1, marginTop: u(story ? 16 : 0) }}>
          <FillBox f={f} radius={14} tone={tone} style={{ paddingHorizontal: u(10), paddingVertical: u(4) }}>
            <Overline f={f} color={tone === "gold" ? t.medalInk : t.onFill}>{badge}</Overline>
          </FillBox>
          {first ? (
            <FitName f={f} k="hero" text={first} room={18} lines={1} caps scale={story ? 0.72 : 0.6} color={t.inkSoft} align={story ? "center" : "left"} style={{ marginTop: u(10) }} />
          ) : null}
          <FitName f={f} k="poster" text={last} room={story ? 9 : 7} lines={1} caps scale={story ? 0.82 : 0.6} align={story ? "center" : "left"} min={0.45} />
          {p.team ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: u(6), marginTop: u(6) }}>
              <Crest f={f} logo={p.team.logo} name={p.team.name} size={18} />
              <FitName f={f} k="row" text={p.team.name} room={24} lines={1} color={t.inkSoft} align="left" />
            </View>
          ) : null}
        </View>
      </View>
      {extra}
      <View style={{ flexDirection: "row", gap: u(8), marginTop: u(story ? 18 : 12) }}>
        {tiles.map((tile) => (
          <StatTile key={tile.label} f={f} value={tile.value} label={tile.label} accent={tile.accent ? (tone === "gold" ? t.goldText : t.accent) : undefined} scale={story ? 1 : 0.8} />
        ))}
      </View>
      <Spacer f={f} />
      <MiniScoreBar f={f} d={d} />
    </Poster>
  );
}

/** (f) Maçın yıldızı — oyuncu portresi afişi. */
function ResultStar({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const mvp = d.mvp;
  if (!mvp) return null;
  return (
    <PlayerHero
      f={f}
      d={d}
      p={mvp}
      badge="Maçın yıldızı"
      tone="gold"
      tiles={[
        { value: mvp.goals, label: "Gol" },
        { value: mvp.assists, label: "Asist" },
        mvp.rating ? { value: mvp.rating.toFixed(1), label: "Puan", accent: true } : { value: mvp.goals + mvp.assists, label: "Gol + Asist", accent: true },
      ]}
    />
  );
}

/** Maçın en golcüsü (en az bir gol); fotoğraf öne çıkan oyunculardan eşlenir. */
function topScorer(d: MatchShareData): { player: MatchSharePlayer; minutes: string[] } | null {
  const pick = (side: "home" | "away") => groupScorers(d.scorers[side].filter((line) => !line.ownGoal)).map((g) => ({ g, side }));
  const all = [...pick("home"), ...pick("away")].sort((a, b) => b.g.minutes.length - a.g.minutes.length);
  const best = all[0];
  if (!best) return null;
  const known = [...(d.players ?? []), ...(d.mvp ? [d.mvp] : [])].find((p) => p.name.trim().toLocaleLowerCase("tr-TR") === best.g.name.trim().toLocaleLowerCase("tr-TR"));
  return {
    player: {
      name: best.g.name,
      image: known?.image ?? null,
      goals: best.g.minutes.length,
      assists: known?.assists ?? 0,
      rating: known?.rating ?? null,
      team: best.side === "home" ? d.home : d.away,
    },
    minutes: best.g.minutes.filter(Boolean),
  };
}

/** Gol dakikaları zaman çizelgesi: 0'dan maç sonuna çizgi, her gol bir top. */
function GoalTimeline({ f, minutes }: { f: ShareFrame; minutes: string[] }) {
  const { u, t, story } = f;
  const values = minutes.map((m) => parseInt(m, 10)).filter((n) => Number.isFinite(n));
  const end = Math.max(50, ...values.map((n) => Math.ceil(n / 10) * 10));
  return (
    <View style={{ height: u(story ? 44 : 38), justifyContent: "center" }}>
      <View style={{ height: u(2), borderRadius: u(1), backgroundColor: t.line }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
        {[0, end / 2, end].map((tick, i) => (
          <CText
            key={tick}
            f={f}
            k="micro"
            color={t.inkMuted}
            style={{ position: "absolute", bottom: 0, left: i === 0 ? 0 : undefined, right: i === 2 ? 0 : undefined, alignSelf: i === 1 ? "center" : undefined, ...(i === 1 ? { left: "47%" } : null) }}
          >
            {`${Math.round(tick)}'`}
          </CText>
        ))}
        {values.map((n, i) => (
          <View key={`${n}${i}`} style={{ position: "absolute", left: `${(n / end) * 100}%`, top: 0, alignItems: "center", transform: [{ translateX: -u(11) }] }}>
            <View style={{ width: u(22), height: u(22), borderRadius: u(11), backgroundColor: t.glassStrong, borderWidth: Math.max(1, u(0.8)), borderColor: t.accent, alignItems: "center", justifyContent: "center" }}>
              <Glyph f={f} name="football" size={12} color={t.ink} />
            </View>
            <CText f={f} k="numStrong" scale={0.78} color={t.accent} style={{ marginTop: u(2) }}>{`${n}'`}</CText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** (g) Golcü — dev gol sayısı + portre; altında gol dakikalarının zaman çizelgesi. */
function ResultScorerCard({ f, d }: { f: ShareFrame; d: MatchShareData }) {
  const { u, t, story } = f;
  const top = topScorer(d);
  if (!top) return null;
  const p = top.player;
  const g = p.goals;
  const badge = g >= 4 ? `${g} gollük gece` : g === 3 ? "Hat-trick" : g === 2 ? "Çift gol" : "Golü attı";
  const { first, last } = splitName(p.name);
  return (
    <Poster f={f} mood="low" title={d.league} meta={meta(d)} footer={d.footer}>
      <Kicker f={f} style={{ marginTop: u(story ? 6 : 0) }}>{badge}</Kicker>
      <Spacer f={f} grow={0.3} min={story ? 10 : 4} />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <CText f={f} k="mega" scale={story ? 1.5 : 1.0} color={t.accent}>{g}</CText>
          <CText f={f} k="poster" scale={story ? 0.5 : 0.36} style={{ marginTop: -u(story ? 8 : 4) }}>GOL</CText>
        </View>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Halo f={f} size={story ? 250 : 170} color={t.sigB} power={0.6} />
          <Portrait f={f} image={p.image} name={p.name} size={story ? 158 : 112} />
        </View>
      </View>
      <View style={{ marginTop: u(story ? 16 : 8) }}>
        {first ? <FitName f={f} k="hero" text={first} width={316} lines={1} caps align="left" scale={story ? 0.72 : 0.6} color={t.inkSoft} /> : null}
        <FitName f={f} k="poster" text={last} width={316} lines={1} caps align="left" scale={story ? 0.86 : 0.62} min={0.45} />
        {p.team ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: u(6), marginTop: u(6) }}>
            <Crest f={f} logo={p.team.logo} name={p.team.name} size={18} />
            <FitName f={f} k="row" text={p.team.name} room={24} lines={1} color={t.inkSoft} align="left" />
          </View>
        ) : null}
      </View>
      {top.minutes.length ? (
        <View style={{ marginTop: u(story ? 20 : 10) }}>
          <GoalTimeline f={f} minutes={top.minutes} />
        </View>
      ) : null}
      <Spacer f={f} />
      <MiniScoreBar f={f} d={d} />
    </Poster>
  );
}

/* ══════════════════════════ LİSTE ══════════════════════════ */

export function matchTemplates(d: MatchShareData): ShareTemplateDef[] {
  if (!d.finished) {
    const list: ShareTemplateDef[] = [
      { key: "afis", label: "Afiş", group: "Maç günü", render: (f) => <MatchDayPoster f={f} d={d} /> },
      { key: "karsi", label: "Karşı karşıya", group: "Maç günü", render: (f) => <MatchDaySplit f={f} d={d} /> },
    ];
    if (daysUntil(d.date) != null) list.push({ key: "geri-sayim", label: "Geri sayım", group: "Maç günü", render: (f) => <MatchCountdown f={f} d={d} /> });
    return list;
  }
  const draw = d.homeScore === d.awayScore;
  const list: ShareTemplateDef[] = [
    { key: "sade", label: "Skor", group: "Skor", render: (f) => <ResultMinimal f={f} d={d} /> },
    { key: "kazanan", label: draw ? "Berabere" : "Kazanan", group: "Skor", render: (f) => <ResultWinner f={f} d={d} /> },
    { key: "golculer", label: "Golcüler", group: "Detay", render: (f) => <ResultScorers f={f} d={d} /> },
    { key: "kunye", label: "Künye", group: "Detay", render: (f) => <ResultDetail f={f} d={d} /> },
  ];
  if (keyStats(d, 9).length >= 2) list.push({ key: "istatistik", label: "İstatistik", group: "Detay", render: (f) => <ResultStats f={f} d={d} /> });
  if (d.mvp) list.push({ key: "yildiz", label: "Maçın yıldızı", group: "Oyuncu", render: (f) => <ResultStar f={f} d={d} /> });
  if (topScorer(d)) list.push({ key: "golcu", label: "Golcü", group: "Oyuncu", render: (f) => <ResultScorerCard f={f} d={d} /> });
  return list;
}
