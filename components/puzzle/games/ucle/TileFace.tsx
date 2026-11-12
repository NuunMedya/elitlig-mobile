import React, { memo } from "react";
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";
import { fonts } from "@/theme";
import { UCLE_COLORS, UCLE_KINDS, type UclePattern, type UcleShape } from "@/lib/puzzle/uclePalette";

/**
 * KULÜP ARMASI ROZETLERİ — Üçle Kazan karoları.
 *
 * Her tür kendi SİLÜETİ (kalkan, yuvarlak, altıgen, baklava, taç, mühür…),
 * iki renkli FORMA DESENİ (çubuk, yatay şerit, yarım, kuşak, V, çeyrek…) ve
 * ortak ALTIN METAL ÇERÇEVEYLE çizilmiş emaye bir rozettir. İçte ikon / harf
 * yok: tür biçim + renk + desenle okunur. Rozetin altında metal kalınlığı
 * (2.5D) ve yumuşak bir gölge vardır; üst üste binen karolar gerçek bir rozet
 * yığını gibi görünür.
 *
 * Çizim 100×100 birimlik yüz kutusunda tanımlanır ve karo boyuna ölçeklenir.
 * Saf çizim (tek SVG); kimlikler (id) türe göre sabittir — aynı türün bütün
 * örneklerinde tanım birebir aynı olduğu için çakışma zararsızdır.
 */

/* ───────────────────────────── geometri ───────────────────────────── */

type Pt = readonly [number, number];
const poly = (p: readonly Pt[]) => `M${p.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join(" L")} Z`;

function starPath(cx: number, cy: number, ro: number, ri: number, n: number): string {
  return poly(
    Array.from({ length: n * 2 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const r = i % 2 ? ri : ro;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    }),
  );
}

function regular(cx: number, cy: number, r: number, n: number): string {
  return poly(
    Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    }),
  );
}

function rosettePath(cx: number, cy: number, rin: number, rc: number, n: number): string {
  const at = (a: number, r: number) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  const step = (Math.PI * 2) / n;
  const a0 = -Math.PI / 2;
  let d = `M${at(a0, rin)}`;
  for (let i = 0; i < n; i++) {
    d += ` Q${at(a0 + step * (i + 0.5), rc)} ${at(a0 + step * (i + 1), rin)}`;
  }
  return `${d} Z`;
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}

const SHAPES: Record<UcleShape | "back", string> = {
  shield: "M7 9 Q50 2 93 9 V46 C93 70 75 86 50 96 C25 86 7 70 7 46 Z",
  round: "M50 5 A45 45 0 1 1 49.99 5 Z",
  hex: poly([
    [27, 8],
    [73, 8],
    [96, 50],
    [73, 92],
    [27, 92],
    [4, 50],
  ]),
  diamond: poly([
    [50, 2],
    [98, 50],
    [50, 98],
    [2, 50],
  ]),
  crown: "M7 26 L22 6 L36 20 L50 3 L64 20 L78 6 L93 26 V52 C93 74 74 88 50 96 C26 88 7 74 7 52 Z",
  rosette: rosettePath(50, 50, 40, 55, 12),
  octagon: poly([
    [31, 5],
    [69, 5],
    [95, 31],
    [95, 69],
    [69, 95],
    [31, 95],
    [5, 69],
    [5, 31],
  ]),
  pennant: "M9 6 H91 V95 L50 76 L9 95 Z",
  ushield: "M7 7 H93 V54 C93 79 74 96 50 96 C26 96 7 79 7 54 Z",
  drop: "M50 4 C76 4 93 20 93 44 C93 68 70 84 50 97 C30 84 7 68 7 44 C7 20 24 4 50 4 Z",
  star: starPath(50, 55, 49, 25, 5),
  heater: "M7 6 L50 15 L93 6 V50 C93 72 73 87 50 96 C27 87 7 72 7 50 Z",
  square: roundRect(7, 7, 86, 86, 14),
  pentagon: regular(50, 53, 47, 5),
  back: roundRect(8, 8, 84, 84, 26),
};

