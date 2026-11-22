/**
 * SONSUZ / BİLGİ OYUNU ANA SAYFASI SAHNESİ — oyuna özel kahraman çizimi.
 *
 * 2026-11 v3: v2'nin ortadaki dev düz ikon madalyonu kaldırıldı. Her oyunun
 * evi artık katmanlı bir SVG sahnesi (özgün çizim):
 *   · slalom  gün batımında şehir sokağı; konilerin arasından top süren futbolcu
 *   · sektir  güneşli meydan; çeşme, ağaç, topu sektiren futbolcu
 *   · seri / kimbu / tahmin  TV stüdyosu: projektörler, dev ekran (oyuna göre
 *     "VS", gizemli siluet ya da 1·X·2 tablosu), kürsü ve buzzer
 *   · gunun   takvim sahnesi: bugünün yaprağı, kupa kaidesi, konfeti
 * Oyun adı kurdelesi (`GameTitle`) HUD'un altında durur. Sahne üst/alt şeritler ve yan raflar
 * arasındaki boş alana yerleşir (`top`, `bottom`, `side`); kısa ekranda
 * karakter küçülür. Tek SVG, ölçüye göre bir kez çizilir (useMemo); hareket yok.
 *
 * Bilgi kartları (rekor · bugünkü yıldız) artık sahnede değil, OYNA'nın
 * hemen üstünde (`HeroStats`, GameHome `abovePlay`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { HERO as H } from "@/lib/game/heroPalette";
import { HUB } from "@/lib/game/hubPalette";
import { fonts, radius, space, textScale, type } from "@/theme";

import { BallShape, StarArt, starPoints, useGid } from "./GameArt";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export interface ArenaStat {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

/** Başlık kurdelesinin yüksekliği. */
const TITLE_H = 46;

export const ArenaScene = React.memo(function ArenaScene({
  gameKey,
  title,
  top = 0,
  bottom = 0,
  side = 0,
}: {
  gameKey: string;
  /** Eski imza (kullanılmıyor). */
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  /** Eski imza: kartlar artık HeroStats ile OYNA'nın üstünde. */
  stats?: ArenaStat[];
  /** Üst ve alt şeridin yüksekliği, yan rafın genişliği. */
  top?: number;
  bottom?: number;
  side?: number;
}) {
  const { width: w, height: h } = useWindowDimensions();
  const fy0 = top + space.sm;
  const fy1 = h - bottom - space.sm;
  const scene = useMemo(() => {
    const box = { w, h, fy0, fy1, side };
    if (gameKey === "slalom") return <StreetScene b={box} />;
    if (gameKey === "sektir") return <PlazaScene b={box} />;
    if (gameKey === "gunun") return <CalendarScene b={box} />;
    return <StudioScene b={box} game={gameKey} />;
  }, [fy0, fy1, gameKey, h, side, w]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {scene}
    </View>
  );
});

/** Oyun adının kurdelesi (GameHome `eventBar`: HUD'un altında, tam genişlik). */
export function GameTitle({ gameKey, title }: { gameKey: string; title: string }) {
  const { width } = useWindowDimensions();
  const tone = HUB.game[gameKey] ?? HUB.game.uclu;
  return (
    <View style={styles.titleWrap} pointerEvents="none">
      <TitleRibbon width={Math.min(300, width - space.md * 2 - 40)} tone={tone} title={title} />
    </View>
  );
}

/* ═══════════════════════ BAŞLIK KURDELESİ ═══════════════════════ */

