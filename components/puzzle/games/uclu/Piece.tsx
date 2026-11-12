/**
 * Elit Üçlü taşları: statik çizim (PieceGlyph) + konumu canlandırılan taş (TileView).
 *
 * Her taş PARLAK ÇİZGİ FİLM FUTBOL TOPUDUR (arcade oyunlarıyla ortak dil):
 * hücreyi dolduran yuvarlak top, ince (kendi renginin koyu tonu) kenar, doygun gövde rengi,
 * aynı rengin koyu tonuyla çizilmiş klasik beşgen/altıgen panel deseni,
 * küresel gölgelendirme, iri parlak yansıma + alt kenarda "rim" ışığı ve
 * yumuşak bir yer gölgesi. İçte beyaz simge YOKTUR: eşleşme top rengine göre.
 * Renk körlüğü için komşu renklerin panel deseni farklıdır (klasik / girdap /
 * yıldız); hepsi sade bir top olarak okunur.
 *
 * Özel taşlar tek bakışta seçilir — hepsi yine toptur:
 *   · Füze Şut (h / v): topun üstünde kalın beyaz hız şeritleri + iki yanda
 *     yön gösteren hız çizgileri (v için 90° döner).
 *   · Röveşata (bomb): turuncu-altın patlama yıldızı halkası ve kıvılcımlar
 *     içinde top.
 *   · Altın Top (ball): metalik altın top, gökkuşağı renkli paneller, hale
 *     ve pırıltılar.
 *   · Şampiyonluk kupası: cam bir küre içinde altın kupa.
 * Hepsi tek SVG; ikon fontu kullanılmaz (çizgi kalınlığı ölçekle büyür).
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { duration } from "@/theme";
import { UCLU_BOARD, UCLU_PIECE_COLORS, type UcluBallPattern } from "@/lib/puzzle/ucluPalette";
import type { Special, Tile } from "@/lib/puzzle/ucluEngine";

/* ───────────────────────────── geometri ───────────────────────────── */

type Pt = readonly [number, number];

function ring(cx: number, cy: number, count: number, r: (i: number) => number, start = -90): Pt[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((start + (360 / count) * i) * Math.PI) / 180;
    return [cx + Math.cos(a) * r(i), cy + Math.sin(a) * r(i)] as const;
  });
}
const pts = (p: readonly Pt[]) => p.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ");

/** Topun merkezi ve yarıçapı (100'lük kutuda; altta gölgeye pay kalır). */
const CX = 50;
const CY = 48;
const R = 44;

/* ───────────────────────────── panel desenleri ───────────────────────────── */

/**
 * Desenler birim topa göre (merkez 0,0; yarıçap 1) tanımlanır ve topun
 * yarıçapına ölçeklenir; böylece özel taşlardaki küçük toplarda da aynı kalır.
 */
function Panels({ pattern, fill, r }: { pattern: UcluBallPattern; fill: string; r: number }) {
  const seam = Math.max(1.6, r * 0.06);
  if (pattern === "swirl") {
    // Üç kollu girdap (modern maç topu): her kol merkezden kenara kıvrılır.
    const arm = "M0 -0.1 C0.32 -0.34 0.7 -0.5 1.1 -0.46 L1.1 0.12 C0.74 0.02 0.4 0.08 0.1 0.18 Z";
    return (
      <G transform={`translate(${CX} ${CY}) scale(${r})`}>
        {[0, 120, 240].map((a) => (
          <Path key={a} d={arm} transform={`rotate(${a - 90})`} fill={fill} />
        ))}
        <Circle cx={0} cy={0} r={0.24} fill={fill} />
      </G>
    );
  }
  if (pattern === "star") {
    // Ortada yıldız panel + kenarda beş yuvarlak panel.
    const star = ring(0, 0, 10, (i) => (i % 2 ? 0.17 : 0.4));
    const dots = ring(0, 0, 5, () => 0.8, -54);
    return (
      <G transform={`translate(${CX} ${CY}) scale(${r})`}>
        <Polygon points={pts(star)} fill={fill} stroke={fill} strokeWidth={0.06} strokeLinejoin="round" />
        {dots.map((p, i) => (
          <Circle key={i} cx={p[0]} cy={p[1]} r={0.24} fill={fill} />
        ))}
      </G>
    );
  }
  // Klasik: ortada beşgen, dikişlerle kenardaki beş beşgene bağlanır.
  const center = ring(0, 0, 5, () => 0.3);
  const outer = center.map((_, i) => {
    const a = ((-90 + 72 * i) * Math.PI) / 180;
    const c: Pt = [Math.cos(a) * 0.86, Math.sin(a) * 0.86];
    // Dış beşgenin bir köşesi merkeze bakar.
    return ring(c[0], c[1], 5, () => 0.3, -90 + 72 * i + 180);
  });
  return (
    <G transform={`translate(${CX} ${CY}) scale(${r})`}>
      <G stroke={fill} strokeWidth={seam / r} strokeLinecap="round">
        {center.map((p, i) => (
          <Path key={i} d={`M${p[0]} ${p[1]} L${outer[i][0][0]} ${outer[i][0][1]}`} />
        ))}
      </G>
      <Polygon points={pts(center)} fill={fill} stroke={fill} strokeWidth={0.08} strokeLinejoin="round" />
      {outer.map((o, i) => (
        <Polygon key={i} points={pts(o)} fill={fill} stroke={fill} strokeWidth={0.08} strokeLinejoin="round" />
      ))}
    </G>
  );
}

