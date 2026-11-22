/**
 * Elit Üçlü taşları: statik çizim (PieceGlyph) + konumu canlandırılan taş (TileView).
 *
 * Her taş türü PARLAK, TIKNAZ bir FUTBOL NESNESİDİR ve hem şekliyle hem
 * rengiyle ayrılır: mavi top, kırmızı forma, yeşil krampon, sarı kaleci
 * eldiveni, mor düdük, pembe köşe bayrağı. Çizim dili PARLAK 3B: ince koyu
 * kenar (kendi renginin en koyu tonu; net siluet), küresel gradyan gövde,
 * alttan koyulaşma, alt kenarda rim ışığı, geniş cilalı üst parlaklık,
 * keskin specular nokta ve yumuşak temas gölgesi. Taşlar hücrenin ~%90'ını
 * doldurur; sakin tahtada odak noktası onlardır.
 *
 * Özel taşlar RENKSİZDİR, tek bakışta seçilir:
 *   · Füze (h / v): çift başlı kırmızı-beyaz füze (v için 90° döner).
 *   · Dron: dört pervaneli taşıyıcı; patlayınca hedefe uçar.
 *   · Röveşata (bomba): fitilli, altın panelli gece topu.
 *   · Altın Top: metalik altın top, takım renkli paneller, hale.
 * Engeller: şampiyonluk kupası (cam küre içinde) ve antrenman konisi.
 * Hepsi tek SVG; ikon fontu kullanılmaz. Çizimler memo'ludur: aynı tür aynı
 * düğüm ağacını üretir, taş yalnız kimliği değişince yeniden çizilir.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { duration } from "@/theme";
import { UCLU_BOARD, UCLU_PIECE_COLORS, UCLU_SPECIAL, type UcluBallPattern, type UcluPieceColors } from "@/lib/puzzle/ucluPalette";
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

const STAR5 = (cx: number, cy: number, r: number) => pts(ring(cx, cy, 10, (i) => (i % 2 ? r * 0.45 : r)));

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

/* ───────────────────────────── 3B nesne çizimi ───────────────────────────── */

/**
 * PARLAK 3B çizim tekniği: her parça katman katman çizilir —
 *   1. ince koyu kenar (kendi renginin en koyu tonu; net siluet),
 *   2. küresel gradyan gövde (üst-sol açık → alt-sağ koyu),
 *   3. alttan gelen yumuşak koyulaşma (hacim),
 *   4. parça içine kırpılmış alt kenar "rim" ışığı (arkadan vuran ışık).
 * Parlama (specular) ve yer gölgesi her nesnede ayrıca eklenir. Birbirine
 * değen parçalar tek bir dış çizgiyle okunur (önce tüm kenarlar, sonra gövdeler).
 */
type Part =
  | { t: "path"; d: string }
  | {
      t: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      rx: number;
      rot?: string;
    }
  | { t: "circle"; cx: number; cy: number; r: number };

function PartEl({ p, fill, stroke, sw }: { p: Part; fill: string; stroke?: string; sw?: number }) {
  const common = {
    fill,
    stroke,
    strokeWidth: sw,
    strokeLinejoin: "round" as const,
  };
  if (p.t === "path") return <Path d={p.d} {...common} />;
  if (p.t === "rect") return <Rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} transform={p.rot} {...common} />;
  return <Circle cx={p.cx} cy={p.cy} r={p.r} {...common} />;
}

