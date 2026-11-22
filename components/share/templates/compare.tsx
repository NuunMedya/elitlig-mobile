/**
 * KARŞILAŞTIRMA ŞABLONLARI — oyuncu karşılaştırma ve takım H2H ekranları.
 *
 *   Karşılaştırma — Düello · Radar · Kim önde?
 *   Geçmiş        — Kafa kafaya (yalnız takımlar; aralarında maç varsa)
 *
 * TARAF DİLİ uygulamadaki düelloyla aynıdır: sol (A) daima `sideA`, sağ (B)
 * daima `sideB` boyanır (gece stilinde A camgöbeği, B mor). Önde olan
 * taraf dolu renkte, geride olan sönük. "Az olan iyi" metrikler (kart,
 * sıra) ters sayılır. Veri ekranın hesapladığı metriklerin aynısıdır;
 * şablon yeni sayı üretmez, yalnız düzenler.
 */

import React from "react";
import { View } from "react-native";

import { dayMonth, formLetters, splitName } from "@/lib/share/format";
import { alpha } from "@/lib/share/palette";
import { Poster, Spacer } from "../canvas/Layout";
import { DuelRow, Radar, ScoreText, SideKey, fmtNum, leader, type RadarAxis } from "../canvas/Kit";
import { CText, Crest, FitName, FormRow, Glass, Kicker, Overline, Portrait } from "../canvas/Primitives";
import type { ShareFrame, ShareTemplateDef } from "../canvas/types";

export interface CompareSide {
  name: string;
  /** Oyuncu fotoğrafı (oyuncu kıyasında). */
  image: string | null;
  /** Takım arması (takım kıyasında kahraman; oyuncuda takım rozeti). */
  crest: string | null;
  /** Alt satır: oyuncuda takım adı, takımda "3. sıra · 24 puan". */
  sub: string | null;
  /** Oyuncuda mevki. */
  role?: string | null;
  /** Son beş maç (G/B/M). */
  form?: string | null;
}

export interface CompareMetric {
  key: string;
  label: string;
  a: number;
  b: number;
  unit?: string;
  lowerIsBetter?: boolean;
  /** Skora sayılmaz (ör. bir tarafın verisi yok). */
  neutral?: boolean;
}

export interface CompareMeeting {
  id: number;
  date: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  /** A tarafının gözünden sonuç. */
  result: "G" | "B" | "M";
}

export interface CompareShareData {
  kind: "player" | "team";
  a: CompareSide;
  b: CompareSide;
  metrics: CompareMetric[];
  /** Metrik kümesinin adı: "Kariyer", "Bu sezon"… */
  caption: string | null;
  h2h?: {
    played: number;
    aWins: number;
    draws: number;
    bWins: number;
    aGoals: number;
    bGoals: number;
    recent: CompareMeeting[];
  } | null;
  league: string | null;
  season: string | null;
  city: string | null;
  footer: string | null;
}

const meta = (d: CompareShareData) => [d.city, d.season].filter(Boolean).join(" · ");
const kicker = (d: CompareShareData) => (d.kind === "player" ? "Oyuncu karşılaştırması" : "Takım karşılaştırması");

/** Skora sayılan metriklerde kim kaç kez önde. */
export function compareTally(metrics: CompareMetric[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const m of metrics) {
    if (m.neutral) continue;
    const w = leader(m.a, m.b, m.lowerIsBetter);
    if (w === "a") a += 1;
    else if (w === "b") b += 1;
  }
  return { a, b };
}

/* ══════════════════════════ ORTAK ══════════════════════════ */

/** Bir tarafın kahramanı: oyuncuda portre (taraf renginde halka), takımda arma. */
function Hero({ f, d, side, size }: { f: ShareFrame; d: CompareShareData; side: "a" | "b"; size: number }) {
  const s = d[side];
  const color = side === "a" ? f.t.sideA : f.t.sideB;
  return d.kind === "player" ? (
    <Portrait f={f} image={s.image} name={s.name} size={size} ringColor={color} halo />
  ) : (
    <Crest f={f} logo={s.crest} name={s.name} size={size * 0.86} halo haloColor={color} />
  );
}