/* ───────────────────────────── top gövdesi ───────────────────────────── */

interface BallTones {
  hi: string;
  base: string;
  lo: string;
  rim: string;
  panel: string;
}

/**
 * Parlak top: küresel gradyan gövde + paneller + kenar gölgesi + rim ışığı +
 * iri yansıma. `r` topun yarıçapı (merkez CX, CY). `panels` verilmezse tek
 * renk; `rainbow` Altın Top için panelleri renk renk boyar.
 */
function Ball({
  id,
  tones,
  pattern,
  r = R,
  rainbow,
  stroke = 1.6,
}: {
  id: string;
  tones: BallTones;
  pattern: UcluBallPattern;
  r?: number;
  rainbow?: boolean;
  stroke?: number;
}) {
  return (
    <G>
      <Defs>
        <RadialGradient id={`${id}b`} cx="38%" cy="30%" r="78%">
          <Stop offset="0" stopColor={tones.hi} />
          <Stop offset="0.42" stopColor={tones.base} />
          <Stop offset="1" stopColor={tones.lo} />
        </RadialGradient>
        <RadialGradient id={`${id}s`} cx="42%" cy="36%" r="64%">
          <Stop offset="0.62" stopColor={tones.rim} stopOpacity={0} />
          <Stop offset="1" stopColor={tones.rim} stopOpacity={0.55} />
        </RadialGradient>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.beamCore} stopOpacity={0.7} />
          <Stop offset="1" stopColor={UCLU_BOARD.beamCore} stopOpacity={0} />
        </LinearGradient>
        <ClipPath id={`${id}c`}>
          <Circle cx={CX} cy={CY} r={r} />
        </ClipPath>
      </Defs>
      <Circle cx={CX} cy={CY} r={r} fill={`url(#${id}b)`} />
      <G clipPath={`url(#${id}c)`}>
        {rainbow ? <RainbowPanels r={r} /> : <Panels pattern={pattern} fill={tones.panel} r={r} />}
        <Circle cx={CX} cy={CY} r={r} fill={`url(#${id}s)`} />
        {/* Alt kenarda rim ışığı (ince açık hilal). */}
        <Path
          d={`M${CX - r * 0.78} ${CY + r * 0.42} A${r * 0.9} ${r * 0.9} 0 0 0 ${CX + r * 0.78} ${CY + r * 0.42}`}
          fill="none"
          stroke={tones.hi}
          strokeOpacity={0.75}
          strokeWidth={r * 0.09}
          strokeLinecap="round"
        />
        {/* Üstte geniş, yumuşak parlaklık. */}
        <Ellipse cx={CX - r * 0.08} cy={CY - r * 0.52} rx={r * 0.72} ry={r * 0.38} fill={`url(#${id}g)`} />
      </G>
      {/* İnce, kendi renginin koyu tonunda kenar (kalın kontur yok). */}
      <Circle cx={CX} cy={CY} r={r - stroke / 2} fill="none" stroke={tones.rim} strokeOpacity={0.55} strokeWidth={stroke} />
      {/* İri yansıma + küçük nokta. */}
      <Ellipse
        cx={CX - r * 0.4}
        cy={CY - r * 0.46}
        rx={r * 0.26}
        ry={r * 0.13}
        transform={`rotate(-38 ${CX - r * 0.4} ${CY - r * 0.46})`}
        fill={UCLU_BOARD.beamCore}
        fillOpacity={0.95}
      />
      <Circle cx={CX - r * 0.66} cy={CY - r * 0.12} r={r * 0.065} fill={UCLU_BOARD.beamCore} fillOpacity={0.85} />
    </G>
  );
}