function Chunky({ id, parts, tones, outline = 4.5 }: { id: string; parts: Part[]; tones: BallTones; outline?: number }) {
  return (
    <G>
      <Defs>
        <RadialGradient id={`${id}f`} cx="32%" cy="22%" r="90%">
          <Stop offset="0" stopColor={tones.hi} />
          <Stop offset="0.4" stopColor={tones.base} />
          <Stop offset="1" stopColor={tones.lo} />
        </RadialGradient>
        <LinearGradient id={`${id}d`} x1="0" y1="0" x2="0.25" y2="1">
          <Stop offset="0.45" stopColor={tones.rim} stopOpacity={0} />
          <Stop offset="1" stopColor={tones.rim} stopOpacity={0.6} />
        </LinearGradient>
        <LinearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.55" stopColor={tones.hi} stopOpacity={0} />
          <Stop offset="1" stopColor={tones.hi} stopOpacity={0.85} />
        </LinearGradient>
        <ClipPath id={`${id}k`}>
          {parts.map((p, i) => (
            <PartEl key={i} p={p} fill={UCLU_BOARD.ink} />
          ))}
        </ClipPath>
      </Defs>
      {parts.map((p, i) => (
        <PartEl key={`o${i}`} p={p} fill={tones.rim} stroke={tones.rim} sw={outline} />
      ))}
      {parts.map((p, i) => (
        <PartEl key={`f${i}`} p={p} fill={`url(#${id}f)`} />
      ))}
      {parts.map((p, i) => (
        <PartEl key={`d${i}`} p={p} fill={`url(#${id}d)`} />
      ))}
      <G clipPath={`url(#${id}k)`}>
        {parts.map((p, i) => (
          <PartEl key={`r${i}`} p={p} fill="none" stroke={`url(#${id}r)`} sw={7} />
        ))}
        {/* Geniş, yumuşak üst parlaklık (cilalı yüzey). */}
        <Rect x={0} y={0} width={100} height={100} fill="url(#usheeng)" />
      </G>
    </G>
  );
}

/** Ortak parlama gradyanı (beyaz merkez → saydam kenar); her SVG'de bir kez tanımlanır. */
function GlossDefs() {
  return (
    <Defs>
      <RadialGradient id="uglossg" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={UCLU_BOARD.beamCore} stopOpacity={0.95} />
        <Stop offset="0.6" stopColor={UCLU_BOARD.beamCore} stopOpacity={0.7} />
        <Stop offset="1" stopColor={UCLU_BOARD.beamCore} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="usheeng" cx="34%" cy="12%" r="58%">
        <Stop offset="0" stopColor={UCLU_BOARD.beamCore} stopOpacity={0.42} />
        <Stop offset="0.7" stopColor={UCLU_BOARD.beamCore} stopOpacity={0.08} />
        <Stop offset="1" stopColor={UCLU_BOARD.beamCore} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="ushadowg" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={UCLU_BOARD.pieceShadow} stopOpacity={1} />
        <Stop offset="1" stopColor={UCLU_BOARD.pieceShadow} stopOpacity={0} />
      </RadialGradient>
    </Defs>
  );
}

/** Üst-sol parlama (specular): yumuşak kenarlı iri leke + keskin küçük nokta. */
function Gloss({ x, y, rx, ry, rot = -32 }: { x: number; y: number; rx: number; ry: number; rot?: number }) {
  return (
    <G>
      <Ellipse cx={x} cy={y} rx={rx * 1.35} ry={ry * 1.35} transform={`rotate(${rot} ${x} ${y})`} fill="url(#uglossg)" />
      <Ellipse cx={x} cy={y} rx={rx * 0.55} ry={ry * 0.5} transform={`rotate(${rot} ${x} ${y})`} fill={UCLU_BOARD.beamCore} fillOpacity={0.9} />
      <Circle cx={x - rx * 0.9} cy={y + ry * 1.9} r={Math.max(1.6, ry * 0.42)} fill={UCLU_BOARD.beamCore} fillOpacity={0.75} />
    </G>
  );
}

/** Yumuşak yer (temas) gölgesi. */
const Shadow = ({ rx = 30, cx = 50, cy = 93 }: { rx?: number; cx?: number; cy?: number }) => <Ellipse cx={cx} cy={cy} rx={rx} ry={6} fill="url(#ushadowg)" />;

