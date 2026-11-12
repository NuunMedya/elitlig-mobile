/**
 * Elit Üçlü taşları: statik çizim (PieceGlyph) + konumu canlandırılan taş (TileView).
 *
 * Her taş ÇİZGİ FİLM dilindedir (arcade oyunlarıyla ortak): kalın lacivert
 * kontur, doygun DÜZ dolgu (alt yarı bir ton koyu), altta koyu 3B "dudak",
 * üstte beyaz parlama şeridi ve iri, lacivert dış çizgili BEYAZ bir futbol
 * sembolü (top, forma, krampon, eldiven,
 * düdük, kupa). Her tür hem RENK hem ŞEKİL taşır (daire, yuvarlak kare,
 * altıgen, kalkan, karo, rozet) — renk körlüğünde de ayırt edilsin diye.
 *
 * Özel taşlar tek bakışta seçilir:
 *   · Füze Şut (h / v): kalın beyaz şeritler + iki uçta altın oklar + soğuk ışıma.
 *   · Röveşata (bomb): altın patlama yıldızı, altın kenar, köşe kıvılcımları + sıcak ışıma.
 *   · Altın Top (ball): altın küre, altı renkli gökkuşağı halkası, kıvılcımlar.
 * Hepsi tek SVG; ikon fontu kullanılmaz (çizgi kalınlığı ölçekle birlikte büyür).
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { duration } from "@/theme";
import { UCLU_BOARD, UCLU_OUTLINE, UCLU_PIECE_COLORS } from "@/lib/puzzle/ucluPalette";
import type { Special, Tile } from "@/lib/puzzle/ucluEngine";

/* ───────────────────────────── geometri ───────────────────────────── */

type Pt = readonly [number, number];