/** Altın Top panelleri: ortası beyaz, çevresi takım renkleri (her renge vurur). */
function RainbowPanels({ r }: { r: number }) {
  const center = ring(0, 0, 5, () => 0.3);
  const outer = center.map((_, i) =>
    ring(Math.cos(((-90 + 72 * i) * Math.PI) / 180) * 0.86, Math.sin(((-90 + 72 * i) * Math.PI) / 180) * 0.86, 5, () => 0.3, -90 + 72 * i + 180),
  );
  return (
    <G transform={`translate(${CX} ${CY}) scale(${r})`}>
      <G stroke={UCLU_BOARD.goldDeep} strokeWidth={0.06} strokeLinecap="round">
        {center.map((p, i) => (
          <Path key={i} d={`M${p[0]} ${p[1]} L${outer[i][0][0]} ${outer[i][0][1]}`} />
        ))}
      </G>
      <Polygon points={pts(center)} fill={UCLU_BOARD.beamCore} stroke={UCLU_BOARD.goldDeep} strokeWidth={0.05} strokeLinejoin="round" />
      {outer.map((o, i) => (
        <Polygon key={i} points={pts(o)} fill={UCLU_PIECE_COLORS[i].base} stroke={UCLU_BOARD.goldDeep} strokeWidth={0.05} strokeLinejoin="round" />
      ))}
    </G>
  );
}