/* ── forma ── */
const JERSEY = "M30 15 L41 11 Q50 21 59 11 L70 15 L91 31 L80 47 L72 42 L72 86 Q50 93 28 86 L28 42 L20 47 L9 31 Z";
function Jersey({ id, pal }: { id: string; pal: UcluPieceColors }) {
  return (
    <G>
      <Shadow rx={28} />
      <Defs>
        <ClipPath id={`${id}c`}>
          <Path d={JERSEY} />
        </ClipPath>
      </Defs>
      <Chunky id={id} tones={pal} parts={[{ t: "path", d: JERSEY }]} />
      <G clipPath={`url(#${id}c)`}>
        <Path d="M14 27 L25 43" stroke={UCLU_BOARD.beamCore} strokeWidth={5} strokeLinecap="round" />
        <Path d="M86 27 L75 43" stroke={UCLU_BOARD.beamCore} strokeWidth={5} strokeLinecap="round" />
        <Path d="M28 82 Q50 90 72 82 L72 96 L28 96 Z" fill={pal.lo} opacity={0.6} />
        <Path d="M30 42 L30 86" stroke={pal.rim} strokeOpacity={0.25} strokeWidth={2} />
        {/* Kol altı gölgesi ve yan kıvrım: gövdeye hacim verir. */}
        <Path d="M28 42 L36 46 L34 86 L28 86 Z" fill={pal.rim} opacity={0.18} />
        <Path d="M72 42 L64 46 L66 86 L72 86 Z" fill={pal.rim} opacity={0.28} />
        <Path d="M60 60 Q64 72 58 84" fill="none" stroke={pal.rim} strokeOpacity={0.22} strokeWidth={3} strokeLinecap="round" />
      </G>
      <Path d="M40 10.5 Q50 27 60 10.5 L56 9.5 Q50 19 44 9.5 Z" fill={UCLU_BOARD.beamCore} stroke={pal.rim} strokeWidth={1.4} strokeLinejoin="round" />
      <Circle cx={50} cy={55} r={12} fill={UCLU_BOARD.beamCore} stroke={pal.rim} strokeWidth={1.6} />
      <Polygon points={STAR5(50, 55.5, 8.5)} fill={pal.panel} />
      <Gloss x={38} y={28} rx={9} ry={4.5} />
    </G>
  );
}

/* ── krampon ── */
const BOOT_UPPER = "M12 32 Q12 20 23 20 L40 20 Q44 34 57 40 L79 47 Q93 51 92 62 L92 66 L12 66 Z";
const BOOT_SOLE = "M8 63 L94 63 Q97 74 86 75 L15 75 Q6 75 8 63 Z";
function Boot({ id, pal }: { id: string; pal: UcluPieceColors }) {
  return (
    <G>
      <Shadow rx={36} />
      {/* Hafif eğik ve iri: hücreyi dikeyde de doldurur, siluet daha canlı. */}
      <G transform="translate(50 50) rotate(-10) scale(1.1) translate(-50 -52)">
        {[17, 31, 57, 72, 84].map((x) => (
          <Rect key={x} x={x - 4} y={72} width={8} height={9} rx={2.5} fill={pal.panel} stroke={pal.rim} strokeWidth={2} />
        ))}
        <Chunky id={id} tones={pal} parts={[{ t: "path", d: BOOT_UPPER }]} />
        <Path d={BOOT_SOLE} fill={UCLU_BOARD.beamCore} stroke={pal.rim} strokeWidth={4} strokeLinejoin="round" />
        <Path d="M12 68 L92 68" stroke={UCLU_SPECIAL.rocketBodyLo} strokeWidth={2.4} />
        <Ellipse cx={25} cy={21.5} rx={11} ry={4} fill={pal.rim} />
        <Path d="M24 57 L42 44 L48 52 L70 41" fill="none" stroke={UCLU_BOARD.beamCore} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <G stroke={UCLU_BOARD.beamCore} strokeWidth={3} strokeLinecap="round">
          <Path d="M38 27 L46 24" />
          <Path d="M41 32 L50 29" />
          <Path d="M45 37 L54 34" />
        </G>
        <Gloss x={27} y={34} rx={8} ry={4} />
      </G>
    </G>
  );
}