/** Köşeleri yuvarlatılmış çokgen yolu (her köşe `r` kadar içeriden kavislenir). */
function roundedPoly(points: readonly Pt[], r: number): string {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const toPrev = [prev[0] - p[0], prev[1] - p[1]];
    const toNext = [next[0] - p[0], next[1] - p[1]];
    const lp = Math.hypot(toPrev[0], toPrev[1]);
    const ln = Math.hypot(toNext[0], toNext[1]);
    const k = Math.min(r, lp / 2, ln / 2);
    const a = [p[0] + (toPrev[0] / lp) * k, p[1] + (toPrev[1] / lp) * k];
    const b = [p[0] + (toNext[0] / ln) * k, p[1] + (toNext[1] / ln) * k];
    d += `${i === 0 ? "M" : "L"}${a[0].toFixed(2)} ${a[1].toFixed(2)} Q${p[0]} ${p[1]} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  }
  return `${d}Z`;
}

function ring(cx: number, cy: number, count: number, r: (i: number) => number, start = -90): Pt[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((start + (360 / count) * i) * Math.PI) / 180;
    return [cx + Math.cos(a) * r(i), cy + Math.sin(a) * r(i)] as const;
  });
}

const HEX = roundedPoly([[50, 6], [89, 28], [89, 72], [50, 94], [11, 72], [11, 28]], 9);
const DIAMOND = roundedPoly([[50, 3], [97, 50], [50, 97], [3, 50]], 12);
const ROSETTE = roundedPoly(ring(50, 50, 16, (i) => (i % 2 ? 39 : 46.5)), 5);
const SHIELD = "M50 6 C63 12 75 13 88 12 C91 51 79 78 50 94 C21 78 9 51 12 12 C25 13 37 12 50 6 Z";

/** Gövde şekilleri 100×100 kutuda (alt kenarda 3B taban payı bırakılır). */
function Shape({ kind, ...rest }: { kind: number; fill?: string; stroke?: string; strokeWidth?: number; strokeOpacity?: number; fillOpacity?: number; transform?: string }) {
  const common = { strokeLinejoin: "round" as const, ...rest };
  switch (kind) {
    case 0:
      return <Circle cx={50} cy={50} r={43} {...common} />;
    case 1:
      return <Rect x={8} y={8} width={84} height={84} rx={24} {...common} />;
    case 2:
      return <Path d={HEX} {...common} />;
    case 3:
      return <Path d={SHIELD} {...common} />;
    case 4:
      return <Path d={DIAMOND} {...common} />;
    default:
      return <Path d={ROSETTE} {...common} />;
  }
}

/** Kubbe içi ölçek: şeklin merkezine göre küçültür. */
const inner = (s: number) => `translate(50 50) scale(${s}) translate(-50 -50)`;

/* ───────────────────────────── semboller ───────────────────────────── */

/**
 * Her sembol İKİ geçişte çizilir: önce koyu dış çizgi (kalın kontur), sonra
 * beyaz dolgu ve renkli ayrıntılar. Böylece sembol hangi zeminde olursa olsun
 * küçük boyda da net okunur.
 */
interface Ink {
  outline: boolean;
  /** Dolgu (beyaz). */
  fill: string;
  /** Dış çizgi ve koyu ayrıntı. */
  dark: string;
  /** Renkli ayrıntı (formadaki şerit, kupadaki yıldız). */
  accent: string;
}

const OUT = 8;

function solid(ink: Ink) {
  return ink.outline
    ? { fill: ink.dark, stroke: ink.dark, strokeWidth: OUT, strokeLinejoin: "round" as const }
    : { fill: ink.fill };
}
function line(ink: Ink, w: number) {
  return ink.outline
    ? { fill: "none", stroke: ink.dark, strokeWidth: w + OUT, strokeLinecap: "round" as const }
    : { fill: "none", stroke: ink.fill, strokeWidth: w, strokeLinecap: "round" as const };
}

const BALL_PENT = ring(50, 50, 5, () => 10);
const BALL_SPOKE = ring(50, 50, 5, () => 25);
const SHIRT = "M38 23 L44 20 C46 27 54 27 56 20 L62 23 L79 33 L72 48 L65 44.5 L65 79 L35 79 L35 44.5 L28 48 L21 33 Z";
const BOOT = "M21 35 C21 29 25 26 31 26 L44 26 C46 26 47.5 27.5 47.6 29.5 L48.5 41 C59 42 70 45 77.5 50 C82 53 82 60 78 63 L22 63 C20 63 18.5 61.5 18.5 59.5 Z";
const CUP = "M32 23 L68 23 L67 39 C66 51 59 59 50 59 C41 59 34 51 33 39 Z";
const STAR5 = (cx: number, cy: number, r: number) => ring(cx, cy, 10, (i) => (i % 2 ? r * 0.45 : r)).map((p) => p.join(",")).join(" ");

function Emblem({ index, ink }: { index: number; ink: Ink }) {
  const s = solid(ink);
  switch (index) {
    case 0: // top
      return (
        <G>
          <Circle cx={50} cy={50} r={26} {...s} />
          {ink.outline ? null : (
            <G>
              <Polygon points={BALL_PENT.map((p) => p.join(",")).join(" ")} fill={ink.dark} stroke={ink.dark} strokeWidth={2} strokeLinejoin="round" />
              {BALL_SPOKE.map((p, i) => (
                <Path key={i} d={`M${BALL_PENT[i][0]} ${BALL_PENT[i][1]} L${p[0]} ${p[1]}`} stroke={ink.dark} strokeWidth={3.2} strokeLinecap="round" />
              ))}
              {BALL_SPOKE.map((p, i) => (
                <Circle key={`c${i}`} cx={p[0]} cy={p[1]} r={5.5} fill={ink.dark} />
              ))}
              <Circle cx={50} cy={50} r={26} fill="none" stroke={ink.dark} strokeWidth={1.5} />
            </G>
          )}
        </G>
      );
    case 1: // forma
      return (
        <G>
          <Path d={SHIRT} {...s} />
          {ink.outline ? null : (
            <G>
              <Rect x={45.5} y={27} width={9} height={52} fill={ink.accent} />
              <Path d="M44 20 C46 27 54 27 56 20" fill="none" stroke={ink.dark} strokeWidth={2.4} strokeLinecap="round" />
            </G>
          )}
        </G>
      );
    case 2: // krampon
      return (
        <G>
          <Path d={BOOT} {...s} />
          {[24, 33, 55, 64.5, 73].map((x) => (
            <Path key={x} d={`M${x} 62 L${x + 6} 62 L${x + 4.5} 70 L${x + 1.5} 70 Z`} {...s} />
          ))}
          {ink.outline ? null : (
            <G>
              <Rect x={19} y={60.5} width={61} height={3} fill={ink.dark} />
              <Path d="M24 52 C38 55 56 52 72 54" fill="none" stroke={ink.accent} strokeWidth={5} strokeLinecap="round" />
              <Path d="M51 42 L55 47 M58 43.5 L61.5 48.5 M65 45.5 L67.5 50" fill="none" stroke={ink.dark} strokeWidth={2.6} strokeLinecap="round" />
            </G>
          )}
        </G>
      );
    case 3: // eldiven
      return (
        <G>
          <Rect x={34} y={26} width={9.5} height={26} rx={4.75} {...s} />
          <Rect x={44.5} y={20} width={9.5} height={30} rx={4.75} {...s} />
          <Rect x={55} y={22} width={9.5} height={28} rx={4.75} {...s} />
          <Rect x={65.5} y={29} width={8.5} height={22} rx={4.25} {...s} />
          <Ellipse cx={29} cy={51} rx={5.5} ry={12} transform="rotate(-32 29 51)" {...s} />
          <Rect x={33} y={40} width={41} height={28} rx={11} {...s} />
          <Rect x={35} y={66} width={37} height={13} rx={3} {...s} />
          {ink.outline ? null : (
            <G>
              <Rect x={35} y={69.5} width={37} height={5} fill={ink.accent} />
              <Path d="M39 41 L39 51 M49.2 39 L49.2 50 M59.7 39 L59.7 50" stroke={ink.dark} strokeWidth={1.8} strokeLinecap="round" opacity={0.55} />
            </G>
          )}
        </G>
      );
    case 4: // düdük
      return (
        <G>
          <Circle cx={26} cy={33} r={6.5} {...line(ink, 4.5)} />
          <Circle cx={42} cy={56} r={18} {...s} />
          <Rect x={40} y={38} width={40} height={15} rx={4} {...s} />
          {ink.outline ? null : (
            <G>
              <Circle cx={42} cy={56} r={6.5} fill={ink.dark} />
              <Rect x={48} y={38} width={8} height={5} fill={ink.dark} />
              <Rect x={73} y={41} width={4} height={9} rx={2} fill={ink.accent} />
            </G>
          )}
        </G>
      );
    default: // kupa
      return (
        <G>
          <Path d="M34 28 C23 28 21 34 22.5 39 C24 45 30 48 36 48" {...line(ink, 5)} />
          <Path d="M66 28 C77 28 79 34 77.5 39 C76 45 70 48 64 48" {...line(ink, 5)} />
          <Path d={CUP} {...s} />
          <Rect x={45.5} y={57} width={9} height={11} {...s} />
          <Rect x={35} y={67} width={30} height={10} rx={3} {...s} />
          {ink.outline ? null : (
            <G>
              <Polygon points={STAR5(50, 39, 9)} fill={ink.accent} />
              <Rect x={35} y={67} width={30} height={3} fill={ink.dark} opacity={0.35} />
            </G>
          )}
        </G>
      );
  }
}

function SymbolPair({ index, scale, fill, dark, accent }: { index: number; scale: number; fill: string; dark: string; accent: string }) {
  return (
    <G transform={inner(scale)}>
      <G transform="translate(0 3)" opacity={0.3}>
        <Emblem index={index} ink={{ outline: true, fill, dark: UCLU_OUTLINE, accent }} />
      </G>
      <Emblem index={index} ink={{ outline: true, fill, dark: UCLU_OUTLINE, accent }} />
      <Emblem index={index} ink={{ outline: false, fill, dark, accent }} />
    </G>
  );
}

/* ───────────────────────────── özel işaretler ───────────────────────────── */

function Sparkle({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const k = r * 0.28;
  return <Path d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`} fill={fill} />;
}