/** Desen: 100×100 kutuda ikinci renkle (rozet silüetine kırpılır). */
function Pattern({ pattern, fill }: { pattern: UclePattern; fill: string }) {
  switch (pattern) {
    case "stripes":
      return (
        <G fill={fill}>
          {[2, 4].map((i) => (
            <Rect key={i} x={i * (100 / 7)} y={0} width={100 / 7} height={100} />
          ))}
        </G>
      );
    case "hoops":
      return (
        <G fill={fill}>
          {[2, 4].map((i) => (
            <Rect key={i} x={0} y={i * (100 / 7)} width={100} height={100 / 7} />
          ))}
        </G>
      );
    case "halves":
      return <Rect x={50} y={0} width={50} height={100} fill={fill} />;
    case "sash":
      return <Polygon points="0,14 14,0 100,86 86,100" fill={fill} transform="translate(-4 4) scale(1.08)" />;
    case "chevron":
      return <Polygon points="0,30 50,62 100,30 100,52 50,84 0,52" fill={fill} />;
    case "quarters":
      return (
        <G fill={fill}>
          <Rect x={50} y={0} width={50} height={50} />
          <Rect x={0} y={50} width={50} height={50} />
        </G>
      );
    case "band":
      return <Rect x={36} y={0} width={28} height={100} fill={fill} />;
    case "hband":
      return <Rect x={0} y={30} width={100} height={24} fill={fill} />;
    case "checks":
      return (
        <G fill={fill}>
          {Array.from({ length: 9 }, (_, i) => {
            const cx = i % 3;
            const cy = Math.floor(i / 3);
            return (cx + cy) % 2 ? <Rect key={i} x={7 + cx * 28.7} y={7 + cy * 28.7} width={28.7} height={28.7} /> : null;
          })}
        </G>
      );
    case "diagonal":
      return <Polygon points="100,0 100,100 0,100" fill={fill} />;
    case "disc":
      return <Circle cx={50} cy={57} r={15} fill={fill} />;
    case "cross":
      return (
        <G fill={fill}>
          <Rect x={41} y={0} width={18} height={100} />
          <Rect x={0} y={36} width={100} height={18} />
        </G>
      );
    case "pinstripes":
      return (
        <G fill={fill}>
          {[20, 35, 50, 65, 80].map((x) => (
            <Rect key={x} x={x - 2.5} y={0} width={5} height={100} />
          ))}
        </G>
      );
    case "yoke":
      return <Polygon points="0,0 100,0 100,34 50,52 0,34" fill={fill} />;
  }
}

/* ───────────────────────────── çizim ───────────────────────────── */

/** Rozet çevresindeki SVG payı (kenar çizgisi ve gölge taşabilsin). */
const PAD = 4;

interface Props {
  kind: number;
  /** Genişlik ve toplam yükseklik (kalınlık dahil). */
  w: number;
  h: number;
  /** Alt kalınlık (2.5D). */
  slab: number;
  /** Ters karo: tür gizli. */
  back?: boolean;
  /** Gölge çizilmesin (rafta / uçuşta kendi gölgesi var). */
  noShadow?: boolean;
}

function geometry(w: number, h: number, slab: number) {
  const faceH = h - slab;
  const sx = w / 100;
  const sy = faceH / 100;
  return { faceH, sx, sy, slabU: slab / sy };
}