/* ── kaleci eldiveni ── */
const GLOVE: Part[] = [
  { t: "rect", x: 9, y: 40, w: 15, h: 30, rx: 7.5, rot: "rotate(-34 16 55)" },
  { t: "rect", x: 26, y: 15, w: 12.5, h: 40, rx: 6.25 },
  { t: "rect", x: 38.5, y: 9, w: 12.5, h: 44, rx: 6.25 },
  { t: "rect", x: 51, y: 11, w: 12.5, h: 42, rx: 6.25 },
  { t: "rect", x: 63.5, y: 18, w: 12, h: 36, rx: 6 },
  { t: "rect", x: 25, y: 36, w: 52, h: 42, rx: 15 },
];
function Glove({ id, pal }: { id: string; pal: UcluPieceColors }) {
  return (
    <G>
      <Shadow rx={26} />
      <Chunky id={id} tones={pal} parts={GLOVE} />
      <G stroke={pal.panel} strokeWidth={1.8} strokeLinecap="round">
        <Path d="M38.5 22 L38.5 44" />
        <Path d="M51 18 L51 44" />
        <Path d="M63.5 24 L63.5 44" />
      </G>
      <Rect x={33} y={46} width={36} height={22} rx={10} fill={pal.hi} fillOpacity={0.5} />
      <Rect x={27} y={72} width={48} height={19} rx={6} fill={pal.panel} stroke={pal.rim} strokeWidth={3.5} />
      <Rect x={27} y={79} width={48} height={4.5} fill={UCLU_BOARD.beamCore} />
      <Gloss x={33} y={24} rx={4} ry={8} rot={0} />
    </G>
  );
}

/* ── düdük ── */
const WHISTLE: Part[] = [
  { t: "rect", x: 38, y: 33, w: 54, h: 21, rx: 7 },
  { t: "circle", cx: 40, cy: 60, r: 27 },
];
function Whistle({ id, pal }: { id: string; pal: UcluPieceColors }) {
  return (
    <G>
      <Shadow rx={30} />
      <G transform="translate(50 50) scale(1.06) translate(-50 -50)">
        <Circle cx={21} cy={28} r={10} fill="none" stroke={pal.rim} strokeWidth={10} />
        <Circle cx={21} cy={28} r={10} fill="none" stroke={UCLU_SPECIAL.rocketBodyLo} strokeWidth={4.5} />
        <Chunky id={id} tones={pal} parts={WHISTLE} />
        <Rect x={58} y={29} width={18} height={8} rx={3.5} fill={pal.rim} />
        <Rect x={84} y={36} width={6} height={15} rx={3} fill={pal.panel} />
        <Circle cx={40} cy={61} r={11} fill={pal.panel} />
        <Circle cx={40} cy={61} r={5} fill={pal.rim} />
        <Circle cx={36.5} cy={57.5} r={2.6} fill={pal.hi} />
        <Gloss x={28} y={45} rx={9} ry={4.5} />
      </G>
    </G>
  );
}

/* ── köşe bayrağı ── */
const FLAG = "M28 14 Q46 6 62 14 Q76 21 90 14 L90 52 Q76 59 62 52 Q46 44 28 52 Z";
function CornerFlag({ id, pal }: { id: string; pal: UcluPieceColors }) {
  return (
    <G>
      <Ellipse cx={26} cy={91} rx={16} ry={5} fill={UCLU_BOARD.grassLo} />
      <Path d="M14 91 Q18 82 20 90 Q24 80 27 90 Q31 81 34 90 Q37 84 39 91 Z" fill={UCLU_BOARD.grass} />
      <Rect x={20} y={8} width={9} height={84} rx={4.5} fill={pal.rim} />
      <Rect x={21.8} y={9} width={5.4} height={82} rx={2.7} fill={UCLU_BOARD.beamCore} />
      <Defs>
        <ClipPath id={`${id}c`}>
          <Path d={FLAG} />
        </ClipPath>
      </Defs>
      <Chunky id={id} tones={pal} parts={[{ t: "path", d: FLAG }]} outline={6} />
      <G clipPath={`url(#${id}c)`} fill={UCLU_BOARD.beamCore} opacity={0.92}>
        <Rect x={45} y={0} width={17} height={32} />
        <Rect x={62} y={32} width={15} height={30} />
        <Rect x={28} y={32} width={17} height={30} />
        <Rect x={77} y={0} width={15} height={32} />
      </G>
      <Circle cx={24.5} cy={9} r={6} fill={UCLU_BOARD.gold} stroke={UCLU_BOARD.goldDeep} strokeWidth={2} />
      <Gloss x={40} y={18} rx={7} ry={3} rot={-14} />
    </G>
  );
}