/** Ad bloğu: oyuncuda ad (küçük) + soyad (büyük); takımda ad. Altında takım/sıra. */
function NameBlock({ f, d, side, align }: { f: ShareFrame; d: CompareShareData; side: "a" | "b"; align: "left" | "right" | "center" }) {
  const { u, t, story } = f;
  const s = d[side];
  const { first, last } = d.kind === "player" ? splitName(s.name) : { first: "", last: s.name };
  return (
    <View style={{ alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center", gap: u(2) }}>
      {first ? <FitName f={f} k="label" text={first} width={130} lines={1} caps align={align} color={t.inkSoft} scale={1.05} /> : null}
      <FitName f={f} k="hero" text={last} width={130} lines={2} caps align={align} scale={story ? 0.82 : 0.7} min={0.5} />
      {s.sub ? (
        <View style={{ flexDirection: align === "right" ? "row-reverse" : "row", alignItems: "center", gap: u(5), marginTop: u(2) }}>
          {d.kind === "player" && s.crest ? <Crest f={f} logo={s.crest} name={s.sub} size={13} /> : null}
          <FitName f={f} k="body" text={s.sub} width={110} lines={1} align={align} color={t.inkMuted} scale={0.92} />
        </View>
      ) : null}
    </View>
  );
}

/** Ortadaki metrik skoru: "5 – 2" + "METRİK" etiketi. */
function TallyBlock({ f, d, scale = 1 }: { f: ShareFrame; d: CompareShareData; scale?: number }) {
  const { u, t } = f;
  const tally = compareTally(d.metrics);
  return (
    <View style={{ alignItems: "center", gap: u(2) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: u(6 * scale) }}>
        <CText f={f} k="score" scale={0.62 * scale} color={tally.a >= tally.b ? t.sideA : alpha(t.sideA, 0.5)}>{tally.a}</CText>
        <CText f={f} k="score" scale={0.32 * scale} color={t.inkMuted}>–</CText>
        <CText f={f} k="score" scale={0.62 * scale} color={tally.b >= tally.a ? t.sideB : alpha(t.sideB, 0.5)}>{tally.b}</CText>
      </View>
      <Overline f={f} color={t.inkMuted} scale={0.85}>Metrik</Overline>
    </View>
  );
}

/* ══════════════════════════ DÜELLO ══════════════════════════ */

/** (a) Düello — iki kahraman karşı karşıya, ortada skor; altında metrik çubukları. */
function CompareDuel({ f, d }: { f: ShareFrame; d: CompareShareData }) {
  const { u, t, story } = f;
  const rows = d.metrics.slice(0, story ? 6 : 4);
  const size = story ? 90 : 66;
  return (
    <Poster f={f} mood="split" title={d.league} meta={meta(d)} footer={d.footer}>
      <Kicker f={f} style={{ marginTop: u(story ? 6 : 0) }}>{kicker(d)}</Kicker>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: u(story ? 18 : 8) }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Hero f={f} d={d} side="a" size={size} />
        </View>
        <TallyBlock f={f} d={d} scale={story ? 1 : 0.8} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Hero f={f} d={d} side="b" size={size} />
        </View>
      </View>
      <View style={{ flexDirection: "row", marginTop: u(story ? 12 : 6), gap: u(12) }}>
        <View style={{ flex: 1 }}>
          <NameBlock f={f} d={d} side="a" align="center" />
        </View>
        <View style={{ flex: 1 }}>
          <NameBlock f={f} d={d} side="b" align="center" />
        </View>
      </View>
      <Spacer f={f} grow={0.4} min={story ? 14 : 8} />
      <Glass f={f} radius={20} style={{ paddingHorizontal: u(16), paddingVertical: u(story ? 14 : 11), gap: u(story ? 11 : 8) }}>
        {d.caption ? (
          <Overline f={f} color={t.inkMuted} align="center" scale={0.9}>{d.caption}</Overline>
        ) : null}
        {rows.map((m) => (
          <DuelRow key={m.key} f={f} label={m.label} a={m.a} b={m.b} unit={m.unit} lowerIsBetter={m.lowerIsBetter} neutral={m.neutral} scale={story ? 1 : 0.82} />
        ))}
      </Glass>
      <Spacer f={f} />
    </Poster>
  );
}

/* ══════════════════════════ RADAR ══════════════════════════ */

function radarAxes(d: CompareShareData, cap: number): RadarAxis[] {
  return d.metrics
    .filter((m) => !m.neutral && (m.a !== 0 || m.b !== 0))
    .slice(0, cap)
    .map((m) => ({ label: m.label, a: m.a, b: m.b, lowerIsBetter: m.lowerIsBetter }));
}

/** (b) Radar — iki taraf tek grafikte üst üste; altında anahtar rakamlar. */
function CompareRadar({ f, d }: { f: ShareFrame; d: CompareShareData }) {
  const { u, t, story } = f;
  const axes = radarAxes(d, story ? 7 : 6);
  const keys = d.metrics.filter((m) => !m.neutral).slice(0, 3);
  return (
    <Poster f={f} mood="center" title={d.league} meta={meta(d)} footer={d.footer}>
      <Kicker f={f} style={{ marginTop: u(story ? 6 : 0) }}>{kicker(d)}</Kicker>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: u(story ? 14 : 8), gap: u(10) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: u(8), flex: 1 }}>
          <Hero f={f} d={d} side="a" size={story ? 40 : 32} />
          <SideKey f={f} side="a" name={d.a.name} />
        </View>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: u(8), flex: 1 }}>
          <Hero f={f} d={d} side="b" size={story ? 40 : 32} />
          <SideKey f={f} side="b" name={d.b.name} align="right" />
        </View>
      </View>
      <Spacer f={f} grow={0.5} min={4} />
      <View style={{ alignItems: "center" }}>
        <Radar f={f} axes={axes} size={story ? 212 : 160} />
      </View>
      <Spacer f={f} grow={0.5} min={4} />
      {story ? (
        <View style={{ flexDirection: "row", gap: u(8) }}>
          {keys.map((m) => {
            const w = leader(m.a, m.b, m.lowerIsBetter);
            return (
              <Glass key={m.key} f={f} radius={14} style={{ flex: 1, paddingVertical: u(10), alignItems: "center", gap: u(4) }}>
                <Overline f={f} color={t.inkMuted} scale={0.85}>{m.label}</Overline>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: u(5) }}>
                  <CText f={f} k="numStrong" scale={1.25} color={w === "b" ? t.inkMuted : t.sideA}>{fmtNum(m.a, m.unit)}</CText>
                  <CText f={f} k="body" color={t.inkMuted}>·</CText>
                  <CText f={f} k="numStrong" scale={1.25} color={w === "a" ? t.inkMuted : t.sideB}>{fmtNum(m.b, m.unit)}</CText>
                </View>
              </Glass>
            );
          })}
        </View>
      ) : null}
      {d.caption ? (
        <CText f={f} k="body" color={t.inkMuted} align="center" style={{ marginTop: u(story ? 10 : 0) }}>
          {d.caption}
        </CText>
      ) : null}
      <Spacer f={f} grow={0.3} />
    </Poster>
  );
}

