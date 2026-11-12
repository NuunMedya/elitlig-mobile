import React, { memo } from "react";
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Rect, Stop } from "react-native-svg";
import { radius } from "@/theme";
import { UCLE_UI as UI } from "@/lib/puzzle/uclePalette";

/** Çerçevenin ahşap kenar kalınlığı. */
export const FRAME_RIM = 7;
/** Çerçevenin alt kalınlığı (3D). */
export const FRAME_DEPTH = 5;

/**
 * Tahta zemini: ahşap çerçeve içinde biçilmiş çim keçe (yatay şeritler),
 * orta çizgi ve orta yuvarlak. Saf çizim; dokunmayı engellemez.
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
        <LinearGradient id="ucRim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UI.rimHi} />
          <Stop offset="1" stopColor={UI.rim} />
        </LinearGradient>
        <LinearGradient id="ucFeltShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UI.feltDeep} stopOpacity={0.55} />
          <Stop offset="0.12" stopColor={UI.feltDeep} stopOpacity={0} />
          <Stop offset="0.85" stopColor={UI.feltDeep} stopOpacity={0} />
          <Stop offset="1" stopColor={UI.feltDeep} stopOpacity={0.5} />
        </LinearGradient>
        <ClipPath id="ucFeltClip">
          <Rect x={ix} y={iy} width={iw} height={ih} rx={r - FRAME_RIM} />
        </ClipPath>
      </Defs>
      {/* Alt kalınlık + ahşap kenar */}
      <Rect x={0} y={FRAME_DEPTH} width={width} height={height - FRAME_DEPTH} rx={r} fill={UI.rimDeep} />
      <Rect x={0} y={0} width={width} height={height - FRAME_DEPTH} rx={r} fill="url(#ucRim)" />
      {/* Keçe */}
      <G clipPath="url(#ucFeltClip)">
        <Rect x={ix} y={iy} width={iw} height={ih} fill={UI.felt} />
        {Array.from({ length: stripes }, (_, i) =>
          i % 2 ? <Rect key={i} x={ix} y={iy + i * sh} width={iw} height={sh} fill={UI.feltStripe} /> : null,
        )}
        <Line x1={ix} y1={cy} x2={ix + iw} y2={cy} stroke={UI.feltLine} strokeWidth={2} />
        <Circle cx={cx} cy={cy} r={Math.min(iw, ih) * 0.18} stroke={UI.feltLine} strokeWidth={2} fill="none" />
        <Circle cx={cx} cy={cy} r={3} fill={UI.feltLine} />
        <Rect x={ix + iw * 0.3} y={iy - 2} width={iw * 0.4} height={ih * 0.1} stroke={UI.feltLine} strokeWidth={2} fill="none" />
        <Rect x={ix + iw * 0.3} y={iy + ih * 0.9 + 2} width={iw * 0.4} height={ih * 0.1} stroke={UI.feltLine} strokeWidth={2} fill="none" />
        <Rect x={ix} y={iy} width={iw} height={ih} fill="url(#ucFeltShade)" />
      </G>
      <Rect x={ix} y={iy} width={iw} height={ih} rx={r - FRAME_RIM} fill="none" stroke={UI.rimDeep} strokeWidth={2} />
    </Svg>
  );
}

export const BoardFrame = memo(BoardFrameBase);