/* ── renksiz özel taşlar ── */

const ROCKET_TONES: BallTones = {
  hi: UCLU_SPECIAL.rocketBody,
  base: UCLU_SPECIAL.rocketBody,
  lo: UCLU_SPECIAL.rocketBodyLo,
  rim: UCLU_SPECIAL.rocketRim,
  panel: UCLU_SPECIAL.rocketNose,
};
const NOSE_TONES: BallTones = {
  hi: UCLU_SPECIAL.rocketNoseHi,
  base: UCLU_SPECIAL.rocketNose,
  lo: UCLU_SPECIAL.rocketNoseLo,
  rim: UCLU_SPECIAL.rocketRim,
  panel: UCLU_SPECIAL.rocketNoseLo,
};

/** Çift başlı füze (yatay; dikey için 90° döner). */
function Rocket({ vertical }: { vertical: boolean }) {
  return (
    <G transform={`${vertical ? `rotate(90 ${CX} ${CX}) ` : ""}translate(50 50) scale(1.14 1.22) translate(-50 -50)`}>
      <Defs>
        <RadialGradient id="urkglow" cx="50%" cy="50%" r="50%">
          <Stop offset="0.3" stopColor={UCLU_BOARD.glowCool} stopOpacity={0.85} />
          <Stop offset="1" stopColor={UCLU_BOARD.glowCool} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={50} cy={50} rx={50} ry={34} fill="url(#urkglow)" />
      <Chunky
        id="urkfin"
        tones={NOSE_TONES}
        parts={[
          { t: "path", d: "M38 39 L44 24 L56 24 L62 39 Z" },
          { t: "path", d: "M38 61 L44 76 L56 76 L62 61 Z" },
        ]}
        outline={6}
      />
      <Chunky id="urkbody" tones={ROCKET_TONES} parts={[{ t: "rect", x: 22, y: 37, w: 56, h: 26, rx: 7 }]} outline={6} />
      <Chunky
        id="urknose"
        tones={NOSE_TONES}
        parts={[
          { t: "path", d: "M24 36 Q7 41 5 50 Q7 59 24 64 Z" },
          { t: "path", d: "M76 36 Q93 41 95 50 Q93 59 76 64 Z" },
        ]}
        outline={6}
      />
      <Rect x={44} y={35} width={12} height={30} rx={3} fill={UCLU_SPECIAL.rocketBand} stroke={UCLU_SPECIAL.rocketBandLo} strokeWidth={2} />
      {[33, 67].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={50} r={6} fill={UCLU_SPECIAL.droneHi} stroke={UCLU_SPECIAL.rocketRim} strokeWidth={2.4} />
          <Circle cx={x - 1.8} cy={48} r={2} fill={UCLU_BOARD.beamCore} />
        </G>
      ))}
      <Rect x={26} y={39.5} width={16} height={4} rx={2} fill={UCLU_BOARD.beamCore} fillOpacity={0.9} />
    </G>
  );
}

const BOMB_TONES: BallTones = {
  hi: UCLU_SPECIAL.bombHi,
  base: UCLU_SPECIAL.bomb,
  lo: UCLU_SPECIAL.bombLo,
  rim: UCLU_SPECIAL.bombLo,
  panel: UCLU_SPECIAL.bombPanel,
};