function Sparkle({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const k = r * 0.28;
  return (
    <Path
      d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`}
      fill={fill}
    />
  );
}

/* ───────────────────────────── özel işaretler ───────────────────────────── */

/** Füze: topun iki yanında hız çizgileri (topun arkasında çizilir). */
function SpeedLines({ vertical }: { vertical: boolean }) {
  const lines: [number, number, number][] = [
    [36, 3, 11],
    [48, 1, 13],
    [60, 3, 11],
  ];
  return (
    <G transform={vertical ? `rotate(90 ${CX} ${CY})` : undefined}>
      {[false, true].map((flip) => (
        <G key={String(flip)} transform={flip ? `rotate(180 ${CX} ${CY})` : undefined}>
          {lines.map(([y, x0, len]) => (
            <G key={y}>
              <Path d={`M${x0 + 1} ${y + (CY - 47)} L${x0 + len} ${y + (CY - 47)}`} stroke={UCLU_BOARD.iconShadow} strokeWidth={5} strokeLinecap="round" />
              <Path d={`M${x0 + 1} ${y + (CY - 48)} L${x0 + len} ${y + (CY - 48)}`} stroke={UCLU_BOARD.speed} strokeWidth={4} strokeLinecap="round" />
            </G>
          ))}
        </G>
      ))}
    </G>
  );
}

/** Füze: topun üstünden geçen iki kalın beyaz hız şeridi (topa kırpılır). */
function MotionStripes({ id, r, vertical }: { id: string; r: number; vertical: boolean }) {
  return (
    <G clipPath={`url(#${id}c)`}>
      <G transform={vertical ? `rotate(90 ${CX} ${CY})` : undefined}>
        {[-0.34, 0.1].map((k) => (
          <G key={k}>
            <Rect x={0} y={CY + r * k + 1.5} width={100} height={r * 0.24} fill={UCLU_BOARD.iconShadow} />
            <Rect x={0} y={CY + r * k + 0.5} width={100} height={r * 0.24 - 1} fill={UCLU_BOARD.speed} />
          </G>
        ))}
      </G>
    </G>
  );
}

const BURST = ring(CX, CY, 14, (i) => (i % 2 ? 39 : 48.5));
const BURST_IN = ring(CX, CY, 14, (i) => (i % 2 ? 36 : 42));

/* ───────────────────────────── taş çizimi ───────────────────────────── */

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
  const rocket = special === "h" || special === "v";
  const bomb = special === "bomb";
  const id = `ub${idx}${special}`;
  const r = rocket ? 40 : bomb ? 38 : R;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        {bomb ? (
          <G>
            <Defs>
              <RadialGradient id={`${id}h`} cx="50%" cy="50%" r="50%">
                <Stop offset="0.5" stopColor={UCLU_BOARD.glowWarm} stopOpacity={0.95} />
                <Stop offset="1" stopColor={UCLU_BOARD.glowWarm} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={CX} cy={CY} r={50} fill={`url(#${id}h)`} />
            <Polygon points={pts(BURST)} fill={UCLU_BOARD.burstHot} stroke={UCLU_BOARD.burstHot} strokeWidth={3} strokeLinejoin="round" />
            <Polygon points={pts(BURST_IN)} fill={UCLU_BOARD.comboWarm} />
          </G>
        ) : null}
        {rocket ? <SpeedLines vertical={special === "v"} /> : null}
        <Ellipse cx={50} cy={95} rx={r * 0.72} ry={4} fill={UCLU_BOARD.shadow} />
        <Ball id={id} tones={pal} pattern={pal.pattern} r={r} />
        {rocket ? <MotionStripes id={id} r={r} vertical={special === "v"} /> : null}
        {bomb ? (
          <G>
            <Sparkle x={12} y={13} r={9} fill={UCLU_BOARD.goldHi} />
            <Sparkle x={88} y={84} r={8} fill={UCLU_BOARD.beamCore} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
});

const GOLD_TONES: BallTones = {
  hi: UCLU_BOARD.goldHi,
  base: UCLU_BOARD.gold,
  lo: UCLU_BOARD.goldLo,
  rim: UCLU_BOARD.goldDeep,
  panel: UCLU_BOARD.goldDeep,
};

function GoldenBall({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ugoldh" cx="50%" cy="50%" r="50%">
            <Stop offset="0.55" stopColor={UCLU_BOARD.goldHi} stopOpacity={1} />
            <Stop offset="1" stopColor={UCLU_BOARD.goldHi} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={CX} cy={CY} r={50} fill="url(#ugoldh)" />
        <Circle cx={CX} cy={CY} r={45} fill="none" stroke={UCLU_BOARD.beamCore} strokeWidth={2.5} strokeDasharray="3 6" strokeLinecap="round" />
        <Ellipse cx={50} cy={95} rx={28} ry={4} fill={UCLU_BOARD.shadow} />
        <Ball id="ugold" tones={GOLD_TONES} pattern="classic" r={41} rainbow />
        <Sparkle x={84} y={15} r={10} fill={UCLU_BOARD.beamCore} />
        <Sparkle x={14} y={80} r={7} fill={UCLU_BOARD.beamCore} />
        <Sparkle x={86} y={74} r={5} fill={UCLU_BOARD.goldHi} />
      </Svg>
    </View>
  );
}

const CUP = "M32 23 L68 23 L67 39 C66 51 59 59 50 59 C41 59 34 51 33 39 Z";
const STAR5 = (cx: number, cy: number, r: number) => pts(ring(cx, cy, 10, (i) => (i % 2 ? r * 0.45 : r)));

/** Kupa çizimi (iki geçiş: lacivert kontur, sonra altın dolgu). */
function Cup({ outline }: { outline: boolean }) {
  const s = outline
    ? {
        fill: UCLU_BOARD.goldDeep,
        stroke: UCLU_BOARD.goldDeep,
        strokeWidth: 3,
        strokeLinejoin: "round" as const,
      }
    : { fill: UCLU_BOARD.gold };
  const handle = outline
    ? {
        fill: "none",
        stroke: UCLU_BOARD.goldDeep,
        strokeWidth: 8,
        strokeLinecap: "round" as const,
      }
    : {
        fill: "none",
        stroke: UCLU_BOARD.gold,
        strokeWidth: 5,
        strokeLinecap: "round" as const,
      };
  return (
    <G>
      <Path d="M34 28 C23 28 21 34 22.5 39 C24 45 30 48 36 48" {...handle} />
      <Path d="M66 28 C77 28 79 34 77.5 39 C76 45 70 48 64 48" {...handle} />
      <Path d={CUP} {...s} />
      <Rect x={45.5} y={57} width={9} height={11} {...s} />
      <Rect x={35} y={67} width={30} height={10} rx={3} {...s} />
      {outline ? null : (
        <G>
          <Polygon points={STAR5(50, 39, 9)} fill={UCLU_BOARD.beamCore} />
          <Rect x={35} y={67} width={30} height={3} fill={UCLU_BOARD.goldDeep} opacity={0.35} />
          <Ellipse cx={40} cy={32} rx={3} ry={6} fill={UCLU_BOARD.goldHi} fillOpacity={0.9} />
        </G>
      )}
    </G>
  );
}

/** Şampiyonluk kupası: cam bir küre (top) içinde altın kupa. */
function TrophyGlyph({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ucuph" cx="50%" cy="45%" r="52%">
            <Stop offset="0" stopColor={UCLU_BOARD.goldHi} stopOpacity={0.9} />
            <Stop offset="1" stopColor={UCLU_BOARD.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={50} cy={95} rx={30} ry={4} fill={UCLU_BOARD.shadow} />
        <Circle cx={CX} cy={CY} r={R} fill={UCLU_BOARD.bubble} />
        <Circle cx={CX} cy={CY} r={R - 4} fill="url(#ucuph)" />
        <G transform={`translate(${CX} ${CY + 1}) scale(0.92) translate(-50 -50)`}>
          <Cup outline />
          <Cup outline={false} />
        </G>
        <Path
          d={`M${CX - 30} ${CY + 24} A36 36 0 0 0 ${CX + 30} ${CY + 24}`}
          fill="none"
          stroke={UCLU_BOARD.bubbleRim}
          strokeOpacity={0.8}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Circle cx={CX} cy={CY} r={R - 0.8} fill="none" stroke={UCLU_BOARD.bubbleRim} strokeOpacity={0.9} strokeWidth={1.6} />
        <Ellipse cx={CX - 18} cy={CY - 22} rx={12} ry={6} transform={`rotate(-38 ${CX - 18} ${CY - 22})`} fill={UCLU_BOARD.beamCore} fillOpacity={0.95} />
        <Sparkle x={83} y={16} r={8} fill={UCLU_BOARD.beamCore} />
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
  /** Ortak boşta-yaşam sürücüsünden bu taşın fazına göre türetilmiş değerler (yoksa durağan). */
  idle?: IdleAnim;
  /** Hareketi azalt açık: seçili zıplama vb. kapalı. */
  still?: boolean;
}

/** Tek ortak sürücüden türetilen, taş başına fazlı nefes / salınım değerleri. */
export interface IdleAnim {
  bob: Animated.AnimatedInterpolation<number>;
  breathe: Animated.AnimatedInterpolation<number>;
  /** Özel taşlar için daha belirgin nabız. */
  pulse: Animated.AnimatedInterpolation<number>;
}

/** Fazlı sinüs: 0..1 sürücüsünden `phase` kaydırmalı, `lo`..`hi` aralığında örnek. */
export function phased(v: Animated.Value, phase: number, lo: number, hi: number) {
  const n = 12;
  const inputRange = Array.from({ length: n + 1 }, (_, i) => i / n);
  const outputRange = inputRange.map((x) => lo + ((hi - lo) * (1 + Math.sin((x + phase) * Math.PI * 2))) / 2);
  return v.interpolate({ inputRange, outputRange });
}

function TileViewBase({ tile, row, col, cell, spawnRow, dying, selected, hintDx, hintDy, hintTick, idle, still }: TileViewProps) {
  const startRow = spawnRow ?? row;
  const pos = useRef(new Animated.ValueXY({ x: col * cell, y: startRow * cell })).current;
  const scale = useRef(new Animated.Value(spawnRow === undefined ? 0.2 : 1)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const last = useRef({ row: startRow, col });

  // İlk çizim: yerinde doğan (özel taş) taş "pop" ile belirir.
  useEffect(() => {
    if (spawnRow === undefined) {
      Animated.spring(scale, {
        toValue: 1,
        damping: 9,
        stiffness: 260,
        mass: 0.7,
        useNativeDriver: true,
      }).start();
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
          Animated.timing(squash, {
            toValue: 0.86,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.spring(squash, {
            toValue: 1,
            damping: 7,
            stiffness: 320,
            mass: 0.6,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      Animated.timing(pos, {
        toValue: target,
        duration: duration.base - 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
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
        Animated.timing(scale, {
          toValue: 1.26,
          duration: 80,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0,
          duration: 130,
          easing: Easing.in(Easing.back(2)),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(squash, {
          toValue: 0.82,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(squash, {
          toValue: 1.14,
          duration: 110,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        delay: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dying, scale, squash, opacity]);

  useEffect(() => {
    if (dying) return;
    Animated.spring(scale, {
      toValue: selected ? 1.12 : 1,
      damping: 12,
      stiffness: 300,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }, [selected, dying, scale]);

  // Seçili taş zıplar (sonlu döngü; seçim kalkınca durur ve yere iner).
  useEffect(() => {
    if (!selected || dying || still) {
      hop.stopAnimation();
      Animated.timing(hop, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start();
      return;
    }
    const bounceSeq = Animated.sequence([
      Animated.timing(hop, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(hop, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(hop, {
        toValue: -0.25,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(hop, { toValue: 0, duration: 90, useNativeDriver: true }),
    ]);
    const bounce = Animated.loop(bounceSeq, { iterations: 60 });
    bounce.start();
    return () => bounce.stop();
  }, [selected, dying, still, hop]);

  // İpucu: komşusuna doğru sonlu sallanma (3 tur).
  useEffect(() => {
    if (!hintTick) return;
    wiggle.setValue(0);
    const swing = Animated.sequence([
      Animated.timing(wiggle, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(wiggle, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    const loop = Animated.loop(swing, { iterations: 3 });
    loop.start();
    // İpucu taşları sallanırken bir de zıplar.
    if (!still) {
      Animated.sequence([
        Animated.timing(hop, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(hop, {
          toValue: 0,
          damping: 6,
          stiffness: 260,
          mass: 0.6,
          useNativeDriver: true,
        }),
      ]).start();
    }
    return () => loop.stop();
  }, [hintTick, wiggle, hop, still]);

  // Taşlar hücreyi neredeyse doldurur: iri ve kolay okunur.
  const inset = Math.round(cell * 0.035);
  const amp = cell * 0.14;
  const special = tile.special !== "none";
  const hopY = hop.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [cell * 0.05, 0, -cell * 0.2],
  });
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
            {
              translateX: wiggle.interpolate({
                inputRange: [0, 1],
                outputRange: [0, hintDx * amp],
              }),
            },
            {
              translateY: wiggle.interpolate({
                inputRange: [0, 1],
                outputRange: [0, hintDy * amp],
              }),
            },
            {
              translateY: squash.interpolate({
                inputRange: [0.8, 1, 1.2],
                outputRange: [cell * 0.06, 0, 0],
                extrapolate: "clamp",
              }),
            },
            { translateY: hopY },
            { translateY: idle ? idle.bob : 0 },
            { scale: idle ? (special ? idle.pulse : idle.breathe) : 1 },
            { scaleY: squash },
            {
              scaleX: squash.interpolate({
                inputRange: [0.8, 1, 1.2],
                outputRange: [1.14, 1, 0.88],
                extrapolate: "clamp",
              }),
            },
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
export const TileView = React.memo(
  TileViewBase,
  (a, b) =>
    a.tile === b.tile &&
    a.row === b.row &&
    a.col === b.col &&
    a.cell === b.cell &&
    a.dying === b.dying &&
    a.selected === b.selected &&
    a.hintTick === b.hintTick &&
    a.hintDx === b.hintDx &&
    a.hintDy === b.hintDy &&
    a.idle === b.idle &&
    a.still === b.still,
);

const styles = StyleSheet.create({
  tile: { position: "absolute", left: 0, top: 0 },
});