/* ══════════════════════════ KİM ÖNDE ══════════════════════════ */

/** (c) Kim önde? — dev metrik skoru, hüküm cümlesi, öne geçilen başlıca metrikler. */
function CompareVerdict({ f, d }: { f: ShareFrame; d: CompareShareData }) {
  const { u, t, story } = f;
  const tally = compareTally(d.metrics);
  const lead = tally.a === tally.b ? null : tally.a > tally.b ? "a" : "b";
  const winner = lead ? d[lead] : null;
  const edges = lead ? d.metrics.filter((m) => !m.neutral && leader(m.a, m.b, m.lowerIsBetter) === lead).slice(0, story ? 4 : 3) : [];
  const size = story ? 92 : 70;
  return (
    <Poster f={f} mood="split" title={d.league} meta={meta(d)} footer={d.footer}>
      <Spacer f={f} grow={story ? 0.5 : 0.2} />
      <Kicker f={f} align="center">{kicker(d)}</Kicker>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: u(story ? 20 : 10) }}>
        <View style={{ flex: 1, alignItems: "center", opacity: lead === "b" ? 0.6 : 1 }}>
          <Hero f={f} d={d} side="a" size={size} />
        </View>
        <View style={{ alignItems: "center", paddingHorizontal: u(4) }}>
          <ScoreText f={f} home={tally.a} away={tally.b} k="mega" scale={story ? 0.54 : 0.44} winnerOnly dashColor={t.inkMuted} />
        </View>
        <View style={{ flex: 1, alignItems: "center", opacity: lead === "a" ? 0.6 : 1 }}>
          <Hero f={f} d={d} side="b" size={size} />
        </View>
      </View>
      <View style={{ flexDirection: "row", marginTop: u(story ? 10 : 6), gap: u(12) }}>
        <View style={{ flex: 1 }}>
          <FitName f={f} k="name" text={d.a.name} width={130} lines={2} caps color={t.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <FitName f={f} k="name" text={d.b.name} width={130} lines={2} caps color={t.ink} />
        </View>
      </View>
      <View style={{ alignItems: "center", marginTop: u(story ? 20 : 10) }}>
        <FitName
          f={f}
          k="hero"
          text={winner ? `${winner.name} önde` : "Denk bir kıyas"}
          width={300}
          lines={2}
          scale={story ? 0.9 : 0.72}
          color={lead === "a" ? t.sideA : lead === "b" ? t.sideB : t.ink}
        />
        <CText f={f} k="body" color={t.inkMuted} align="center" style={{ marginTop: u(4) }}>
          {`Kazanılan metrik: ${tally.a} – ${tally.b}`}
        </CText>
      </View>
      {edges.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: u(6), marginTop: u(story ? 16 : 10) }}>
          {edges.map((m) => (
            <View
              key={m.key}
              style={{ flexDirection: "row", alignItems: "center", gap: u(6), paddingHorizontal: u(10), paddingVertical: u(5), borderRadius: u(14), backgroundColor: t.glass, borderWidth: Math.max(1, u(0.7)), borderColor: t.glassLine }}
            >
              <Overline f={f} color={t.inkSoft} scale={0.9}>{m.label}</Overline>
              <CText f={f} k="numStrong" scale={0.95} color={lead === "a" ? t.sideA : t.sideB}>
                {fmtNum(lead === "a" ? m.a : m.b, m.unit)}
              </CText>
            </View>
          ))}
        </View>
      ) : null}
      <Spacer f={f} />
      {d.caption ? <CText f={f} k="body" color={t.inkMuted} align="center">{d.caption}</CText> : null}
    </Poster>
  );
}