/** Röveşata: fitilli, altın panelli gece topu. */
function Bomb() {
  return (
    <G>
      <Defs>
        <RadialGradient id="ubmh" cx="50%" cy="55%" r="50%">
          <Stop offset="0.45" stopColor={UCLU_BOARD.glowWarm} stopOpacity={0.9} />
          <Stop offset="1" stopColor={UCLU_BOARD.glowWarm} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={CX} cy={54} r={50} fill="url(#ubmh)" />
      <Path d="M62 24 Q70 10 82 13" fill="none" stroke={UCLU_SPECIAL.bombLo} strokeWidth={8} strokeLinecap="round" />
      <Path d="M62 24 Q70 10 82 13" fill="none" stroke={UCLU_SPECIAL.fuse} strokeWidth={4} strokeLinecap="round" />
      <G transform="translate(0 6) scale(1)">
        <Shadow rx={30} cy={88} />
        <Ball id="ubomb" tones={BOMB_TONES} pattern="classic" r={40} stroke={3} />
      </G>
      <Rect x={53} y={17} width={16} height={11} rx={3} transform="rotate(35 61 22)" fill={UCLU_SPECIAL.bombHi} stroke={UCLU_SPECIAL.bombLo} strokeWidth={2.5} />
      <Sparkle x={84} y={12} r={11} fill={UCLU_SPECIAL.sparkHot} />
      <Sparkle x={84} y={12} r={6} fill={UCLU_SPECIAL.spark} />
    </G>
  );
}

const DRONE_TONES: BallTones = {
  hi: UCLU_SPECIAL.droneHi,
  base: UCLU_SPECIAL.droneBody,
  lo: UCLU_SPECIAL.droneLo,
  rim: UCLU_SPECIAL.droneRim,
  panel: UCLU_SPECIAL.droneLo,
};

/** Dron: dört pervaneli, iri gözlü taşıyıcı. */
export function DroneArt({ spin = 0 }: { spin?: number }) {
  return (
    <G>
      <Shadow rx={26} />
      <G stroke={UCLU_SPECIAL.droneRim} strokeWidth={13} strokeLinecap="round">
        <Path d="M22 24 L78 76" />
        <Path d="M78 24 L22 76" />
      </G>
      <G stroke={UCLU_SPECIAL.droneArm} strokeWidth={7} strokeLinecap="round">
        <Path d="M22 24 L78 76" />
        <Path d="M78 24 L22 76" />
      </G>
      {[
        [20, 22],
        [80, 22],
        [20, 76],
        [80, 76],
      ].map(([x, y]) => (
        <G key={`${x}${y}`}>
          <Ellipse cx={x} cy={y} rx={18} ry={6.5} transform={`rotate(${spin} ${x} ${y})`} fill={UCLU_SPECIAL.rotor} stroke={UCLU_SPECIAL.rotorEdge} strokeWidth={1.6} />
          <Circle cx={x} cy={y} r={4.5} fill={UCLU_SPECIAL.droneArm} stroke={UCLU_SPECIAL.droneRim} strokeWidth={1.6} />
        </G>
      ))}
      <Chunky id="udrn" tones={DRONE_TONES} parts={[{ t: "rect", x: 29, y: 31, w: 42, h: 38, rx: 15 }]} outline={6} />
      <Circle cx={50} cy={53} r={10} fill={UCLU_BOARD.beamCore} stroke={UCLU_SPECIAL.droneRim} strokeWidth={2.4} />
      <Circle cx={50} cy={54} r={6} fill={UCLU_SPECIAL.droneEye} />
      <Circle cx={47.6} cy={51.6} r={2.2} fill={UCLU_BOARD.beamCore} />
      <Circle cx={50} cy={36.5} r={3} fill={UCLU_SPECIAL.droneLed} />
      <Gloss x={38} y={39} rx={6} ry={3} />
    </G>
  );
}

const CONE_TONES: BallTones = {
  hi: UCLU_SPECIAL.coneHi,
  base: UCLU_SPECIAL.cone,
  lo: UCLU_SPECIAL.coneLo,
  rim: UCLU_SPECIAL.coneRim,
  panel: UCLU_SPECIAL.coneStripe,
};
const CONE = "M43 12 Q50 7 57 12 L79 80 L21 80 Z";