/** Füze okları: iki uçta dışa bakan altın oklar (v için 90° döner). */
function RocketArrows({ vertical }: { vertical: boolean }) {
  const arrow = "M1 50 L15 36 L15 44 L22 44 L22 56 L15 56 L15 64 Z";
  return (
    <G transform={vertical ? "rotate(90 50 50)" : undefined}>
      {[undefined, "rotate(180 50 50)"].map((t, i) => (
        <G key={i} transform={t}>
          <Path d={arrow} fill={UCLU_OUTLINE} stroke={UCLU_OUTLINE} strokeWidth={7} strokeLinejoin="round" />
          <Path d={arrow} fill={UCLU_BOARD.gold} stroke={UCLU_BOARD.goldHi} strokeWidth={1.2} strokeLinejoin="round" />
        </G>
      ))}
    </G>
  );
}

/** Altı renkli gökkuşağı halkası (Altın Top: "her renge vurur"). */
function RainbowRing({ r, w }: { r: number; w: number }) {
  return (
    <G>
      {UCLU_PIECE_COLORS.map((c, i) => {
        const a0 = ((-90 + i * 60 + 4) * Math.PI) / 180;
        const a1 = ((-90 + (i + 1) * 60 - 4) * Math.PI) / 180;
        const d = `M${50 + Math.cos(a0) * r} ${50 + Math.sin(a0) * r} A${r} ${r} 0 0 1 ${50 + Math.cos(a1) * r} ${50 + Math.sin(a1) * r}`;
        return <Path key={i} d={d} fill="none" stroke={c.base} strokeWidth={w} strokeLinecap="round" />;
      })}
    </G>
  );
}