/* ══════════════════════════ KAFA KAFAYA ══════════════════════════ */

/** (d) Kafa kafaya — aralarındaki maçların dağılımı + son karşılaşmalar. */
function CompareHistory({ f, d }: { f: ShareFrame; d: CompareShareData }) {
  const { u, t, story } = f;
  const h = d.h2h;
  if (!h) return null;
  const recent = h.recent.slice(0, story ? 5 : 3);
  const total = Math.max(1, h.aWins + h.draws + h.bWins);
  const seg = (value: number, color: string) => (value > 0 ? <View style={{ flex: value / total, backgroundColor: color, borderRadius: u(4) }} /> : null);
  const resultColor = { G: t.win, B: t.draw, M: t.loss } as const;
  return (
    <Poster f={f} mood="top" title={d.league} meta={meta(d)} footer={d.footer}>
      <Kicker f={f} style={{ marginTop: u(story ? 6 : 0) }}>Kafa kafaya</Kicker>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: u(story ? 16 : 8) }}>
        <View style={{ flex: 1, alignItems: "center", gap: u(8) }}>
          <Hero f={f} d={d} side="a" size={story ? 82 : 60} />
          <FitName f={f} k="name" text={d.a.name} width={110} lines={2} caps scale={0.9} />
        </View>
        <View style={{ alignItems: "center", gap: u(2) }}>
          <ScoreText f={f} home={h.aWins} away={h.bWins} k="score" scale={story ? 0.82 : 0.62} winnerOnly dashColor={t.inkMuted} />
          <Overline f={f} color={t.inkMuted} scale={0.85}>{`${h.played} maç · ${h.draws} beraberlik`}</Overline>
        </View>
        <View style={{ flex: 1, alignItems: "center", gap: u(8) }}>
          <Hero f={f} d={d} side="b" size={story ? 82 : 60} />
          <FitName f={f} k="name" text={d.b.name} width={110} lines={2} caps scale={0.9} />
        </View>
      </View>

      <View style={{ marginTop: u(story ? 18 : 10), gap: u(6) }}>
        <View style={{ flexDirection: "row", height: u(8), gap: u(3) }}>
          {seg(h.aWins, t.sideA)}
          {seg(h.draws, alpha(t.ink, 0.28))}
          {seg(h.bWins, t.sideB)}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <CText f={f} k="body" color={t.inkMuted}>{`${h.aWins} galibiyet · ${h.aGoals} gol`}</CText>
          <CText f={f} k="body" color={t.inkMuted}>{`${h.bGoals} gol · ${h.bWins} galibiyet`}</CText>
        </View>
      </View>

      <Spacer f={f} grow={0.4} min={story ? 14 : 8} />
      {recent.length ? (
        <Glass f={f} radius={20} style={{ paddingVertical: u(4) }}>
          <Overline f={f} color={t.inkMuted} style={{ paddingHorizontal: u(14), paddingTop: u(10), paddingBottom: u(4) }} scale={0.9}>
            Son karşılaşmalar
          </Overline>
          {recent.map((m, index) => (
            <View
              key={m.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: u(8),
                height: u(story ? 40 : 30),
                paddingHorizontal: u(14),
                borderTopWidth: index ? Math.max(1, u(0.6)) : 0,
                borderTopColor: t.line,
              }}
            >
              <View style={{ width: u(3), height: u(story ? 18 : 14), borderRadius: u(2), backgroundColor: resultColor[m.result] }} />
              <CText f={f} k="body" color={t.inkMuted} scale={0.9} style={{ width: u(54) }}>{dayMonth(m.date)}</CText>
              <FitName f={f} k="row" text={m.homeName} width={84} lines={1} caps align="right" scale={0.92} min={0.5} style={{ flex: 1 }} />
              <CText f={f} k="numStrong" scale={1.05} style={{ minWidth: u(38), textAlign: "center" }}>
                {m.homeScore ?? "-"}–{m.awayScore ?? "-"}
              </CText>
              <FitName f={f} k="row" text={m.awayName} width={84} lines={1} caps align="left" scale={0.92} min={0.5} style={{ flex: 1 }} />
            </View>
          ))}
        </Glass>
      ) : null}
      {story && (formLetters(d.a.form).length || formLetters(d.b.form).length) ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: u(12) }}>
          <FormRow f={f} last5={d.a.form} size={14} />
          <Overline f={f} color={t.inkMuted} scale={0.85}>Son 5 maç</Overline>
          <FormRow f={f} last5={d.b.form} size={14} />
        </View>
      ) : null}
      <Spacer f={f} />
    </Poster>
  );
}

/* ══════════════════════════ LİSTE ══════════════════════════ */

export function compareTemplates(d: CompareShareData): ShareTemplateDef[] {
  const list: ShareTemplateDef[] = [];
  if (d.metrics.length) list.push({ key: "duello", label: "Düello", group: "Karşılaştırma", render: (f) => <CompareDuel f={f} d={d} /> });
  if (radarAxes(d, 8).length >= 3) list.push({ key: "radar", label: "Radar", group: "Karşılaştırma", render: (f) => <CompareRadar f={f} d={d} /> });
  if (d.metrics.some((m) => !m.neutral)) list.push({ key: "kim-onde", label: "Kim önde?", group: "Karşılaştırma", render: (f) => <CompareVerdict f={f} d={d} /> });
  if (d.h2h && d.h2h.played > 0) list.push({ key: "kafa-kafaya", label: "Kafa kafaya", group: "Geçmiş", render: (f) => <CompareHistory f={f} d={d} /> });
  return list;
}

