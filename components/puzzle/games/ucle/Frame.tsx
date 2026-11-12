import React, { memo } from "react";
import Svg, { Circle, ClipPath, Defs, G, Line, Rect } from "react-native-svg";
import { radius } from "@/theme";
import { UCLE_UI as UI } from "@/lib/puzzle/uclePalette";

/** Çerçeve bandının kalınlığı. */
export const FRAME_RIM = 7;
/** Çerçevenin alt kalınlığı (3D). */
export const FRAME_DEPTH = 5;

/**
 * Tahta zemini — sade: koyu lacivert çerçeve, yumuşak alt dudak; içinde
 * parlak yeşil biçim şeritleri ve soluk saha çizgileri. Saf çizim.
 */
function BoardFrameBase({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const r = radius.xxl;
  const ix = FRAME_RIM;
  const iy = FRAME_RIM;
  const iw = width - FRAME_RIM * 2;
  const ih = height - FRAME_DEPTH - FRAME_RIM * 2;
  const stripes = Math.max(4, Math.round(ih / 46));
  const sh = ih / stripes;
  const cx = ix + iw / 2;
  const cy = iy + ih / 2;
  return (
    <Svg width={width} height={height} style={{ position: "absolute", left, top }} pointerEvents="none">
      <Defs>
        <ClipPath id="ucFeltClip">
          <Rect x={ix} y={iy} width={iw} height={ih} rx={r - FRAME_RIM} />
        </ClipPath>
      </Defs>
      {/* Sade koyu çerçeve + yumuşak alt dudak (kalın kontur yok). */}
      <Rect x={0} y={FRAME_DEPTH} width={width} height={height - FRAME_DEPTH} rx={r} fill={UI.lip} />
      <Rect x={0} y={0} width={width} height={height - FRAME_DEPTH} rx={r} fill={UI.pitchFrame} />
      <Rect x={0.5} y={0.5} width={width - 1} height={height - FRAME_DEPTH - 1} rx={r} fill="none" stroke={UI.outline} strokeWidth={1} />
      {/* Keçe: iki tonlu şerit + soluk saha çizgileri */}
      <G clipPath="url(#ucFeltClip)">
        <Rect x={ix} y={iy} width={iw} height={ih} fill={UI.felt} />
        {Array.from({ length: stripes }, (_, i) => (i % 2 ? <Rect key={i} x={ix} y={iy + i * sh} width={iw} height={sh} fill={UI.feltStripe} /> : null))}
        <G stroke={UI.feltLine} strokeOpacity={0.6} strokeWidth={1.5} fill="none">
          <Rect x={ix + 6} y={iy + 6} width={iw - 12} height={ih - 12} />
          <Line x1={ix + 6} y1={cy} x2={ix + iw - 6} y2={cy} />
          <Circle cx={cx} cy={cy} r={Math.min(iw, ih) * 0.18} />
        </G>
      </G>
      <Rect x={ix} y={iy} width={iw} height={ih} rx={r - FRAME_RIM} fill="none" stroke={UI.pitchEdge} strokeWidth={1.5} />
    </Svg>
  );
}

export const BoardFrame = memo(BoardFrameBase);
