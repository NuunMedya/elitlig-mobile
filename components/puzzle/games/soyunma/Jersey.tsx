/**
 * Forma silueti (react-native-svg). Renk + DESEN + NUMARA birlikte ayırt
 * edicidir (renk körlüğü). Gizli forma koyu gövde üstünde "?" taşır.
 */
import { memo } from "react";
import Svg, { ClipPath, Defs, G, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { CARTOON } from "@/lib/game/cartoon";
import { fonts, type } from "@/theme";
import { SOYUNMA_HIDDEN, SOYUNMA_LOCKER, SOYUNMA_SHADE as SH, SOYUNMA_TEAMS } from "@/lib/puzzle/soyunmaPalette";

/** 48×40 görünüm kutusunda forma gövdesi (kollar dahil). */
const SHIRT =
  "M15 2 L4 7.5 L0.8 17 L8.5 20 L10.5 15.5 L10.5 38.5 Q24 40 37.5 38.5 L37.5 15.5 L39.5 20 L47.2 17 L44 7.5 L33 2 Q29.5 7.5 24 7.5 Q18.5 7.5 15 2 Z";
const COLLAR = "M15 2 Q18.5 7.5 24 7.5 Q29.5 7.5 33 2 L30.5 1.2 Q27.5 5 24 5 Q20.5 5 17.5 1.2 Z";
const NUMBER_SIZE = type.scoreXs.fontSize;

interface JerseyProps {
  /** SOYUNMA_TEAMS sırası; -1 → gizli forma. */
  team: number;
  width: number;
  height: number;
}

const OUTLINE_W = 2.6;
/** Lacivert konturun üstünde koyu mürekkep okunmaz: koyu rakamlar beyaza döner. */
function inkOn(t: { ink: string }) {
  const n = parseInt(t.ink.slice(1), 16);
  const lum = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
  return lum > 140 ? t.ink : SH.light;
}
/** Omuz parlaması (sol üst): çizgi film "shine" şeridi. */
const SHINE = "M7 9.5 L14.5 5.5 Q15.6 5 16 6.2 L16.3 7.4 Q16.4 8.4 15.4 8.9 L8.6 12.6 Q7.4 13.2 6.9 12 L6.6 10.9 Q6.4 10 7 9.5 Z";

function JerseyBase({ team, width, height }: JerseyProps) {
  const clip = `sjc${team < 0 ? "h" : team}`;
  if (team < 0) {
    return (
      <Svg width={width} height={height} viewBox="-3 -4 54 48">
        <Path d={SHIRT} transform="translate(0 2.4)" fill={SH.drop} />
        <Path d={SHIRT} fill={SOYUNMA_HIDDEN.body} stroke={CARTOON.outline} strokeWidth={OUTLINE_W} strokeLinejoin="round" />
        <Path d={COLLAR} fill={SOYUNMA_HIDDEN.trim} stroke={CARTOON.outline} strokeWidth={1.4} strokeLinejoin="round" />
        <Path d={SHINE} fill={SH.light} fillOpacity={0.22} />
        <SvgText
          x={24}
          y={31}
          fontSize={NUMBER_SIZE + 4}
          fontFamily={fonts.bold}
          fill={SOYUNMA_HIDDEN.ink}
          stroke={CARTOON.outline}
          strokeWidth={1.4}
          textAnchor="middle"
        >
          ?
        </SvgText>
      </Svg>
    );
  }
  const t = SOYUNMA_TEAMS[team % SOYUNMA_TEAMS.length];
  const patch = t.pattern === "yarim" || t.pattern === "cizgili" || t.pattern === "bantli";
  // Çizgi film forması: düz doygun dolgu + desen, sol omuzda parlama, alt
  // kenarda koyu bant, kalın lacivert kontur; numara lacivert konturlu.
  return (
    <Svg width={width} height={height} viewBox="-3 -4 54 48">
      <Defs>
        <ClipPath id={clip}>
          <Path d={SHIRT} />
        </ClipPath>
      </Defs>
      <Path d={SHIRT} transform="translate(0 2.4)" fill={SH.drop} />
      <Path d={SHIRT} fill={t.primary} />
      <G clipPath={`url(#${clip})`}>
        {t.pattern === "cizgili" ? (
          <G fill={t.secondary}>
            <Rect x={13.5} y={0} width={3.6} height={40} />
            <Rect x={22.2} y={0} width={3.6} height={40} />
            <Rect x={30.9} y={0} width={3.6} height={40} />
          </G>
        ) : null}
        {t.pattern === "bantli" ? (
          <G fill={t.secondary}>
            <Rect x={0} y={11} width={48} height={4} />
            <Rect x={0} y={20} width={48} height={4} />
            <Rect x={0} y={29} width={48} height={4} />
          </G>
        ) : null}
        {t.pattern === "yarim" ? <Rect x={24} y={0} width={24} height={40} fill={t.secondary} /> : null}
        {t.pattern === "kusak" ? <Polygon points="10,4 18,4 40,40 30,40" fill={t.secondary} /> : null}
        {t.pattern === "omuz" ? (
          <G fill={t.secondary}>
            <Polygon points="0,0 15,0 12,14 0,20" />
            <Polygon points="48,0 33,0 36,14 48,20" />
          </G>
        ) : null}
        {t.pattern === "duz" ? (
          <G fill={t.secondary}>
            <Rect x={0} y={16} width={10.5} height={2.4} transform="rotate(-20 5 17)" />
            <Rect x={37.5} y={16} width={10.5} height={2.4} transform="rotate(20 43 17)" />
          </G>
        ) : null}
        {/* Sağ kenar gölgesi + etek bandı (düz, çizgi film tonu). */}
        <Path d="M37.5 15.5 L37.5 40 L33 40 Q35 26 33.5 9 Z" fill={SH.dark} fillOpacity={0.14} />
        <Rect x={0} y={35} width={48} height={6} fill={SH.dark} fillOpacity={0.16} />
        <Path d={SHINE} fill={SH.light} fillOpacity={0.55} />
      </G>
      <Path d={SHIRT} fill="none" stroke={CARTOON.outline} strokeWidth={OUTLINE_W} strokeLinejoin="round" />
      <Path d="M10.5 15.5 L10.5 22" stroke={CARTOON.outline} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M37.5 15.5 L37.5 22" stroke={CARTOON.outline} strokeWidth={1.3} strokeLinecap="round" />
      <Path d={COLLAR} fill={t.secondary} stroke={CARTOON.outline} strokeWidth={1.4} strokeLinejoin="round" />
      {/* Numara yaması: iki renkli desende numara okunaklı kalsın. */}
      {patch ? <Rect x={16} y={15} width={16} height={15} rx={4} fill={t.primary} stroke={CARTOON.outline} strokeWidth={1.2} /> : null}
      {/* Önce kalın lacivert kontur, üstüne dolgu: rakam kalın ve okunaklı. */}
      <SvgText
        x={24}
        y={28}
        fontSize={t.number >= 10 ? NUMBER_SIZE - 2 : NUMBER_SIZE + 1}
        fontFamily={fonts.bold}
        fill={CARTOON.outline}
        stroke={CARTOON.outline}
        strokeWidth={3}
        strokeLinejoin="round"
        textAnchor="middle"
      >
        {String(t.number)}
      </SvgText>
      <SvgText x={24} y={28} fontSize={t.number >= 10 ? NUMBER_SIZE - 2 : NUMBER_SIZE + 1} fontFamily={fonts.bold} fill={inkOn(t)} textAnchor="middle">
        {String(t.number)}
      </SvgText>
    </Svg>
  );
}

export const Jersey = memo(JerseyBase);

interface CrestProps {
  team: number;
  size: number;
}

/** Takım hazır rozeti — arma benzeri kalkan, takım renkleri + numara. */
function CrestBase({ team, size }: CrestProps) {
  const t = SOYUNMA_TEAMS[team % SOYUNMA_TEAMS.length];
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M16 1.6 L29 5.4 L29 15 Q29 25 16 30.6 Q3 25 3 15 L3 5.4 Z" fill={SOYUNMA_LOCKER.crest} stroke={CARTOON.outline} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M16 4.6 L26 7.6 L26 15 Q26 23 16 27.6 Q6 23 6 15 L6 7.6 Z" fill={t.primary} stroke={CARTOON.outline} strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M16 4.6 L26 7.6 L26 11 L6 11 L6 7.6 Z" fill={t.secondary} stroke={CARTOON.outline} strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M6.5 13 Q7 8.5 11 8.2" stroke={SOYUNMA_LOCKER.crestShine} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <SvgText x={16} y={23} fontSize={type.caption.fontSize} fontFamily={fonts.bold} fill={t.ink} stroke={CARTOON.outline} strokeWidth={0.9} textAnchor="middle">
        {String(t.number)}
      </SvgText>
    </Svg>
  );
}

export const Crest = memo(CrestBase);