/* ───────────────────────────── taş çizimi ───────────────────────────── */

/** Lacivert kontur kalınlığı (100'lük kutuda; ~3 px görünür). */
const STROKE = 6;
/** Gövde, kontur + dudak kutuya sığsın diye biraz küçültülüp yukarı alınır. */
const BODY = "translate(50 46) scale(0.88) translate(-50 -50)";
const BOMB_STAR = ring(50, 50, 16, (i) => (i % 2 ? 23 : 37)).map((p) => p.join(",")).join(" ");
/** Şekle göre parlama şeridi (sol üst kenara yaslanan kavisli şerit). */
const SHINE: string[] = [
  "M22 36 C24 24 34 15 46 13 C49 12.5 50 16 47 17.5 C37 21 30 28 28 37 C27 41 21.5 40 22 36 Z",
  "M18 34 C18 22 23 17 35 17 L52 17 C56 17 56 23 52 23 L36 23 C27 23 24 27 24 34 C24 39 18 39 18 34 Z",
  "M20 33 L45 18.5 C49 16.5 51 21.5 47.5 23.5 L26 36 C21.5 38.5 17 35.5 20 33 Z",
  "M19 21 C29 21 38 19.5 47 15 C51 13 53 18.5 49 20.5 C40 25 31 26.5 23 26.5 C18 26.5 15 21 19 21 Z",
  "M17 46 L43 20 C46 17 50 21 47 24 L22 49 C19 52 14 49 17 46 Z",
  "M19 38 C20 27 28 17 40 14 C44 13 45 18.5 41.5 19.5 C32 22.5 27 29 26 38 C25.5 42.5 18.5 42.5 19 38 Z",
];
const SHINE_DOT: Pt[] = [[26, 45], [21, 44], [19, 42], [17, 30], [16, 54], [20, 47]];

export interface PieceGlyphProps {
  kind: Tile["kind"];
  color: number;
  special: Special;
  size: number;
}

