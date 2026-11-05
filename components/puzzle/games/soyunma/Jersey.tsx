/**
 * Forma silueti (react-native-svg). Renk + DESEN + NUMARA birlikte ayırt
 * edicidir (renk körlüğü). Gizli forma koyu gövde üstünde "?" taşır.
 */
import { memo } from "react";
import Svg, { ClipPath, Defs, G, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { fonts, type } from "@/theme";
import { SOYUNMA_HIDDEN, SOYUNMA_LOCKER, SOYUNMA_TEAMS } from "@/lib/puzzle/soyunmaPalette";

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

function JerseyBase({ team, width, height }: JerseyProps) {
  const clip = `sjc${team < 0 ? "h" : team}`;
  if (team < 0) {
    return (
      <Svg width={width} height={height} viewBox="0 0 48 40">
        <Path d={SHIRT} fill={SOYUNMA_HIDDEN.body} stroke={SOYUNMA_HIDDEN.trim} strokeWidth={1.2} />
        <Path d={COLLAR} fill={SOYUNMA_HIDDEN.trim} />
        <SvgText
          x={24}
          y={30}
          fontSize={NUMBER_SIZE + 2}
          fontFamily={fonts.bold}
          fill={SOYUNMA_HIDDEN.ink}
          textAnchor="middle"
        >
          ?
        </SvgText>
      </Svg>
    );
  }
  const t = SOYUNMA_TEAMS[team % SOYUNMA_TEAMS.length];
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <ClipPath id={clip}>
          <Path d={SHIRT} />
        </ClipPath>
      </Defs>
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
      </G>
      <Path d={COLLAR} fill={t.secondary} />
      {/* Numara yaması: iki renkli desende numara okunaklı kalsın. */}
      {t.pattern === "yarim" || t.pattern === "cizgili" || t.pattern === "bantli" ? (
        <Rect x={16.5} y={15.5} width={15} height={14.5} rx={3} fill={t.primary} />
      ) : null}
      <SvgText
        x={24}
        y={27.5}
        fontSize={t.number >= 10 ? NUMBER_SIZE - 3 : NUMBER_SIZE}
        fontFamily={fonts.bold}
        fill={t.ink}
        textAnchor="middle"
      >
        {String(t.number)}
      </SvgText>
      <Path d={SHIRT} fill="none" stroke={SOYUNMA_LOCKER.woodDark} strokeOpacity={0.35} strokeWidth={1} />
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
      <Path d="M16 1 L29 5 L29 15 Q29 25 16 31 Q3 25 3 15 L3 5 Z" fill={SOYUNMA_LOCKER.crest} />
      <Path d="M16 4 L26 7 L26 15 Q26 23 16 28 Q6 23 6 15 L6 7 Z" fill={t.primary} />
      <Path d="M16 4 L26 7 L26 11 L6 11 L6 7 Z" fill={t.secondary} />
      <SvgText x={16} y={23} fontSize={type.caption.fontSize} fontFamily={fonts.bold} fill={t.ink} textAnchor="middle">
        {String(t.number)}
      </SvgText>
    </Svg>
  );
}

export const Crest = memo(CrestBase);