function TileFaceBase({ kind, w, h, slab, back, noShadow }: Props) {
  const k = UCLE_KINDS[kind % UCLE_KINDS.length];
  const shape = back ? "back" : k.shape;
  const d = SHAPES[shape];
  const { sx, sy, slabU } = geometry(w, h, slab);
  const clipId = `ucs-${shape}`;
  // Kenar çizgisi kalınlığı (birim) — küçük karoda oransal olarak kalın kalır.
  const rimW = w < 40 ? 11 : 9;
  const shadowDy = slabU + 2.5 / sy;
  return (
    <Svg width={w + PAD * 2} height={h + PAD * 2} style={{ position: "absolute", left: -PAD, top: -PAD }} pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={d} />
        </ClipPath>
        <LinearGradient id="ucgloss" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLE_COLORS.white} stopOpacity={0.34} />
          <Stop offset="0.48" stopColor={UCLE_COLORS.white} stopOpacity={0.04} />
          <Stop offset="0.52" stopColor={UCLE_COLORS.dark} stopOpacity={0} />
          <Stop offset="1" stopColor={UCLE_COLORS.dark} stopOpacity={0.4} />
        </LinearGradient>
        <LinearGradient id="ucrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLE_COLORS.rimHi} />
          <Stop offset="0.35" stopColor={UCLE_COLORS.rim} />
          <Stop offset="1" stopColor={UCLE_COLORS.rimDeep} />
        </LinearGradient>
      </Defs>
      <G transform={`translate(${PAD} ${PAD}) scale(${sx} ${sy})`}>
        {/* Yumuşak düşen gölge */}
        {noShadow ? null : (
          <Path d={d} transform={`translate(${1.6 / sx} ${shadowDy})`} fill={UCLE_COLORS.shadow} stroke={UCLE_COLORS.shadow} strokeWidth={rimW} strokeLinejoin="round" />
        )}
        {/* Metal kalınlık: alttaki koyu kenar + orta ton */}
        <Path d={d} transform={`translate(0 ${slabU})`} fill={UCLE_COLORS.rimEdge} stroke={UCLE_COLORS.rimEdge} strokeWidth={rimW + 1.5} strokeLinejoin="round" />
        <Path d={d} transform={`translate(0 ${slabU * 0.55})`} fill={UCLE_COLORS.rimDeep} stroke={UCLE_COLORS.rimDeep} strokeWidth={rimW + 1.5} strokeLinejoin="round" />
        {/* Emaye yüz: zemin + forma deseni + parlaklık, silüete kırpılı */}
        <G clipPath={`url(#${clipId})`}>
          <Rect x={0} y={0} width={100} height={100} fill={back ? UCLE_COLORS.back : k.face} />
          {back ? (
            <G fill={UCLE_COLORS.backDeep} opacity={0.55}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <Rect key={i} x={i * 16 - 8} y={0} width={7} height={100} />
              ))}
            </G>
          ) : (
            <Pattern pattern={k.pattern} fill={k.trim} />
          )}
          <Rect x={0} y={0} width={100} height={100} fill="url(#ucgloss)" />
          <Path d="M12 34 C14 18 28 10 46 10 C34 14 24 22 20 36 C18 42 11 41 12 34 Z" fill={UCLE_COLORS.white} opacity={0.5} />
        </G>
        {/* Altın çerçeve: koyu ince çizgi (iki yanda) + parlak metal bant */}
        <Path d={d} fill="none" stroke={UCLE_COLORS.rimEdge} strokeWidth={rimW + 2} strokeLinejoin="round" />
        <Path d={d} fill="none" stroke="url(#ucrim)" strokeWidth={rimW - 1.5} strokeLinejoin="round" />
        {back ? (
          <SvgText x={50} y={66} fontSize={46} fontFamily={fonts.bold} fill={UCLE_COLORS.backInk} textAnchor="middle">
            ?
          </SvgText>
        ) : null}
      </G>
    </Svg>
  );
}

export const TileFace = memo(TileFaceBase);

interface SilProps {
  kind: number;
  w: number;
  h: number;
  slab: number;
  back?: boolean;
  color: string;
  /** Örtünün saydamlığı (tek parça grup olarak uygulanır: üst üste binen parçalar koyulaşmaz). */
  alpha?: number;
  /** "fill": tüm rozet (yüz + kalınlık) tek renk — karartma / kilit örtüsü. "ring": yalnız dış hat — ipucu parlaması. */
  mode: "fill" | "ring";
  /** "ring" kalınlığı (px). */
  ring?: number;
  /** Kesikli hat (zincir). */
  dashed?: boolean;
}

/** Rozetin silüeti (üst örtüler için: kapalı karartması, kilit örtüsü, ipucu halesi). */
function TileSilhouetteBase({ kind, w, h, slab, back, color, alpha = 1, mode, ring = 5, dashed }: SilProps) {
  const k = UCLE_KINDS[kind % UCLE_KINDS.length];
  const d = SHAPES[back ? "back" : k.shape];
  const { sx, sy, slabU } = geometry(w, h, slab);
  const rimW = w < 40 ? 11 : 9;
  const pad = PAD + 4;
  return (
    <Svg width={w + pad * 2} height={h + pad * 2} style={{ position: "absolute", left: -pad, top: -pad }} pointerEvents="none">
      <G transform={`translate(${pad} ${pad}) scale(${sx} ${sy})`} opacity={alpha}>
        {mode === "fill" ? (
          <>
            <Path d={d} transform={`translate(0 ${slabU})`} fill={color} stroke={color} strokeWidth={rimW + 2} strokeLinejoin="round" />
            <Path d={d} transform={`translate(0 ${slabU * 0.5})`} fill={color} stroke={color} strokeWidth={rimW + 2} strokeLinejoin="round" />
            <Path d={d} fill={color} stroke={color} strokeWidth={rimW + 2} strokeLinejoin="round" />
          </>
        ) : (
          <Path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={ring / sx}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={dashed ? `${ring * 1.6 / sx} ${ring * 1.1 / sx}` : undefined}
          />
        )}
      </G>
    </Svg>
  );
}

export const TileSilhouette = memo(TileSilhouetteBase);