/** Statik taş çizimi — HUD hedeflerinde ve uçan simgelerde de kullanılır. */
export const PieceGlyph = React.memo(function PieceGlyph({ kind, color, special, size }: PieceGlyphProps) {
  if (kind === "trophy") return <TrophyGlyph size={size} />;
  if (special === "ball") return <GoldenBall size={size} />;
  const idx = Math.max(0, color) % UCLU_PIECE_COLORS.length;
  const pal = UCLU_PIECE_COLORS[idx];
  const shape = idx;
  const rocket = special === "h" || special === "v";
  const bomb = special === "bomb";
  // Karo şeklinin iç alanı dar: sembol biraz küçülür. Özel taşta işaretlere yer açılır.
  const symScale = (shape === 4 ? 0.84 : 1.0) * (rocket ? 0.84 : bomb ? 0.9 : 1);
  const id = `u${idx}${special}`;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <ClipPath id={`${id}c`}>
            <Shape kind={shape} />
          </ClipPath>
          {rocket || bomb ? (
            <RadialGradient id={`${id}h`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.55" stopColor={rocket ? UCLU_BOARD.glowCool : UCLU_BOARD.glowWarm} stopOpacity={0.9} />
              <Stop offset="1" stopColor={rocket ? UCLU_BOARD.glowCool : UCLU_BOARD.glowWarm} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        {rocket || bomb ? <Circle cx={50} cy={50} r={50} fill={`url(#${id}h)`} /> : null}
        <Ellipse cx={50} cy={93} rx={34} ry={5} fill={UCLU_BOARD.shadow} />
        <G transform={BODY}>
          {/* 3B dudak: koyu ton, lacivert konturlu, gövdenin altından görünür. */}
          <Shape kind={shape} fill={pal.lo} stroke={UCLU_OUTLINE} strokeWidth={STROKE} transform="translate(0 7)" />
          <Shape kind={shape} fill={pal.base} />
          <G clipPath={`url(#${id}c)`}>
            {/* Düz iki ton: alt kısım bir ton koyu, üst kısım hafif açık. */}
            <Ellipse cx={50} cy={112} rx={78} ry={46} fill={pal.lo} fillOpacity={0.55} />
            <Ellipse cx={50} cy={-6} rx={70} ry={40} fill={pal.hi} fillOpacity={0.35} />
            {rocket ? (
              <G transform={special === "v" ? "rotate(90 50 50)" : undefined}>
                {[24, 43, 62].map((y) => (
                  <G key={y}>
                    <Rect x={0} y={y} width={100} height={12} fill={UCLU_OUTLINE} />
                    <Rect x={0} y={y + 2.5} width={100} height={7} fill={UCLU_BOARD.beamCore} />
                  </G>
                ))}
              </G>
            ) : null}
          </G>
          <Shape kind={shape} fill="none" stroke={bomb ? UCLU_BOARD.gold : UCLU_OUTLINE} strokeWidth={STROKE} />
          {bomb ? <Shape kind={shape} fill="none" stroke={UCLU_OUTLINE} strokeWidth={2.5} transform={inner(1.06)} /> : null}
          {bomb ? (
            <G>
              <Polygon points={BOMB_STAR} fill={UCLU_OUTLINE} stroke={UCLU_OUTLINE} strokeWidth={7} strokeLinejoin="round" />
              <Polygon points={BOMB_STAR} fill={UCLU_BOARD.gold} stroke={UCLU_BOARD.goldHi} strokeWidth={1.2} strokeLinejoin="round" />
              <Circle cx={50} cy={50} r={21} fill={pal.base} stroke={UCLU_OUTLINE} strokeWidth={3} />
            </G>
          ) : null}
          <SymbolPair index={idx} scale={symScale * (bomb ? 0.74 : 1)} fill={pal.ink} dark={UCLU_OUTLINE} accent={pal.base} />
          {/* Parlama: üst sol köşede beyaz şerit + nokta. */}
          <Path d={SHINE[shape]} fill={UCLU_BOARD.beamCore} fillOpacity={0.85} />
          <Circle cx={SHINE_DOT[shape][0]} cy={SHINE_DOT[shape][1]} r={3} fill={UCLU_BOARD.beamCore} fillOpacity={0.85} />
        </G>
        {rocket ? <RocketArrows vertical={special === "v"} /> : null}
        {bomb ? (
          <G>
            <Sparkle x={12} y={12} r={10} fill={UCLU_BOARD.goldHi} />
            <Sparkle x={88} y={14} r={8} fill={UCLU_BOARD.beamCore} />
            <Sparkle x={86} y={86} r={10} fill={UCLU_BOARD.goldHi} />
            <Sparkle x={13} y={84} r={7} fill={UCLU_BOARD.beamCore} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
});

function GoldenBall({ size }: { size: number }) {
  const pent = ring(50, 50, 5, () => 11);
  const spokes = ring(50, 50, 5, () => 30);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ugold" cx="36%" cy="30%" r="72%">
            <Stop offset="0" stopColor={UCLU_BOARD.goldHi} />
            <Stop offset="0.45" stopColor={UCLU_BOARD.gold} />
            <Stop offset="1" stopColor={UCLU_BOARD.goldLo} />
          </RadialGradient>
          <RadialGradient id="ugoldh" cx="50%" cy="50%" r="50%">
            <Stop offset="0.6" stopColor={UCLU_BOARD.goldHi} stopOpacity={0.95} />
            <Stop offset="1" stopColor={UCLU_BOARD.goldHi} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="ugoldg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={UCLU_BOARD.beamCore} stopOpacity={0.75} />
            <Stop offset="1" stopColor={UCLU_BOARD.beamCore} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Circle cx={50} cy={50} r={50} fill="url(#ugoldh)" />
        <Ellipse cx={50} cy={93} rx={30} ry={5} fill={UCLU_BOARD.shadow} />
        <Circle cx={50} cy={50} r={46.5} fill="none" stroke={UCLU_OUTLINE} strokeWidth={4} />
        <RainbowRing r={43} w={7} />
        <Circle cx={50} cy={55} r={35} fill={UCLU_BOARD.goldDeep} stroke={UCLU_OUTLINE} strokeWidth={5} />
        <Circle cx={50} cy={50} r={35} fill="url(#ugold)" stroke={UCLU_OUTLINE} strokeWidth={5} />
        <Polygon points={pent.map((p) => p.join(",")).join(" ")} fill={UCLU_BOARD.goldInk} stroke={UCLU_BOARD.goldInk} strokeWidth={2} strokeLinejoin="round" />
        {spokes.map((p, i) => (
          <G key={i}>
            <Path d={`M${pent[i][0]} ${pent[i][1]} L${p[0]} ${p[1]}`} stroke={UCLU_BOARD.goldInk} strokeWidth={3.5} strokeLinecap="round" />
            <Circle cx={p[0]} cy={p[1]} r={6} fill={UCLU_BOARD.goldInk} />
          </G>
        ))}
        <Ellipse cx={50} cy={30} rx={26} ry={13} fill="url(#ugoldg)" />
        <Ellipse cx={34} cy={28} rx={9} ry={4} transform="rotate(-35 34 28)" fill={UCLU_BOARD.beamCore} />
        <Sparkle x={84} y={16} r={11} fill={UCLU_BOARD.beamCore} />
        <Sparkle x={15} y={82} r={8} fill={UCLU_BOARD.beamCore} />
      </Svg>
    </View>
  );
}

function TrophyGlyph({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ucuph" cx="50%" cy="45%" r="52%">
            <Stop offset="0" stopColor={UCLU_BOARD.goldHi} stopOpacity={0.85} />
            <Stop offset="1" stopColor={UCLU_BOARD.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={48} r={50} fill="url(#ucuph)" />
        <Ellipse cx={50} cy={92} rx={28} ry={5} fill={UCLU_BOARD.shadow} />
        <G transform="translate(50 50) scale(1.32) translate(-50 -50)">
          <G transform="translate(0 2.5)" opacity={0.35}>
            <Emblem index={5} ink={{ outline: true, fill: UCLU_BOARD.gold, dark: UCLU_BOARD.ink, accent: UCLU_BOARD.goldHi }} />
          </G>
          <Emblem index={5} ink={{ outline: true, fill: UCLU_BOARD.gold, dark: UCLU_OUTLINE, accent: UCLU_BOARD.goldHi }} />
          <Emblem index={5} ink={{ outline: false, fill: UCLU_BOARD.gold, dark: UCLU_BOARD.goldDeep, accent: UCLU_BOARD.beamCore }} />
          <Ellipse cx={42} cy={32} rx={4} ry={8} fill={UCLU_BOARD.goldHi} fillOpacity={0.8} />
        </G>
        <Sparkle x={82} y={18} r={9} fill={UCLU_BOARD.beamCore} />
      </Svg>
    </View>
  );
}

/* ───────────────────────────── canlandırılan taş ───────────────────────────── */

export interface TileViewProps {
  tile: Tile;
  row: number;
  col: number;
  cell: number;
  /** Tahtanın üstünden düşerek gelecekse başlangıç satırı (yalnız ilk çizimde okunur). */
  spawnRow?: number;
  dying: boolean;
  selected: boolean;
  /** İpucu sallaması: yön ve tetik sayacı. */
  hintDx: number;
  hintDy: number;
  hintTick: number;
}

function TileViewBase({ tile, row, col, cell, spawnRow, dying, selected, hintDx, hintDy, hintTick }: TileViewProps) {
  const startRow = spawnRow ?? row;
  const pos = useRef(new Animated.ValueXY({ x: col * cell, y: startRow * cell })).current;
  const scale = useRef(new Animated.Value(spawnRow === undefined ? 0.2 : 1)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const last = useRef({ row: startRow, col });

  // İlk çizim: yerinde doğan (özel taş) taş "pop" ile belirir.
  useEffect(() => {
    if (spawnRow === undefined) {
      Animated.spring(scale, { toValue: 1, damping: 9, stiffness: 260, mass: 0.7, useNativeDriver: true }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Konum değişimi: aşağı → yerçekimi (hızlanarak) + iniş esnemesi; diğer → kayma.
  useEffect(() => {
    const prev = last.current;
    if (prev.row === row && prev.col === col) return;
    const drop = row - prev.row;
    last.current = { row, col };
    const target = { x: col * cell, y: row * cell };
    if (drop > 0) {
      Animated.sequence([
        Animated.timing(pos, {
          toValue: target,
          duration: 110 + Math.sqrt(drop) * 75,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(squash, { toValue: 0.86, duration: 60, useNativeDriver: true }),
          Animated.spring(squash, { toValue: 1, damping: 7, stiffness: 320, mass: 0.6, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      Animated.timing(pos, { toValue: target, duration: duration.base - 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [row, col, cell, pos, squash]);

  // Hücre boyu değişirse (ekran döndü / alan ölçüldü) taş yerine oturur.
  const lastCell = useRef(cell);
  useEffect(() => {
    if (lastCell.current === cell) return;
    lastCell.current = cell;
    pos.setValue({ x: last.current.col * cell, y: last.current.row * cell });
  }, [cell, pos]);

  useEffect(() => {
    if (!dying) return;
    // Çizgi film "pop": önce yassılıp şişer (squash), sonra uzayıp küçülerek söner.
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.26, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0, duration: 130, easing: Easing.in(Easing.back(2)), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(squash, { toValue: 0.82, duration: 70, useNativeDriver: true }),
        Animated.timing(squash, { toValue: 1.14, duration: 110, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 140, delay: 80, useNativeDriver: true }),
    ]).start();
  }, [dying, scale, squash, opacity]);

  useEffect(() => {
    if (dying) return;
    Animated.spring(scale, { toValue: selected ? 1.12 : 1, damping: 12, stiffness: 300, mass: 0.6, useNativeDriver: true }).start();
  }, [selected, dying, scale]);

  // İpucu: komşusuna doğru sonlu sallanma (3 tur).
  useEffect(() => {
    if (!hintTick) return;
    wiggle.setValue(0);
    const swing = Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]);
    Animated.loop(swing, { iterations: 3 }).start();
  }, [hintTick, wiggle]);

  // Taşlar hücreyi neredeyse doldurur: iri ve kolay okunur.
  const inset = Math.round(cell * 0.035);
  const amp = cell * 0.14;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tile,
        {
          width: cell,
          height: cell,
          padding: inset,
          opacity,
          transform: [
            { translateX: pos.x },
            { translateY: pos.y },
            { translateX: wiggle.interpolate({ inputRange: [0, 1], outputRange: [0, hintDx * amp] }) },
            { translateY: wiggle.interpolate({ inputRange: [0, 1], outputRange: [0, hintDy * amp] }) },
            { translateY: squash.interpolate({ inputRange: [0.8, 1, 1.2], outputRange: [cell * 0.06, 0, 0], extrapolate: "clamp" }) },
            { scaleY: squash },
            { scaleX: squash.interpolate({ inputRange: [0.8, 1, 1.2], outputRange: [1.14, 1, 0.88], extrapolate: "clamp" }) },
            { scale },
          ],
        },
      ]}
    >
      <PieceGlyph kind={tile.kind} color={tile.color} special={tile.special} size={cell - inset * 2} />
    </Animated.View>
  );
}

/** spawnRow yalnız ilk çizimde okunur; değişmesi yeniden çizim gerektirmez. */
export const TileView = React.memo(TileViewBase, (a, b) =>
  a.tile === b.tile &&
  a.row === b.row &&
  a.col === b.col &&
  a.cell === b.cell &&
  a.dying === b.dying &&
  a.selected === b.selected &&
  a.hintTick === b.hintTick &&
  a.hintDx === b.hintDx &&
  a.hintDy === b.hintDy,
);

const styles = StyleSheet.create({
  tile: { position: "absolute", left: 0, top: 0 },
});