function TitleRibbon({ width, tone, title }: { width: number; tone: readonly string[]; title: string }) {
  const g = useGid("tr");
  const tail = 16;
  const bh = 38;
  return (
    <View style={{ width: width + tail * 2, height: TITLE_H }}>
      <Svg width={width + tail * 2} height={TITLE_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={g} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone[0]} />
            <Stop offset="1" stopColor={tone[tone.length - 1]} />
          </SvgGradient>
        </Defs>
        <Path d={`M 0 12 L ${tail + 8} 12 L ${tail + 8} ${bh + 6} L 0 ${bh + 6} L 8 ${(bh + 18) / 2} Z`} fill={tone[tone.length - 1]} stroke={H.ribbonEdge} strokeWidth={2.4} strokeLinejoin="round" />
        <Path d={`M ${width + tail * 2} 12 L ${width + tail - 8} 12 L ${width + tail - 8} ${bh + 6} L ${width + tail * 2} ${bh + 6} L ${width + tail * 2 - 8} ${(bh + 18) / 2} Z`} fill={tone[tone.length - 1]} stroke={H.ribbonEdge} strokeWidth={2.4} strokeLinejoin="round" />
        <Rect x={tail} y={2} width={width} height={bh} rx={12} fill={`url(#${g})`} stroke={H.ribbonEdge} strokeWidth={2.8} />
        <Rect x={tail + 5} y={5} width={width - 10} height={bh * 0.42} rx={9} fill={H.shineSoft} />
      </Svg>
      <View style={[styles.titleTextBox, { left: tail, width, height: bh + 4 }]}>
        <Text style={styles.title} numberOfLines={1} {...textScale.badge}>
          {title.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
    </View>
  );
}

/* ═══════════════════════ BİLGİ KARTLARI ═══════════════════════ */

/** Rekor · bugünkü yıldız: OYNA'nın üstünde iki lacivert kapsül kart. */
export function HeroStats({ stats }: { stats: ArenaStat[] }) {
  if (!stats.length) return null;
  return (
    <View style={styles.stats}>
      {stats.map((s) => (
        <View key={s.label} style={styles.stat}>
          <LinearGradient colors={H.card} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.statFill]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.statRim]} />
          <View style={styles.statIcon}>
            {s.icon === "star" ? (
              <StarArt size={30} />
            ) : s.icon === "trophy" ? (
              <TrophyMini />
            ) : (
              <View style={styles.statBubble}>
                <Ionicons name={s.icon} size={18} color={H.white} />
              </View>
            )}
          </View>
          <View style={styles.statTexts}>
            <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>{s.label}</Text>
            <Text style={styles.statValue} numberOfLines={1} {...textScale.badge}>{s.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function TrophyMini() {
  return (
    <Svg width={30} height={30} viewBox="0 0 48 48">
      <Path d="M 11 6 L 37 6 L 35 20 Q 33 30 24 31 Q 15 30 13 20 Z" fill={HUB.game.slalom[0]} stroke={H.outline} strokeWidth={2.6} strokeLinejoin="round" />
      <Path d="M 12 9 Q 3 9 5 17 Q 7 23 14 24 M 36 9 Q 45 9 43 17 Q 41 23 34 24" stroke={HUB.game.slalom[1]} strokeWidth={3} fill="none" />
      <Rect x={20} y={30} width={8} height={7} fill={HUB.game.slalom[1]} stroke={H.outline} strokeWidth={2} />
      <Rect x={13} y={37} width={22} height={7} rx={2} fill={HUB.game.slalom[1]} stroke={H.outline} strokeWidth={2.2} />
      <Polygon points={starPoints(24, 17, 6)} fill={H.white} opacity={0.85} />
    </Svg>
  );
}

/* ═══════════════════════ FUTBOLCU ═══════════════════════ */

type Pose = "dribble" | "juggle";

/** Uzuv: koyu kontur + renk (yuvarlak uçlu). */
function Limb({ d, color, w = 9 }: { d: string; color: string; w?: number }) {
  return (
    <G>
      <Path d={d} stroke={H.outline} strokeWidth={w + 3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

/**
 * Özgün futbolcu (iri baş, sevimli oran). Yerel kutu 120 × 170, ayaklar
 * y≈166. (x, y): ayakların ortası; hgt: ekrandaki boy.
 */
function Footballer({ x, y, hgt, pose, kit }: { x: number; y: number; hgt: number; pose: Pose; kit: { shirt: readonly [string, string]; trim: string; sock: string; shorts: string } }) {
  const g = useGid("fb");
  const s = hgt / 170;
  const dribble = pose === "dribble";
  // Bacaklar: [kalça → diz → bilek]
  // Sürerken: ön bacak yerde, arka bacak geriye kalkık. Sektirirken: duran bacak arkada, diz önde yukarı.
  const legBack = dribble ? "M 66 116 L 82 134 L 100 136" : "M 54 116 L 54 142 L 54 164";
  const legFront = dribble ? "M 54 116 L 46 140 L 38 162" : "M 68 116 L 90 108 L 88 134";
  const sockBack = dribble ? "M 84 135 L 100 136" : "M 54 148 L 54 164";
  const sockFront = dribble ? "M 44 146 L 38 162" : "M 89 118 L 88 134";
  const armBack = dribble ? "M 80 70 L 96 84 L 104 72" : "M 80 70 L 98 60 L 108 46";
  const armFront = dribble ? "M 40 70 L 28 88 L 36 100" : "M 40 70 L 22 80 L 10 70";
  const bootBack = dribble ? { cx: 104, cy: 136, r: -20 } : { cx: 52, cy: 166, r: 0 };
  const bootFront = dribble ? { cx: 34, cy: 165, r: 0 } : { cx: 93, cy: 136, r: 12 };
  return (
    <G transform={`translate(${x - 60 * s} ${y - 166 * s}) scale(${s})`}>
      <Defs>
        <SvgGradient id={`${g}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={kit.shirt[0]} />
          <Stop offset="1" stopColor={kit.shirt[1]} />
        </SvgGradient>
      </Defs>
      <Ellipse cx={dribble ? 56 : 62} cy={168} rx={dribble ? 50 : 34} ry={6} fill={H.shade} />
      {/* arka uzuvlar */}
      <Limb d={armBack} color={H.skin[1]} w={8.5} />
      <Limb d={legBack} color={H.skin[1]} />
      <Path d={sockBack} stroke={kit.sock} strokeWidth={9} strokeLinecap="round" />
      <Ellipse cx={bootBack.cx} cy={bootBack.cy} rx={9} ry={5.5} fill={H.boot} transform={`rotate(${bootBack.r} ${bootBack.cx} ${bootBack.cy})`} />
      {/* gövde (sürerken öne eğik) */}
      <G transform={dribble ? "rotate(9 60 112)" : undefined}>
        <Path d="M 40 104 L 80 104 L 84 124 L 62 126 L 60 120 L 58 126 L 36 124 Z" fill={kit.shorts} stroke={H.outline} strokeWidth={2.4} strokeLinejoin="round" />
        <Path d="M 36 70 Q 38 62 48 61 L 72 61 Q 82 62 84 70 L 82 108 L 38 108 Z" fill={`url(#${g}s)`} stroke={H.outline} strokeWidth={2.6} strokeLinejoin="round" />
        <Path d="M 52 61 Q 60 68 68 61" stroke={kit.trim} strokeWidth={3.5} fill="none" />
        <Path d="M 38 100 L 82 100" stroke={kit.trim} strokeWidth={3} opacity={0.8} />
        <SvgText x={60} y={92} fill={kit.trim} fontSize={18} fontFamily={fonts.bold} textAnchor="middle">
          10
        </SvgText>
        <Path d="M 42 66 Q 44 64 50 63 L 48 84 Z" fill={H.shineSoft} />
        {/* baş */}
        <Rect x={55} y={52} width={10} height={11} fill={H.skin[1]} stroke={H.outline} strokeWidth={2} />
        <Circle cx={62} cy={38} r={21} fill={H.skin[0]} stroke={H.outline} strokeWidth={2.6} />
        <Path d="M 41 36 Q 40 16 60 15 Q 80 14 83 32 Q 74 24 64 26 Q 54 22 48 30 Q 44 32 41 36 Z" fill={H.hair} stroke={H.outline} strokeWidth={2} strokeLinejoin="round" />
        <Circle cx={44} cy={42} r={4.5} fill={H.skin[1]} stroke={H.outline} strokeWidth={1.8} />
        <Ellipse cx={66} cy={40} rx={2.6} ry={3.4} fill={H.outline} />
        <Ellipse cx={77} cy={40} rx={2.4} ry={3.2} fill={H.outline} />
        <Circle cx={67} cy={39} r={0.9} fill={H.white} />
        <Path d="M 66 49 Q 72 53 77 48" stroke={H.outline} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Ellipse cx={56} cy={28} rx={6} ry={3} fill={H.shineSoft} />
      </G>
      {/* ön uzuvlar */}
      <Limb d={legFront} color={H.skin[0]} />
      <Path d={sockFront} stroke={kit.sock} strokeWidth={9} strokeLinecap="round" />
      <Ellipse cx={bootFront.cx} cy={bootFront.cy} rx={10} ry={5.5} fill={H.boot} />
      <Limb d={armFront} color={H.skin[0]} w={8.5} />
      {/* top */}
      {dribble ? (
        <BallShape cx={20} cy={157} r={10} />
      ) : (
        <G>
          <Path d="M 116 98 Q 124 78 112 62" stroke={H.white} strokeWidth={2.5} fill="none" strokeDasharray="4 5" opacity={0.9} />
          <Path d="M 82 100 Q 76 80 86 64" stroke={H.white} strokeWidth={2.5} fill="none" strokeDasharray="4 5" opacity={0.9} />
          <Ellipse cx={97} cy={104} rx={6} ry={2} fill={H.shade} />
          <BallShape cx={98} cy={84} r={11} />
        </G>
      )}
    </G>
  );
}

/* ═══════════════════════ SAHNELER ═══════════════════════ */

interface Box {
  w: number;
  h: number;
  /** Odak alanı (başlığın altı → alt şeridin üstü). */
  fy0: number;
  fy1: number;
  side: number;
}

/** Karakter boyu: boş alana göre (kısa ekranda küçülür). */
const heroHeight = (b: Box) => Math.max(110, Math.min((b.fy1 - b.fy0) * 0.62, b.w * 0.58, 300));

/* ─────────── Slalom: gün batımı sokağı ─────────── */

function StreetScene({ b }: { b: Box }) {
  const g = useGid("st");
  const S = H.street;
  const { w, h } = b;
  const hy = b.fy0 + (b.fy1 - b.fy0) * 0.3;
  const gy = b.fy1 - (b.fy1 - b.fy0) * 0.06;
  const ph = heroHeight(b);
  // Perspektif: t ∈ [0,1] ufuk → ön.
  const yAt = (t: number) => hy + (h - hy) * Math.pow(t, 1.25);
  const half = (t: number) => w * 0.05 + t * w * 0.62;
  const cones = [0.16, 0.26, 0.38, 0.52, 0.7].map((t, i) => ({ t, x: w / 2 + (i % 2 ? 1 : -1) * half(t) * 0.42, y: yAt(t) }));
  const rnd = (i: number) => ((Math.sin(i * 91.7) + 1) / 2);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id={`${g}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.sky[3]} />
          <Stop offset="0.45" stopColor={S.sky[2]} />
          <Stop offset="0.8" stopColor={S.sky[1]} />
          <Stop offset="1" stopColor={S.sky[0]} />
        </SvgGradient>
        <RadialGradient id={`${g}sun`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.3" stopColor={S.sunGlow} />
          <Stop offset="1" stopColor={S.sunClear} />
        </RadialGradient>
        <SvgGradient id={`${g}road`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.road[1]} />
          <Stop offset="1" stopColor={S.road[0]} />
        </SvgGradient>
        <RadialGradient id={`${g}lamp`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={S.lampGlow} />
          <Stop offset="1" stopColor={S.lampClear} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={hy + 2} fill={`url(#${g}sky)`} />
      <Circle cx={w / 2} cy={hy - 6} r={w * 0.34} fill={`url(#${g}sun)`} />
      <Circle cx={w / 2} cy={hy - 6} r={w * 0.11} fill={S.sun} />
      {/* uzak silüet */}
      {Array.from({ length: 14 }, (_, i) => {
        const bw = w / 12;
        const bh = 18 + rnd(i) * 60;
        return (
          <G key={`f${i}`}>
            <Rect x={i * bw - bw * 0.3} y={hy - bh} width={bw * 0.9} height={bh + 2} fill={S.far} />
            {bh > 40 ? <Rect x={i * bw} y={hy - bh + 8} width={3} height={3} fill={S.farWin} /> : null}
            {bh > 50 ? <Rect x={i * bw + 8} y={hy - bh + 18} width={3} height={3} fill={S.farWin} /> : null}
          </G>
        );
      })}
      {/* yol + kaldırımlar */}
      <Rect x={0} y={hy} width={w} height={h - hy} fill={S.sidewalk[1]} />
      <Path d={`M ${w / 2 - half(0)} ${hy} L ${w / 2 + half(0)} ${hy} L ${w / 2 + half(1.25)} ${h} L ${w / 2 - half(1.25)} ${h} Z`} fill={`url(#${g}road)`} />
      <Path d={`M ${w / 2 - half(0)} ${hy} L ${w / 2 - half(1.25)} ${h}`} stroke={S.curb} strokeWidth={5} />
      <Path d={`M ${w / 2 + half(0)} ${hy} L ${w / 2 + half(1.25)} ${h}`} stroke={S.curb} strokeWidth={5} />
      {[0.08, 0.2, 0.36, 0.56, 0.82].map((t, i) => {
        const y0 = yAt(t);
        const y1 = yAt(t + 0.06 + t * 0.05);
        const lw = 1.5 + t * 7;
        return <Path key={`d${i}`} d={`M ${w / 2 - lw} ${y0} L ${w / 2 + lw} ${y0} L ${w / 2 + lw * 1.15} ${y1} L ${w / 2 - lw * 1.15} ${y1} Z`} fill={S.roadLine} opacity={0.85} />;
      })}
      {/* yan binalar (yakın) */}
      {[
        { x: -w * 0.04, bw: w * 0.24, top: hy - (b.fy1 - b.fy0) * 0.28, c: 0 },
        { x: w * 0.16, bw: w * 0.12, top: hy - (b.fy1 - b.fy0) * 0.12, c: 1 },
        { x: w * 0.8, bw: w * 0.26, top: hy - (b.fy1 - b.fy0) * 0.3, c: 2 },
        { x: w * 0.71, bw: w * 0.11, top: hy - (b.fy1 - b.fy0) * 0.14, c: 3 },
      ].map((bd, i) => {
        const bottom = hy + (i % 2 ? 6 : 26);
        const rows = Math.max(2, Math.floor((bottom - bd.top - 14) / 18));
        return (
          <G key={`b${i}`}>
            <Rect x={bd.x} y={bd.top} width={bd.bw} height={bottom - bd.top} fill={S.mid[bd.c]} stroke={H.outline} strokeWidth={2} />
            <Rect x={bd.x - 3} y={bd.top - 6} width={bd.bw + 6} height={8} fill={S.curb} stroke={H.outline} strokeWidth={2} />
            {Array.from({ length: rows }, (_, r) =>
              [0, 1, 2].map((c) => {
                const wx = bd.x + 8 + c * ((bd.bw - 16) / 3);
                if (wx + 8 > bd.x + bd.bw - 4) return null;
                return <Rect key={`${r}${c}`} x={wx} y={bd.top + 10 + r * 18} width={Math.min(12, (bd.bw - 16) / 3 - 4)} height={10} rx={1.5} fill={(r + c + i) % 3 ? S.midWin : S.midWinOff} />;
              })
            )}
          </G>
        );
      })}
      {/* sokak lambaları */}
      {[0.22, 0.55].map((t, i) =>
        [-1, 1].map((sgn) => {
          const lx = w / 2 + sgn * (half(t) + 10 + t * 20);
          const ly = yAt(t);
          const lh = 30 + t * 90;
          return (
            <G key={`l${i}${sgn}`}>
              <Circle cx={lx} cy={ly - lh} r={14 + t * 30} fill={`url(#${g}lamp)`} />
              <Rect x={lx - 1.5 - t} y={ly - lh} width={3 + t * 2} height={lh} fill={S.lamp} />
              <Circle cx={lx} cy={ly - lh} r={3 + t * 4} fill={S.sun} stroke={S.lamp} strokeWidth={1.5} />
            </G>
          );
        })
      )}
      {/* koniler */}
      {cones.map((c, i) => {
        const cs = 0.35 + c.t * 1.15;
        return (
          <G key={`c${i}`} transform={`translate(${c.x} ${c.y}) scale(${cs})`}>
            <Ellipse cx={0} cy={1} rx={12} ry={3} fill={H.shade} />
            <Rect x={-11} y={-4} width={22} height={5} rx={1.5} fill={S.cone[1]} stroke={H.outline} strokeWidth={1.6} />
            <Path d="M 0 -26 L 8 -4 L -8 -4 Z" fill={S.cone[0]} stroke={H.outline} strokeWidth={1.8} strokeLinejoin="round" />
            <Path d="M -4 -15 L 4 -15 L 5.5 -10 L -5.5 -10 Z" fill={S.coneStripe} />
          </G>
        );
      })}
      <Footballer x={w / 2 + ph * 0.06} y={gy} hgt={ph} pose="dribble" kit={H.kit.slalom} />
    </Svg>
  );
}

/* ─────────── Top Sektir: güneşli meydan ─────────── */

function PlazaScene({ b }: { b: Box }) {
  const g = useGid("pl");
  const P = H.plaza;
  const { w, h } = b;
  const hy = b.fy0 + (b.fy1 - b.fy0) * 0.42;
  const gy = b.fy1 - (b.fy1 - b.fy0) * 0.05;
  const ph = heroHeight(b);
  const fw = w / 4;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id={`${g}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={P.sky[0]} />
          <Stop offset="0.7" stopColor={P.sky[1]} />
          <Stop offset="1" stopColor={P.sky[2]} />
        </SvgGradient>
        <SvgGradient id={`${g}floor`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={P.tiles[1]} />
          <Stop offset="1" stopColor={P.tiles[0]} />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={hy} fill={`url(#${g}sky)`} />
      {[
        [0.18, 0.18, 1],
        [0.72, 0.1, 1.3],
        [0.5, 0.3, 0.8],
      ].map(([cx, cy, sc], i) => (
        <G key={`cl${i}`} transform={`translate(${w * cx} ${b.fy0 + (hy - b.fy0) * cy}) scale(${sc})`}>
          <Ellipse cx={0} cy={0} rx={34} ry={11} fill={P.cloud} />
          <Circle cx={-12} cy={-8} r={12} fill={P.cloud} />
          <Circle cx={8} cy={-11} r={15} fill={P.cloud} />
        </G>
      ))}
      {/* cepheler */}
      {[0, 1, 2, 3].map((i) => {
        const fh = (hy - b.fy0) * (0.62 + ((i * 37) % 10) / 40);
        const x = i * fw;
        return (
          <G key={`f${i}`}>
            <Rect x={x} y={hy - fh} width={fw + 1} height={fh} fill={P.facade[i]} stroke={H.outline} strokeWidth={2} />
            <Path d={`M ${x - 2} ${hy - fh} L ${x + fw / 2} ${hy - fh - 18} L ${x + fw + 2} ${hy - fh} Z`} fill={P.roof} stroke={H.outline} strokeWidth={2} strokeLinejoin="round" />
            {[0, 1].map((r) =>
              [0, 1].map((c) => (
                <G key={`${r}${c}`}>
                  <Rect x={x + fw * 0.18 + c * fw * 0.4} y={hy - fh + 14 + r * 26} width={fw * 0.24} height={16} rx={6} fill={P.window} stroke={P.windowFrame} strokeWidth={2} />
                </G>
              ))
            )}
            <Path d={`M ${x + fw * 0.3} ${hy} L ${x + fw * 0.3} ${hy - 22} Q ${x + fw * 0.5} ${hy - 36} ${x + fw * 0.7} ${hy - 22} L ${x + fw * 0.7} ${hy} Z`} fill={P.arch} stroke={H.outline} strokeWidth={1.8} />
            <Rect x={x} y={hy - fh} width={fw * 0.12} height={fh} fill={P.facadeShade} />
          </G>
        );
      })}
      {/* meydan zemini */}
      <Rect x={0} y={hy} width={w} height={h - hy} fill={`url(#${g}floor)`} />
      {Array.from({ length: 11 }, (_, i) => {
        const t = (i + 1) / 11;
        const y = hy + (h - hy) * t * t;
        return <Path key={`hl${i}`} d={`M 0 ${y} L ${w} ${y}`} stroke={P.tileLine} strokeWidth={1.2} />;
      })}
      {Array.from({ length: 13 }, (_, i) => {
        const x = (i - 6) * (w / 6);
        return <Path key={`vl${i}`} d={`M ${w / 2 + (i - 6) * 10} ${hy} L ${w / 2 + x * 1.8} ${h}`} stroke={P.tileLine} strokeWidth={1.2} />;
      })}
      {/* çeşme */}
      <G transform={`translate(${w * 0.17} ${hy + 22})`}>
        <Ellipse cx={0} cy={6} rx={46} ry={12} fill={H.shade} />
        <Ellipse cx={0} cy={0} rx={44} ry={12} fill={P.fountain[1]} stroke={H.outline} strokeWidth={2} />
        <Ellipse cx={0} cy={-3} rx={38} ry={8} fill={P.water[1]} />
        <Rect x={-6} y={-34} width={12} height={32} fill={P.fountain[0]} stroke={H.outline} strokeWidth={2} />
        <Ellipse cx={0} cy={-34} rx={18} ry={5} fill={P.fountain[0]} stroke={H.outline} strokeWidth={2} />
        <Path d="M 0 -38 Q -16 -58 -26 -8 M 0 -38 Q 16 -58 26 -8" stroke={P.water[0]} strokeWidth={3} fill="none" />
        <Path d="M 0 -38 L 0 -54" stroke={P.water[0]} strokeWidth={4} strokeLinecap="round" />
      </G>
      {/* ağaç */}
      <G transform={`translate(${w * 0.86} ${hy + 30})`}>
        <Ellipse cx={0} cy={2} rx={26} ry={6} fill={H.shade} />
        <Path d="M -5 0 L -4 -36 L 4 -36 L 5 0 Z" fill={P.trunk} stroke={H.outline} strokeWidth={1.8} />
        <Circle cx={0} cy={-58} r={28} fill={P.tree[2]} stroke={H.outline} strokeWidth={2} />
        <Circle cx={-14} cy={-48} r={18} fill={P.tree[1]} stroke={H.outline} strokeWidth={1.8} />
        <Circle cx={12} cy={-50} r={18} fill={P.tree[1]} stroke={H.outline} strokeWidth={1.8} />
        <Circle cx={-2} cy={-70} r={18} fill={P.tree[0]} stroke={H.outline} strokeWidth={1.8} />
      </G>
      {/* güvercinler */}
      {[
        [0.3, 14],
        [0.35, 20],
      ].map(([bx, dy], i) => (
        <G key={`p${i}`} transform={`translate(${w * bx} ${hy + dy})`}>
          <Ellipse cx={0} cy={0} rx={6} ry={4} fill={P.bird} />
          <Circle cx={5} cy={-3} r={2.6} fill={P.bird} />
        </G>
      ))}
      <Footballer x={w / 2} y={gy} hgt={ph} pose="juggle" kit={H.kit.sektir} />
    </Svg>
  );
}

/* ─────────── Bilgi yarışmaları: TV stüdyosu ─────────── */

function StudioScene({ b, game }: { b: Box; game: string }) {
  const g = useGid("tv");
  const T = H.studio;
  const { w, h } = b;
  const fh = b.fy1 - b.fy0;
  const sw = Math.min(w - b.side * 2 - 12, 330);
  const sh = Math.min(sw * 0.58, fh * 0.36);
  const sx = w / 2 - sw / 2;
  const sy = b.fy0 + Math.max(6, fh * 0.03);
  const tone = HUB.game[game] ?? HUB.game.kimbu;
  const pw = Math.min(150, w * 0.38, fh * 0.3);
  const pBottom = b.fy1 - fh * 0.05;
  const pTop = pBottom - Math.min(fh * 0.3, pw * 1.05);
  // Uzun ekranda yanlarda iki yarışmacı kürsüsü (sahne boş kalmasın).
  const sidePods = fh > 470;
  const stageY = pBottom - 2;
  const stageRx = Math.min(w * 0.46, 220);
  const stageRy = Math.max(18, fh * 0.07);
  const floorY = sy + sh + Math.max(14, fh * 0.05);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id={`${g}bg`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={T.back[2]} />
          <Stop offset="0.55" stopColor={T.back[1]} />
          <Stop offset="1" stopColor={T.back[0]} />
        </SvgGradient>
        <SvgGradient id={`${g}beam`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={T.beam} />
          <Stop offset="1" stopColor={T.beamClear} />
        </SvgGradient>
        <SvgGradient id={`${g}scr`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={T.screen[0]} />
          <Stop offset="1" stopColor={T.screen[1]} />
        </SvgGradient>
        <SvgGradient id={`${g}floor`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={T.floor[1]} />
          <Stop offset="1" stopColor={T.floor[0]} />
        </SvgGradient>
        <SvgGradient id={`${g}pod`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tone[0]} />
          <Stop offset="1" stopColor={tone[tone.length - 1]} />
        </SvgGradient>
        <SvgGradient id={`${g}stage`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={T.podium[0]} />
          <Stop offset="1" stopColor={T.podium[2]} />
        </SvgGradient>
        <RadialGradient id={`${g}glow`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={T.screenGlow} />
          <Stop offset="1" stopColor={T.beamClear} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${g}bg)`} />
      {/* LED kemer + yan sütunlar */}
      <Path d={`M ${sx - 26} ${floorY} L ${sx - 26} ${sy + 20} Q ${w / 2} ${sy - 46} ${sx + sw + 26} ${sy + 20} L ${sx + sw + 26} ${floorY}`} stroke={T.neonPink} strokeWidth={4} fill="none" opacity={0.85} />
      <Path d={`M ${sx - 16} ${floorY} L ${sx - 16} ${sy + 24} Q ${w / 2} ${sy - 32} ${sx + sw + 16} ${sy + 24} L ${sx + sw + 16} ${floorY}`} stroke={T.neon} strokeWidth={2.5} fill="none" opacity={0.7} />
      {/* zemin: parlak sahne, neon ızgara */}
      <Rect x={0} y={floorY} width={w} height={h - floorY} fill={`url(#${g}floor)`} />
      {Array.from({ length: 9 }, (_, i) => (
        <Path key={`gl${i}`} d={`M ${w / 2 + (i - 4) * 18} ${floorY} L ${w / 2 + (i - 4) * w * 0.32} ${h}`} stroke={T.neon} strokeWidth={1} opacity={0.14} />
      ))}
      {[0.15, 0.35, 0.6, 0.9].map((f, i) => (
        <Path key={`gh${i}`} d={`M 0 ${floorY + (h - floorY) * f * f} L ${w} ${floorY + (h - floorY) * f * f}`} stroke={T.neon} strokeWidth={1} opacity={0.12} />
      ))}
      {/* projektör hüzmeleri */}
      {[0.08, 0.3, 0.7, 0.92].map((f, i) => {
        const lx = w * f;
        const tx = w / 2 + (0.5 - f) * w * 0.5;
        return <Path key={`bm${i}`} d={`M ${lx - 6} ${b.fy0 - 30} L ${lx + 6} ${b.fy0 - 30} L ${tx + 70} ${stageY + 10} L ${tx - 70} ${stageY + 10} Z`} fill={`url(#${g}beam)`} />;
      })}
      {/* dev ekran */}
      <Ellipse cx={w / 2} cy={sy + sh / 2} rx={sw * 0.8} ry={sh} fill={`url(#${g}glow)`} />
      <Rect x={sx - 7} y={sy - 7} width={sw + 14} height={sh + 14} rx={16} fill={T.screenFrame} stroke={T.truss} strokeWidth={2} />
      <Rect x={sx} y={sy} width={sw} height={sh} rx={11} fill={`url(#${g}scr)`} />
      {Array.from({ length: Math.floor(sh / 7) }, (_, i) => (
        <Rect key={`sl${i}`} x={sx} y={sy + i * 7} width={sw} height={1.5} fill={H.white} opacity={0.05} />
      ))}
      <ScreenContent game={game} x={sx} y={sy} w={sw} h={sh} />
      <Path d={`M ${sx + 8} ${sy + 6} L ${sx + sw * 0.45} ${sy + 6} L ${sx + sw * 0.25} ${sy + sh * 0.5} L ${sx + 8} ${sy + sh * 0.5} Z`} fill={H.white} opacity={0.06} />
      {/* seyirci ışık noktaları */}
      {Array.from({ length: 24 }, (_, i) => {
        const bx = (i / 23) * w + ((i * 13) % 9) - 4;
        const by = pBottom + 26 + (i % 2) * 8;
        return <Circle key={`bk${i}`} cx={bx} cy={by - 30 - ((i * 17) % 40)} r={2 + (i % 3)} fill={T.bokeh[i % T.bokeh.length]} />;
      })}
      {/* sahne platformu */}
      <Ellipse cx={w / 2} cy={stageY + 6} rx={stageRx + 6} ry={stageRy + 6} fill={H.shade} />
      <Ellipse cx={w / 2} cy={stageY} rx={stageRx} ry={stageRy} fill={`url(#${g}stage)`} stroke={H.outline} strokeWidth={2.5} />
      <Ellipse cx={w / 2} cy={stageY - 3} rx={stageRx - 8} ry={stageRy - 6} fill="none" stroke={T.ring[1]} strokeWidth={2.5} opacity={0.9} />
      <Ellipse cx={w / 2} cy={stageY - 3} rx={stageRx - 22} ry={stageRy - 10} fill="none" stroke={T.ring[0]} strokeWidth={2} opacity={0.75} />
      {/* ışık havuzları */}
      <Ellipse cx={w / 2} cy={stageY - 4} rx={stageRx * 0.55} ry={stageRy * 0.55} fill={T.floorShine} />
      {/* yan yarışmacı kürsüleri */}
      {sidePods
        ? [-1, 1].map((sgn) => {
            const cx = w / 2 + sgn * stageRx * 0.68;
            const sp = pw * 0.52;
            const top = pBottom - (pBottom - pTop) * 0.62 - stageRy * 0.5;
            const bot = pBottom - stageRy * 0.45;
            return (
              <G key={`sp${sgn}`}>
                <Path d={`M ${cx - sp / 2} ${top} L ${cx + sp / 2} ${top} L ${cx + sp * 0.4} ${bot} L ${cx - sp * 0.4} ${bot} Z`} fill={sgn < 0 ? T.neonPink : T.neon} stroke={H.outline} strokeWidth={2.4} strokeLinejoin="round" opacity={0.92} />
                <Rect x={cx - sp / 2 - 4} y={top - 8} width={sp + 8} height={10} rx={4} fill={T.podium[0]} stroke={H.outline} strokeWidth={2} />
                <Rect x={cx - sp * 0.28} y={top + (bot - top) * 0.25} width={sp * 0.56} height={(bot - top) * 0.4} rx={5} fill={T.screenFrame} stroke={H.white} strokeWidth={1.5} />
                <SvgText x={cx} y={top + (bot - top) * 0.55} fill={T.light} fontSize={Math.round((bot - top) * 0.24)} fontFamily={fonts.bold} textAnchor="middle">
                  {sgn < 0 ? "A" : "B"}
                </SvgText>
                <Path d={`M ${cx - 9} ${top - 7} Q ${cx} ${top - 22} ${cx + 9} ${top - 7} Z`} fill={T.buzzer[0]} stroke={H.outline} strokeWidth={1.8} />
              </G>
            );
          })
        : null}
      {/* kürsü + buzzer */}
      <G>
        <Path d={`M ${w / 2 - pw / 2} ${pTop} L ${w / 2 + pw / 2} ${pTop} L ${w / 2 + pw * 0.4} ${pBottom} L ${w / 2 - pw * 0.4} ${pBottom} Z`} fill={`url(#${g}pod)`} stroke={H.outline} strokeWidth={3} strokeLinejoin="round" />
        <Rect x={w / 2 - pw / 2 - 6} y={pTop - 10} width={pw + 12} height={13} rx={5} fill={T.podium[0]} stroke={H.outline} strokeWidth={2.6} />
        <Rect x={w / 2 - pw / 2 - 2} y={pTop - 7} width={pw + 4} height={3} rx={1.5} fill={T.neon} opacity={0.9} />
        <Circle cx={w / 2} cy={pTop + (pBottom - pTop) * 0.48} r={(pBottom - pTop) * 0.27} fill={T.podiumPanel} stroke={H.white} strokeWidth={2.5} />
        <SvgText x={w / 2} y={pTop + (pBottom - pTop) * 0.6} fill={T.ink} fontSize={Math.round((pBottom - pTop) * 0.34)} fontFamily={fonts.bold} textAnchor="middle">
          ?
        </SvgText>
        <Path d={`M ${w / 2 - pw / 2 + 9} ${pTop + 5} L ${w / 2 - pw * 0.4 + 6} ${pBottom - 6}`} stroke={H.shineSoft} strokeWidth={5} strokeLinecap="round" />
        <Rect x={w / 2 - 20} y={pTop - 19} width={40} height={10} rx={4} fill={T.buzzerBase} stroke={H.outline} strokeWidth={2} />
        <Path d={`M ${w / 2 - 15} ${pTop - 18} Q ${w / 2} ${pTop - 42} ${w / 2 + 15} ${pTop - 18} Z`} fill={T.buzzer[0]} stroke={H.outline} strokeWidth={2.2} />
        <Ellipse cx={w / 2 - 5} cy={pTop - 29} rx={4.5} ry={2.6} fill={H.shine} />
      </G>
      {/* ön sıra seyirci silüetleri */}
      {Array.from({ length: Math.ceil(w / 34) + 1 }, (_, i) => {
        const cx = i * 34 + (i % 2) * 8;
        const cy = pBottom + 34 + (i % 3) * 4;
        return (
          <G key={`au${i}`}>
            <Circle cx={cx} cy={cy - 14} r={11} fill={T.silhouette} />
            <Path d={`M ${cx - 20} ${cy + 30} Q ${cx - 18} ${cy - 2} ${cx} ${cy - 2} Q ${cx + 18} ${cy - 2} ${cx + 20} ${cy + 30} Z`} fill={T.silhouette} />
          </G>
        );
      })}
    </Svg>
  );
}

/** Ekranın içeriği: seri → "VS", kimbu → gizemli siluet, tahmin → 1·X·2. */
function ScreenContent({ game, x, y, w, h }: { game: string; x: number; y: number; w: number; h: number }) {
  const T = H.studio;
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (game === "kimbu") {
    const r = h * 0.2;
    const hx = cx - w * 0.14;
    const hy = cy - h * 0.06;
    return (
      <G>
        <Path d={`M ${hx - r * 2} ${y + h} Q ${hx - r * 1.9} ${hy + r * 1.3} ${hx - r * 0.5} ${hy + r * 1.15} L ${hx + r * 0.5} ${hy + r * 1.15} Q ${hx + r * 1.9} ${hy + r * 1.3} ${hx + r * 2} ${y + h} Z`} fill={T.silhouette} />
        <Rect x={hx - r * 0.38} y={hy + r * 0.6} width={r * 0.76} height={r * 0.7} fill={T.silhouette} />
        <Circle cx={hx} cy={hy} r={r} fill={T.silhouette} />
        <Path d={`M ${hx - r * 1.05} ${hy - r * 0.1} Q ${hx - r * 1.1} ${hy - r * 1.35} ${hx + r * 0.1} ${hy - r * 1.25} Q ${hx + r * 1.2} ${hy - r * 1.2} ${hx + r * 1.05} ${hy - r * 0.15} Z`} fill={T.silhouette} />
        <Path d={`M ${hx - r * 0.5} ${hy + r * 1.15} L ${hx} ${hy + r * 1.7} L ${hx + r * 0.5} ${hy + r * 1.15}`} stroke={T.neon} strokeWidth={2} fill="none" opacity={0.7} />
        <Circle cx={cx + w * 0.22} cy={cy} r={h * 0.3} fill={T.screenFrame} stroke={T.neon} strokeWidth={3} />
        <SvgText x={cx + w * 0.22} y={cy + h * 0.15} fill={T.neon} fontSize={Math.round(h * 0.46)} fontFamily={fonts.bold} textAnchor="middle">
          ?
        </SvgText>
      </G>
    );
  }
  if (game === "tahmin") {
    const bw = w * 0.22;
    return (
      <G>
        {["1", "X", "2"].map((t, i) => (
          <G key={t}>
            <Rect x={cx - bw * 1.6 + i * bw * 1.1} y={cy - h * 0.26} width={bw} height={h * 0.52} rx={8} fill={i === 1 ? T.neonPink : T.screenFrame} stroke={T.neon} strokeWidth={2.5} />
            <SvgText x={cx - bw * 1.1 + i * bw * 1.1} y={cy + h * 0.12} fill={T.ink} fontSize={Math.round(h * 0.32)} fontFamily={fonts.bold} textAnchor="middle">
              {t}
            </SvgText>
          </G>
        ))}
      </G>
    );
  }
  // seri (Gol Düellosu): iki siluet ve VS
  const r = h * 0.18;
  return (
    <G>
      {[-1, 1].map((sgn) => (
        <G key={sgn}>
          <Circle cx={cx + sgn * w * 0.28} cy={cy - h * 0.1} r={r} fill={sgn < 0 ? T.neonPink : T.neon} opacity={0.9} />
          <Path d={`M ${cx + sgn * w * 0.28 - r * 1.7} ${y + h} Q ${cx + sgn * w * 0.28} ${cy + r * 0.2} ${cx + sgn * w * 0.28 + r * 1.7} ${y + h} Z`} fill={sgn < 0 ? T.neonPink : T.neon} opacity={0.9} />
        </G>
      ))}
      <SvgText x={cx} y={cy + h * 0.14} fill={T.light} stroke={H.outline} strokeWidth={4} fontSize={Math.round(h * 0.42)} fontFamily={fonts.bold} textAnchor="middle">
        VS
      </SvgText>
      <SvgText x={cx} y={cy + h * 0.14} fill={T.light} fontSize={Math.round(h * 0.42)} fontFamily={fonts.bold} textAnchor="middle">
        VS
      </SvgText>
    </G>
  );
}

/* ─────────── Günün Testi: takvim sahnesi ─────────── */

const MONTHS = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

function CalendarScene({ b }: { b: Box }) {
  const g = useGid("cal");
  const D = H.daily;
  const { w, h } = b;
  const fh = b.fy1 - b.fy0;
  const now = new Date();
  const stageY = b.fy1 - fh * 0.16;
  const pw = Math.min((w - b.side * 2) * 0.62, fh * 0.42, 190);
  const ph = pw * 1.08;
  const px = w / 2 - pw * 0.66;
  const py = stageY - ph - fh * 0.04;
  const cupS = pw * 0.9;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id={`${g}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={D.sky[2]} />
          <Stop offset="0.6" stopColor={D.sky[1]} />
          <Stop offset="1" stopColor={D.sky[0]} />
        </SvgGradient>
        <SvgGradient id={`${g}page`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={D.page[0]} />
          <Stop offset="1" stopColor={D.page[1]} />
        </SvgGradient>
        <SvgGradient id={`${g}head`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={D.pageHead[0]} />
          <Stop offset="1" stopColor={D.pageHead[1]} />
        </SvgGradient>
        <SvgGradient id={`${g}stage`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={D.stage[0]} />
          <Stop offset="1" stopColor={D.stage[1]} />
        </SvgGradient>
        <SvgGradient id={`${g}ped`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={D.pedestal[0]} />
          <Stop offset="1" stopColor={D.pedestal[1]} />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${g}sky)`} />
      {/* ışınlar */}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const a2 = a + Math.PI / 20;
        const R = Math.max(w, h);
        const cx = w / 2;
        const cy = py + ph * 0.4;
        return <Path key={`r${i}`} d={`M ${cx} ${cy} L ${cx + Math.cos(a) * R} ${cy + Math.sin(a) * R} L ${cx + Math.cos(a2) * R} ${cy + Math.sin(a2) * R} Z`} fill={D.rays} />;
      })}
      {/* konfeti */}
      {Array.from({ length: 26 }, (_, i) => {
        const cx = ((i * 67) % 100) / 100 * w;
        const cy = b.fy0 + (((i * 41) % 100) / 100) * (stageY - b.fy0);
        const c = D.confetti[i % D.confetti.length];
        return i % 3 === 0 ? (
          <Circle key={`c${i}`} cx={cx} cy={cy} r={3} fill={c} />
        ) : (
          <Rect key={`c${i}`} x={cx} y={cy} width={8} height={4} rx={1} fill={c} transform={`rotate(${(i * 47) % 180} ${cx} ${cy})`} />
        );
      })}
      {/* sahne */}
      <Ellipse cx={w / 2} cy={stageY + fh * 0.07} rx={w * 0.62} ry={fh * 0.1} fill={`url(#${g}stage)`} stroke={H.outline} strokeWidth={3} />
      <Ellipse cx={w / 2} cy={stageY + fh * 0.05} rx={w * 0.58} ry={fh * 0.075} fill={D.stageTop} />
      {/* takvim yaprağı */}
      <G>
        <Rect x={px + 6} y={py + 8} width={pw} height={ph} rx={14} fill={H.shade} />
        <Rect x={px} y={py} width={pw} height={ph} rx={14} fill={`url(#${g}page)`} stroke={H.outline} strokeWidth={3} />
        <Path d={`M ${px} ${py + 14} Q ${px} ${py} ${px + 14} ${py} L ${px + pw - 14} ${py} Q ${px + pw} ${py} ${px + pw} ${py + 14} L ${px + pw} ${py + ph * 0.26} L ${px} ${py + ph * 0.26} Z`} fill={`url(#${g}head)`} stroke={H.outline} strokeWidth={3} />
        <SvgText x={px + pw / 2} y={py + ph * 0.19} fill={H.white} fontSize={Math.round(pw * 0.13)} fontFamily={fonts.bold} textAnchor="middle" letterSpacing={1.5}>
          {MONTHS[now.getMonth()]}
        </SvgText>
        <SvgText x={px + pw / 2} y={py + ph * 0.78} fill={D.pageInk} fontSize={Math.round(pw * 0.5)} fontFamily={fonts.bold} textAnchor="middle">
          {String(now.getDate())}
        </SvgText>
        <SvgText x={px + pw / 2} y={py + ph * 0.93} fill={D.pageHead[1]} fontSize={Math.round(pw * 0.085)} fontFamily={fonts.bold} textAnchor="middle" letterSpacing={1}>
          10 SORU
        </SvgText>
        {[0.25, 0.5, 0.75].map((f) => (
          <G key={f}>
            <Rect x={px + pw * f - 4} y={py - 10} width={8} height={20} rx={4} fill={D.ring} stroke={H.outline} strokeWidth={2} />
          </G>
        ))}
      </G>
      {/* kupa kaidesi */}
      <G transform={`translate(${w / 2 + pw * 0.5} ${stageY})`}>
        <Rect x={-cupS * 0.32} y={-cupS * 0.42} width={cupS * 0.64} height={cupS * 0.42} rx={6} fill={`url(#${g}ped)`} stroke={H.outline} strokeWidth={2.6} />
        <Rect x={-cupS * 0.38} y={-cupS * 0.48} width={cupS * 0.76} height={cupS * 0.09} rx={4} fill={D.pedestal[0]} stroke={H.outline} strokeWidth={2.4} />
        <G transform={`translate(${-cupS * 0.3} ${-cupS * 1.08}) scale(${(cupS * 0.6) / 48})`}>
          <Path d="M 12 9 Q 3 9 4.5 17 Q 6 24 15 25" stroke={H.outline} strokeWidth={5} fill="none" />
          <Path d="M 36 9 Q 45 9 43.5 17 Q 42 24 33 25" stroke={H.outline} strokeWidth={5} fill="none" />
          <Path d="M 12 9 Q 3 9 4.5 17 Q 6 24 15 25" stroke={HUB.game.slalom[0]} strokeWidth={2.6} fill="none" />
          <Path d="M 36 9 Q 45 9 43.5 17 Q 42 24 33 25" stroke={HUB.game.slalom[0]} strokeWidth={2.6} fill="none" />
          <Path d="M 11 6 L 37 6 L 35 20 Q 33 30 24 31 Q 15 30 13 20 Z" fill={HUB.game.slalom[0]} stroke={H.outline} strokeWidth={2.4} strokeLinejoin="round" />
          <Rect x={20.5} y={30} width={7} height={7} fill={HUB.game.slalom[1]} stroke={H.outline} strokeWidth={2} />
          <Rect x={13} y={37} width={22} height={7} rx={2} fill={HUB.game.slalom[1]} stroke={H.outline} strokeWidth={2.2} />
          <Ellipse cx={17.5} cy={13} rx={2.6} ry={5} fill={H.shine} />
          <Polygon points={starPoints(24, 17, 5)} fill={H.white} />
        </G>
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  titleWrap: { alignItems: "center" },
  titleTextBox: { position: "absolute", top: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm },
  title: { ...type.h1, fontFamily: fonts.bold, color: H.white, letterSpacing: 1, textShadowColor: H.titleShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },

  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, minWidth: 0, height: 52, flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.sm, borderRadius: radius.lg, borderWidth: 2, borderColor: H.cardEdge, overflow: "hidden" },
  statFill: { borderRadius: radius.lg },
  statRim: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: H.cardRim, margin: 0.5 },
  statIcon: { width: 32, alignItems: "center" },
  statBubble: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: H.studio.neonPink, borderWidth: 2, borderColor: H.outline },
  statTexts: { flex: 1, minWidth: 0 },
  statLabel: { ...type.meta, color: H.cardLabel },
  statValue: { ...type.scoreSm, color: H.white, textShadowColor: H.titleShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
});