/** Antrenman konisi: 2 katlıda iki beyaz şerit, 1 katlıda tek. */
function Cone({ hp }: { hp: number }) {
  return (
    <G>
      <Shadow rx={34} />
      <Rect x={13} y={76} width={74} height={14} rx={5} fill={UCLU_SPECIAL.coneBase} stroke={UCLU_SPECIAL.coneRim} strokeWidth={3} />
      <Defs>
        <ClipPath id={`ucn${hp}c`}>
          <Path d={CONE} />
        </ClipPath>
      </Defs>
      <Chunky id={`ucn${hp}`} tones={CONE_TONES} parts={[{ t: "path", d: CONE }]} outline={6} />
      <G clipPath={`url(#ucn${hp}c)`} fill={UCLU_SPECIAL.coneStripe}>
        <Rect x={0} y={hp >= 2 ? 30 : 42} width={100} height={10} />
        {hp >= 2 ? <Rect x={0} y={54} width={100} height={10} /> : null}
      </G>
      <Path d="M44 18 L36 70" stroke={UCLU_BOARD.beamCore} strokeOpacity={0.55} strokeWidth={4} strokeLinecap="round" />
    </G>
  );
}

/* ───────────────────────────── taş çizimi ───────────────────────────── */

export interface PieceGlyphProps {
  kind: Tile["kind"];
  color: number;
  special: Special;
  size: number;
  /** Koni canı. */
  hp?: number;
}

/** Statik taş çizimi — HUD hedeflerinde ve uçan simgelerde de kullanılır. */
export const PieceGlyph = React.memo(function PieceGlyph({ kind, color, special, size, hp }: PieceGlyphProps) {
  if (kind === "trophy") return <TrophyGlyph size={size} />;
  if (special === "ball") return <GoldenBall size={size} />;
  let body: React.ReactNode;
  if (kind === "cone") body = <Cone hp={hp ?? 1} />;
  else if (special === "h" || special === "v") body = <Rocket vertical={special === "v"} />;
  else if (special === "bomb") body = <Bomb />;
  else if (special === "drone") body = <DroneArt />;
  else {
    const idx = Math.max(0, color) % UCLU_PIECE_COLORS.length;
    const pal = UCLU_PIECE_COLORS[idx];
    const id = `up${idx}`;
    if (pal.shape === "jersey") body = <Jersey id={id} pal={pal} />;
    else if (pal.shape === "boot") body = <Boot id={id} pal={pal} />;
    else if (pal.shape === "glove") body = <Glove id={id} pal={pal} />;
    else if (pal.shape === "whistle") body = <Whistle id={id} pal={pal} />;
    else if (pal.shape === "flag") body = <CornerFlag id={id} pal={pal} />;
    else
      body = (
        <G>
          <Shadow rx={34} cy={93} />
          <Ball id={id} tones={pal} pattern={pal.pattern} r={R} stroke={3} />
        </G>
      );
  }
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <GlossDefs />
        {body}
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
        <GlossDefs />
        <Shadow rx={30} cy={94} />
        <Ball id="ugold" tones={GOLD_TONES} pattern="classic" r={41} rainbow />
        <Sparkle x={84} y={15} r={10} fill={UCLU_BOARD.beamCore} />
        <Sparkle x={14} y={80} r={7} fill={UCLU_BOARD.beamCore} />
        <Sparkle x={86} y={74} r={5} fill={UCLU_BOARD.goldHi} />
      </Svg>
    </View>
  );
}

const CUP = "M32 23 L68 23 L67 39 C66 51 59 59 50 59 C41 59 34 51 33 39 Z";

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
        <GlossDefs />
        <Shadow rx={32} cy={94} />
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
  /** Patlama gecikmesi (ms): füze / şok dalgası bu taşa ulaşınca söner. */
  dieDelay?: number;
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

function TileViewBase({ tile, row, col, cell, spawnRow, dying, dieDelay = 0, selected, hintDx, hintDy, hintTick, idle, still }: TileViewProps) {
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
    const pop = Animated.parallel([
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
    ]);
    (dieDelay > 0 ? Animated.sequence([Animated.delay(dieDelay), pop]) : pop).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const inset = Math.round(cell * 0.02);
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
      <PieceGlyph kind={tile.kind} color={tile.color} special={tile.special} hp={tile.hp} size={cell - inset * 2} />
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
    a.dieDelay === b.dieDelay &&
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
